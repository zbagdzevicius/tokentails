import { Injectable } from '@nestjs/common';
import {
    FOUNDER_OFFER_GAP_MS,
    OFFER_SCREENS,
    PAWLEGENDS_SKUS,
    PawlegendsOffer,
    PawlegendsOfferKind,
    PawlegendsOfferQuery,
    PawlegendsOfferResponse,
    PawlegendsSku,
    STARTER_WINDOW_MS,
} from './pawlegends.contracts';
import { PAWLEGENDS_ERRORS } from './pawlegends.errors';
import { PawlegendsStore } from './pawlegends.schema';
import { PawlegendsAccountService } from './pawlegends-account.service';
import { Env } from './pawlegends-env';
import { isDeviceId, PawlegendsIdentity, PawlegendsStripeService } from './pawlegends-stripe.service';

/*
 * The POC offer engine (POC.md §8.4). Input: device id, session count, completed matches, first win done, owned-cat
 * count (and a token, if the host has one). Output: no offer, or one.
 *
 *   1. session >= 2, first win done, starter not owned, and never shown or its 48 h window still open → pl_starter
 *   2. completed matches >= 3, no Founder owned, not shown in the last 7 days → pl_founder + pl_founder_legend
 *
 * Never in session 1, outside the lobby and results screens, in app builds, or at the spend cap. At most one card per
 * session: once `POST /pawlegends/offer/seen` records a card for a session, that session gets no other.
 */

const toInt = (value: unknown): number => {
    const n = typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : -1;
};
const toBool = (value: unknown) => value === true || value === 'true' || value === '1';

export interface ParsedOfferQuery {
    deviceId: string;
    session: number;
    matches: number;
    firstWin: boolean;
    ownedCats: number;
    app: boolean;
    screen: string;
    token?: string;
}

/** Validates and coerces the query string (400 on a bad device id or counts). */
export function parseOfferQuery(raw: Partial<Record<keyof PawlegendsOfferQuery, unknown>>): ParsedOfferQuery {
    if (!isDeviceId(raw?.deviceId)) throw PAWLEGENDS_ERRORS.invalid('deviceId is required');
    const session = toInt(raw.session);
    const matches = toInt(raw.matches);
    if (session < 0 || matches < 0) throw PAWLEGENDS_ERRORS.invalid('session and matches must be counts');
    return {
        deviceId: raw.deviceId,
        session,
        matches,
        firstWin: toBool(raw.firstWin),
        ownedCats: Math.max(0, toInt(raw.ownedCats)),
        app: toBool(raw.app),
        screen: typeof raw.screen === 'string' ? raw.screen : 'lobby',
        token: typeof raw.token === 'string' ? raw.token : undefined,
    };
}

/** The cheapest SKU of an offer: the card is pointless when even that would pass the spend cap. */
const cheapestCents = (skus: PawlegendsSku[]) =>
    Math.min(...skus.map(sku => Math.min(PAWLEGENDS_SKUS[sku].cents.eur, PAWLEGENDS_SKUS[sku].cents.usd)));

@Injectable()
export class PawlegendsOfferService {
    now: () => Date = () => new Date();

    constructor(
        private readonly store: PawlegendsStore,
        private readonly stripe: PawlegendsStripeService,
        private readonly account: PawlegendsAccountService
    ) {}

    private identity(q: ParsedOfferQuery, env: Env): PawlegendsIdentity {
        const fromToken = this.account.identityOfToken(this.account.readToken(q.token, env));
        return { ...fromToken, deviceId: q.deviceId };
    }

    async offer(raw: Partial<Record<keyof PawlegendsOfferQuery, unknown>>, env: Env = process.env) {
        const q = parseOfferQuery(raw);
        const response: PawlegendsOfferResponse = { offer: null };
        if (q.app || q.session < 2 || !(OFFER_SCREENS as readonly string[]).includes(q.screen)) return response;

        const state = (await this.store.offers.findOne({ deviceId: q.deviceId }).lean()) as any;
        if (state && state.lastShownSession === q.session) return response;

        const identity = this.identity(q, env);
        const owned = await this.stripe.activeSkus(identity);
        const capLeft = await this.stripe.capLeftCents(identity);
        const now = this.now().getTime();

        let offer: PawlegendsOffer | null = null;
        const starterShown = state?.starterFirstShownAt ? new Date(state.starterFirstShownAt).getTime() : null;
        if (
            q.firstWin &&
            !owned.has('pl_starter') &&
            (starterShown === null || now < starterShown + STARTER_WINDOW_MS)
        ) {
            offer = {
                kind: 'starter',
                skus: ['pl_starter'],
                endsAt: (starterShown ?? now) + STARTER_WINDOW_MS,
            };
        } else {
            const founderShown = state?.founderLastShownAt ? new Date(state.founderLastShownAt).getTime() : null;
            const ownsFounder = ['pl_founder', 'pl_founder_legend', 'pl_founder_legend_upgrade'].some(sku =>
                owned.has(sku as PawlegendsSku)
            );
            if (
                q.matches >= 3 &&
                !ownsFounder &&
                (founderShown === null || now >= founderShown + FOUNDER_OFFER_GAP_MS)
            ) {
                const seatsLeft = await this.stripe.legendSeatsLeft();
                offer = {
                    kind: 'founder',
                    skus: seatsLeft > 0 ? ['pl_founder', 'pl_founder_legend'] : ['pl_founder'],
                    endsAt: null,
                };
            }
        }
        if (offer && cheapestCents(offer.skus) > capLeft) offer = null;
        response.offer = offer;
        return response;
    }

    /** POST /pawlegends/offer/seen { deviceId, kind, session }: starts the starter window, records the session. */
    async seen(body: { deviceId?: unknown; kind?: unknown; session?: unknown }): Promise<{ ok: boolean }> {
        if (!isDeviceId(body?.deviceId)) throw PAWLEGENDS_ERRORS.invalid('deviceId is required');
        const kind = body.kind as PawlegendsOfferKind;
        if (kind !== 'starter' && kind !== 'founder')
            throw PAWLEGENDS_ERRORS.invalid('kind must be starter or founder');
        const session = toInt(body.session);
        if (session < 0) throw PAWLEGENDS_ERRORS.invalid('session must be a count');
        const now = this.now();
        const state = (await this.store.offers.findOne({ deviceId: body.deviceId }).lean()) as any;
        const set: Record<string, unknown> = { lastShownSession: session };
        if (kind === 'starter' && !state?.starterFirstShownAt) set.starterFirstShownAt = now;
        if (kind === 'founder') set.founderLastShownAt = now;
        await this.store.offers.updateOne({ deviceId: body.deviceId }, { $set: set }, { upsert: true });
        return { ok: true };
    }
}
