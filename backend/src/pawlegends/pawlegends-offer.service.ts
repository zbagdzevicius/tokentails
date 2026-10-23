import { Inject, Injectable, Optional } from '@nestjs/common';
import {
    MEET_OFFER_GAP_MS,
    MEET_PRICE_CAP_CENTS,
    MEET_SAME_CAT_GAP_MS,
    OFFER_SCREENS,
    PawlegendsOffer,
    PawlegendsOfferQuery,
    PawlegendsOfferResponse,
} from './pawlegends.contracts';
import { PAWLEGENDS_ERRORS } from './pawlegends.errors';
import { PawlegendsStore } from './pawlegends.schema';
import { PawlegendsAccountService } from './pawlegends-account.service';
import { Env } from './pawlegends-env';
import { isDeviceId, PawlegendsIdentity, PawlegendsStripeService } from './pawlegends-stripe.service';

/*
 * The offer engine since the Token Tails integration (docs/plans/moba integration plan section 2). The game sells
 * nothing itself: its one card is "Meet <cat>", which opens the Token Tails $5 named-cat checkout (direct purchase:
 * the cat, its element and its name are on screen before paying; nothing random, never a pack).
 *
 * Input: device id, the host's session count, the screen, and the host's featured cats (`catalogIds`). Output: one
 * `{kind: 'meet', catalogId}` for the first featured cat the server would sell (`ShelterCatSaleService.check`), or
 * null.
 *
 * Never in session 1, outside the lobby and results screens, in app builds, or when the device's age band and
 * 30-day spend cap leave less than the cat's price (under 16 leaves nothing). At most one card per session and one a
 * day per device, and the same cat not again for 3 days: once `POST /pawlegends/offer/seen` records a card for a
 * session, that session gets no other.
 */

/**
 * The one method of `ShelterCatSaleService` the engine needs, behind a token (`app.module.ts` maps it with
 * `useExisting`), so this file never imports the cat service and its AI clients.
 */
export const PAWLEGENDS_CAT_SALE = 'PAWLEGENDS_CAT_SALE';
export interface PawlegendsCatSale {
    check(catId: unknown): Promise<{ ok: boolean }>;
}

const toInt = (value: unknown): number => {
    const n = typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : -1;
};
const toBool = (value: unknown) => value === true || value === 'true' || value === '1';
const CATALOG_ID = /^[0-9a-f]{24}$/;

export interface ParsedOfferQuery {
    deviceId: string;
    session: number;
    catalogIds: string[];
    app: boolean;
    screen: string;
    token?: string;
}

/** Validates and coerces the query string (400 on a bad device id or session). Bad catalog ids are dropped. */
export function parseOfferQuery(raw: Partial<Record<keyof PawlegendsOfferQuery, unknown>>): ParsedOfferQuery {
    if (!isDeviceId(raw?.deviceId)) throw PAWLEGENDS_ERRORS.invalid('deviceId is required');
    const session = toInt(raw.session);
    if (session < 0) throw PAWLEGENDS_ERRORS.invalid('session must be a count');
    const ids = typeof raw.catalogIds === 'string' && raw.catalogIds.length <= 100 ? raw.catalogIds.split(',') : [];
    return {
        deviceId: raw.deviceId,
        session,
        catalogIds: [...new Set(ids.map(id => id.trim().toLowerCase()).filter(id => CATALOG_ID.test(id)))].slice(0, 2),
        app: toBool(raw.app),
        screen: typeof raw.screen === 'string' ? raw.screen : 'lobby',
        token: typeof raw.token === 'string' ? raw.token : undefined,
    };
}

@Injectable()
export class PawlegendsOfferService {
    now: () => Date = () => new Date();

    constructor(
        private readonly store: PawlegendsStore,
        private readonly stripe: PawlegendsStripeService,
        private readonly account: PawlegendsAccountService,
        @Optional() @Inject(PAWLEGENDS_CAT_SALE) private readonly catSale?: PawlegendsCatSale
    ) {}

    private identity(q: ParsedOfferQuery, env: Env): PawlegendsIdentity {
        const fromToken = this.account.identityOfToken(this.account.readToken(q.token, env));
        return { ...fromToken, deviceId: q.deviceId };
    }

    /** Is the cat sold on its own right now? Without the sale service (specs), a well-formed id counts. */
    private async forSale(catalogId: string): Promise<boolean> {
        if (!this.catSale) return CATALOG_ID.test(catalogId);
        const check = await this.catSale.check(catalogId);
        return check.ok;
    }

    async offer(raw: Partial<Record<keyof PawlegendsOfferQuery, unknown>>, env: Env = process.env) {
        const q = parseOfferQuery(raw);
        const response: PawlegendsOfferResponse = { offer: null };
        if (q.app || q.session < 2 || !(OFFER_SCREENS as readonly string[]).includes(q.screen)) return response;
        if (!q.catalogIds.length) return response;

        const state = (await this.store.offers.findOne({ deviceId: q.deviceId }).lean()) as any;
        if (state && state.lastShownSession === q.session) return response;
        const now = this.now().getTime();
        const lastMeet = state?.meetLastShownAt ? new Date(state.meetLastShownAt).getTime() : null;
        if (lastMeet !== null && now < lastMeet + MEET_OFFER_GAP_MS) return response;

        // The age band and the 30-day spend cap: no card the player could not buy (under 16 has no cap left).
        if ((await this.stripe.capLeftCents(this.identity(q, env))) < MEET_PRICE_CAP_CENTS) return response;

        const recent =
            lastMeet !== null && now < lastMeet + MEET_SAME_CAT_GAP_MS ? (state?.meetLastCatalogId as string) : null;
        for (const catalogId of q.catalogIds) {
            if (catalogId === recent) continue;
            if (await this.forSale(catalogId)) {
                const offer: PawlegendsOffer = { kind: 'meet', catalogId };
                response.offer = offer;
                break;
            }
        }
        return response;
    }

    /** POST /pawlegends/offer/seen { deviceId, kind: 'meet', catalogId, session }: records the session's one card. */
    async seen(body: {
        deviceId?: unknown;
        kind?: unknown;
        session?: unknown;
        catalogId?: unknown;
    }): Promise<{ ok: boolean }> {
        if (!isDeviceId(body?.deviceId)) throw PAWLEGENDS_ERRORS.invalid('deviceId is required');
        if (body.kind !== 'meet') throw PAWLEGENDS_ERRORS.invalid('kind must be meet');
        const session = toInt(body.session);
        if (session < 0) throw PAWLEGENDS_ERRORS.invalid('session must be a count');
        const catalogId = typeof body.catalogId === 'string' ? body.catalogId.toLowerCase() : '';
        if (!CATALOG_ID.test(catalogId)) throw PAWLEGENDS_ERRORS.invalid('catalogId is required');
        await this.store.offers.updateOne(
            { deviceId: body.deviceId },
            { $set: { lastShownSession: session, meetLastShownAt: this.now(), meetLastCatalogId: catalogId } },
            { upsert: true }
        );
        return { ok: true };
    }
}
