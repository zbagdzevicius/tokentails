import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { User } from 'src/user/user.schema';
import { memberName } from '../party/party-names';
import { pawlegendsError } from '../pawlegends.errors';
import { PawlegendsOwned, PawlegendsPurchase } from '../pawlegends.schema';
import { grantItems, ownedItemsOf } from '../pawlegends-season.service';
import { PawlegendsSocial } from '../social/social.schema';
import { displayNames } from '../social/display-name';
import {
    CREATOR_DEFAULT_SHARE_BPS,
    CREATOR_MAX_SHARE_BPS,
    creatorLinkLive,
    creatorPayouts,
    CreatorPayoutLine,
    FIRST_GIFT_COATS,
    INVITE_MATCHES,
    inviteCodeFrom,
    inviteExpiresAt,
    inviteKindOf,
    inviteLink,
    InviteMatch,
    inviteMatchCounts,
    INVITER_PENDING_CAP,
    INVITER_REWARD_CAP,
    isFirstGiftCoat,
    nextInviteCoat,
    normalizeCreatorCode,
    normalizeInviteCode,
} from './growth.rules';
import {
    PawlegendsCreator,
    PawlegendsCreatorLink,
    PawlegendsFirstGift,
    PawlegendsReferral,
    PawlegendsReferralCode,
} from './growth.schema';

/*
 * Invites, creator codes and the first-purchase gift (growth.rules.ts). Invites are free and allowed in the apps;
 * creator codes and the gift exist only at the web checkout (the apps sell nothing).
 *
 * Writes: the invite record and claims (routes), the invite's match counter (only `applyInviteProgress`, from the
 * `/live` save), the creator link (checkout), the gift row and coat (the Stripe webhook). Coats go into
 * `pawlegendsowned` like every store item (source 'invite' or 'gift'), so `/pawlegends/me` shows them at once.
 */

type AnyModel = any;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const isDuplicate = (error: unknown) => (error as { code?: unknown } | undefined)?.code === 11000;

export const GROWTH_ERRORS = {
    badCode: () => pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_INVITE_UNKNOWN', 'No invite with this code'),
    self: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVITE_SELF', 'That is your own invite code'),
    already: () =>
        pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_INVITE_USED', 'You have already accepted an invite'),
    device: () =>
        pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_INVITE_DEVICE', 'This device has already accepted an invite'),
    notEligible: () =>
        pawlegendsError(
            HttpStatus.FORBIDDEN,
            'PAWLEGENDS_INVITE_NOT_ELIGIBLE',
            'Invites are for new players and players back after 21 days'
        ),
    inviterFull: () =>
        pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_INVITE_FULL', 'This player has too many open invites'),
    needAccount: () =>
        pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to use invites'),
    creatorUnknown: () =>
        pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_CREATOR_UNKNOWN', 'No creator with this code'),
    giftUnavailable: () =>
        pawlegendsError(
            HttpStatus.CONFLICT,
            'PAWLEGENDS_GIFT_UNAVAILABLE',
            'The first-purchase gift is not available for this order'
        ),
};

/** One invite as the Social sheet shows it (names from the social profile, never an email). */
export interface InviteRowView {
    name: string;
    kind: string;
    matches: number;
    need: number;
    status: string;
    claimable: boolean;
}

export interface InviteStateView {
    code: string;
    link: string;
    need: number;
    /** Friends this player invited, newest first (at most 10). */
    invited: InviteRowView[];
    /** The invite this player accepted, if any. */
    accepted: InviteRowView | null;
    /** Rewards ready to claim now. */
    claimable: number;
    /** The coat the next claim gives (null: every invite coat is owned). */
    nextCoat: string | null;
    /** Coats earned as the inviter so far, and the cap. */
    earned: number;
    cap: number;
}

@Injectable()
export class GrowthService {
    private readonly logger = new Logger(GrowthService.name);
    now: () => Date = () => new Date();
    random: (n: number) => Uint8Array = n => randomBytes(n);

    constructor(
        @InjectModel(PawlegendsReferralCode.name) readonly codes: AnyModel,
        @InjectModel(PawlegendsReferral.name) readonly referrals: AnyModel,
        @InjectModel(PawlegendsCreator.name) readonly creators: AnyModel,
        @InjectModel(PawlegendsCreatorLink.name) readonly creatorLinks: AnyModel,
        @InjectModel(PawlegendsFirstGift.name) readonly gifts: AnyModel,
        @InjectModel(PawlegendsOwned.name) readonly owned: AnyModel,
        @InjectModel(PawlegendsPurchase.name) readonly purchases: AnyModel,
        @InjectModel(User.name) readonly users: AnyModel,
        @Optional() @InjectModel(PawlegendsSocial.name) readonly social?: AnyModel
    ) {}

    // -----------------------------------------------------------------------------------------------------------
    // Invites

    /** The account's invite code, made once (a clash with another account's code draws again). */
    async codeOf(accountId: string): Promise<string> {
        const row = await this.codes.findOne({ accountId }).lean();
        if (row?.code) return String(row.code);
        for (let i = 0; i < 6; i++) {
            const code = inviteCodeFrom(this.random(8));
            try {
                await this.codes.create({ accountId, code });
                return code;
            } catch (error) {
                if (!isDuplicate(error)) throw error;
                // the account raced itself (two first reads): the other write won
                const mine = await this.codes.findOne({ accountId }).lean();
                if (mine?.code) return String(mine.code);
            }
        }
        throw pawlegendsError(HttpStatus.SERVICE_UNAVAILABLE, 'PAWLEGENDS_INVITE_BUSY', 'Try again');
    }

    private async names(ids: string[]): Promise<Map<string, string>> {
        if (!this.social) return new Map(ids.map(id => [id, memberName(id)]));
        try {
            return await displayNames({ social: this.social }, ids);
        } catch {
            return new Map(ids.map(id => [id, memberName(id)]));
        }
    }

    private live(row: any, now: Date): any {
        // an unfinished invite past its window reads as expired (the status is not rewritten for a read)
        if (row.status === 'pending' && new Date(row.expiresAt).getTime() <= now.getTime())
            return { ...row, status: 'expired' };
        return row;
    }

    async state(accountId: string, now = this.now()): Promise<InviteStateView> {
        const code = await this.codeOf(accountId);
        const invited = ((await this.referrals.find({ inviterId: accountId }).lean()) as any[])
            .map(r => this.live(r, now))
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        const acceptedRow = (await this.referrals.findOne({ inviteeId: accountId }).lean()) as any;
        const accepted = acceptedRow ? this.live(acceptedRow, now) : null;
        const names = await this.names([
            ...invited.slice(0, 10).map(r => String(r.inviteeId)),
            ...(accepted ? [String(accepted.inviterId)] : []),
        ]);
        const earned = invited.filter(r => r.inviterClaimed && r.inviterCoat).length;
        const view = (r: any, other: string, claimable: boolean): InviteRowView => ({
            name: names.get(other) ?? memberName(other),
            kind: String(r.kind),
            matches: Math.min(INVITE_MATCHES, Number(r.matches) || 0),
            need: INVITE_MATCHES,
            status: String(r.status),
            claimable,
        });
        const room = Math.max(0, INVITER_REWARD_CAP - earned);
        const invitedViews = invited
            .slice(0, 10)
            .map(r => view(r, String(r.inviteeId), r.status === 'done' && !r.inviterClaimed && room > 0));
        const acceptedView = accepted
            ? view(accepted, String(accepted.inviterId), accepted.status === 'done' && !accepted.inviteeClaimed)
            : null;
        const asInviter = Math.min(room, invited.filter(r => r.status === 'done' && !r.inviterClaimed).length);
        return {
            code,
            link: inviteLink(code),
            need: INVITE_MATCHES,
            invited: invitedViews,
            accepted: acceptedView,
            claimable: asInviter + (acceptedView?.claimable ? 1 : 0),
            nextCoat: nextInviteCoat(await ownedItemsOf({ owned: this.owned }, accountId)),
            earned,
            cap: INVITER_REWARD_CAP,
        };
    }

    /**
     * Accepts an invite: the code's owner becomes this account's inviter. Refused: an unknown code, the player's own
     * code, a second invite for the account or the device, an account that is neither new nor back after 21 days, an
     * inviter whose earlier invite came from this player (no swapping codes), or an inviter with too many open invites.
     */
    async redeem(accountId: string, rawCode: unknown, rawDevice: unknown, now = this.now()): Promise<InviteStateView> {
        const code = normalizeInviteCode(rawCode);
        if (!code) throw GROWTH_ERRORS.badCode();
        const owner = (await this.codes.findOne({ code }).lean()) as any;
        if (!owner) throw GROWTH_ERRORS.badCode();
        const inviterId = String(owner.accountId);
        if (inviterId === accountId) throw GROWTH_ERRORS.self();
        if (await this.referrals.findOne({ inviteeId: accountId }).lean()) throw GROWTH_ERRORS.already();
        const deviceId = typeof rawDevice === 'string' && DEVICE_ID.test(rawDevice) ? rawDevice : undefined;
        if (deviceId && (await this.referrals.findOne({ deviceId }).lean())) throw GROWTH_ERRORS.device();
        // a pair that swaps codes would farm both sides
        if (await this.referrals.findOne({ inviteeId: inviterId, inviterId: accountId }).lean())
            throw GROWTH_ERRORS.notEligible();
        const user = (await this.users
            .findOne({ _id: accountId }, { createdAt: 1, lastPlayedAt: 1, pawlegendsMatches: 1, isGuest: 1 })
            .lean()) as any;
        if (!user || user.isGuest) throw GROWTH_ERRORS.needAccount();
        const kind = inviteKindOf(
            { createdAt: user.createdAt, lastPlayedAt: user.lastPlayedAt, matches: user.pawlegendsMatches },
            now
        );
        if (!kind) throw GROWTH_ERRORS.notEligible();
        const open = await this.referrals.countDocuments({
            inviterId,
            status: 'pending',
            expiresAt: { $gt: now },
        });
        if (open >= INVITER_PENDING_CAP) throw GROWTH_ERRORS.inviterFull();
        try {
            await this.referrals.create({
                inviteeId: accountId,
                inviterId,
                code,
                kind,
                ...(deviceId ? { deviceId } : {}),
                status: 'pending',
                matches: 0,
                refs: [],
                expiresAt: inviteExpiresAt(now),
            });
        } catch (error) {
            if (!isDuplicate(error)) throw error;
            // the unique index decided a race: which one is it?
            if (await this.referrals.findOne({ inviteeId: accountId }).lean()) throw GROWTH_ERRORS.already();
            throw GROWTH_ERRORS.device();
        }
        return this.state(accountId, now);
    }

    /**
     * Counts one verified save toward this player's open invite (the `/live` save calls this, through
     * `applyInviteProgress`, after its Game row exists). A save counts once (its ref), only while the invite is open,
     * and only when it is a real match (inviteMatchCounts). The INVITE_MATCHES-th turns the invite `done`.
     */
    async progress(userId: string, match: InviteMatch, now = this.now()): Promise<'counted' | 'done' | 'skipped'> {
        if (!inviteMatchCounts(match)) return 'skipped';
        const filter = { inviteeId: userId, status: 'pending', expiresAt: { $gt: now }, refs: { $ne: match.ref } };
        const result = await this.referrals.updateOne(filter, { $inc: { matches: 1 }, $push: { refs: match.ref } });
        if (!result?.modifiedCount) return 'skipped';
        const done = await this.referrals.updateOne(
            { inviteeId: userId, status: 'pending', matches: { $gte: INVITE_MATCHES } },
            { $set: { status: 'done', doneAt: now } }
        );
        return done?.modifiedCount ? 'done' : 'counted';
    }

    /**
     * Claims every finished invite reward of this player: each side once (the claim flag flips before the coat is
     * given, so a double tap gives one coat). The coat is the first invite coat the player does not own; when they own
     * them all the claim is spent without a coat. An inviter earns at most INVITER_REWARD_CAP coats.
     */
    async claim(accountId: string, now = this.now()): Promise<{ granted: string[]; state: InviteStateView }> {
        const granted: string[] = [];
        const give = async (id: unknown, side: 'inviter' | 'invitee') => {
            const flag = side === 'inviter' ? 'inviterClaimed' : 'inviteeClaimed';
            const coat = nextInviteCoat(await ownedItemsOf({ owned: this.owned }, accountId));
            const won = await this.referrals.updateOne(
                { _id: id, status: 'done', [flag]: { $ne: true } },
                { $set: { [flag]: true, ...(coat ? { [`${side}Coat`]: coat } : {}) } }
            );
            if (!won?.modifiedCount || !coat) return;
            await grantItems({ owned: this.owned }, accountId, [coat], 'invite', { claim: `invite:${String(id)}:${side}` });
            granted.push(coat);
        };
        const accepted = (await this.referrals.findOne({ inviteeId: accountId, status: 'done' }).lean()) as any;
        if (accepted && !accepted.inviteeClaimed) await give(accepted._id, 'invitee');
        const mine = (await this.referrals.find({ inviterId: accountId, status: 'done' }).lean()) as any[];
        let earned = mine.filter(r => r.inviterClaimed && r.inviterCoat).length;
        for (const r of mine) {
            if (r.inviterClaimed || earned >= INVITER_REWARD_CAP) continue;
            const before = granted.length;
            await give(r._id, 'inviter');
            if (granted.length > before) earned++;
        }
        return { granted, state: await this.state(accountId, now) };
    }

    // -----------------------------------------------------------------------------------------------------------
    // Creator codes

    /** An active creator by code (public lookup for the checkout field). */
    async creator(raw: unknown): Promise<{ code: string; name: string } | null> {
        const code = normalizeCreatorCode(raw);
        if (!code) return null;
        const row = (await this.creators.findOne({ code, active: true }).lean()) as any;
        return row ? { code, name: String(row.name) } : null;
    }

    /**
     * The creator a checkout is attributed to: a code typed now (checked and remembered for CREATOR_LINK_DAYS), else the
     * account's live link, else none. A typed code that is unknown or inactive refuses the checkout (400), so the buyer
     * knows their creator was not credited.
     */
    async checkoutCreator(accountId: string | null | undefined, raw: unknown, now = this.now()): Promise<string | null> {
        const typed = raw !== undefined && raw !== null && raw !== '';
        if (typed) {
            const found = await this.creator(raw);
            if (!found) throw GROWTH_ERRORS.creatorUnknown();
            if (accountId)
                await this.creatorLinks.updateOne(
                    { accountId },
                    { $set: { code: found.code, setAt: now } },
                    { upsert: true }
                );
            return found.code;
        }
        if (!accountId) return null;
        const link = (await this.creatorLinks.findOne({ accountId }).lean()) as any;
        if (!link || !creatorLinkLive(link.setAt, now)) return null;
        // a creator taken out of the program stops earning at once
        return (await this.creator(link.code))?.code ?? null;
    }

    /** The account's live creator link, for the checkout sheet ("Supporting <name>"). */
    async linkOf(accountId: string, now = this.now()): Promise<{ code: string; name: string; until: string } | null> {
        const link = (await this.creatorLinks.findOne({ accountId }).lean()) as any;
        if (!link || !creatorLinkLive(link.setAt, now)) return null;
        const found = await this.creator(link.code);
        if (!found) return null;
        return { ...found, until: new Date(new Date(link.setAt).getTime() + 30 * 86_400_000).toISOString() };
    }

    /** Admin: add or change a creator. */
    async upsertCreator(body: Record<string, unknown>): Promise<{ code: string; name: string; active: boolean; shareBps: number }> {
        const code = normalizeCreatorCode(body?.code);
        const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : '';
        if (!code || !name || /[<>]/.test(name))
            throw pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'code (3-16 letters or digits) and name are required');
        const bps = Number(body?.shareBps ?? CREATOR_DEFAULT_SHARE_BPS);
        if (!Number.isInteger(bps) || bps < 0 || bps > CREATOR_MAX_SHARE_BPS)
            throw pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', `shareBps must be 0-${CREATOR_MAX_SHARE_BPS}`);
        const active = body?.active !== false;
        await this.creators.updateOne({ code }, { $set: { name, active, shareBps: bps } }, { upsert: true });
        return { code, name, active, shareBps: bps };
    }

    /** Admin: every creator and the payout report for paid orders in [from, to). Refunded orders are not owed. */
    async report(from: Date, to: Date): Promise<{ from: string; to: string; creators: any[]; payouts: CreatorPayoutLine[] }> {
        const creators = (await this.creators.find({}).lean()) as any[];
        const share = new Map(creators.map(c => [String(c.code), Number(c.shareBps) || 0]));
        const rows = (await this.purchases
            .find({ status: 'paid', creatorCode: { $exists: true }, paidAt: { $gte: from, $lt: to } })
            .lean()) as any[];
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            creators: creators
                .map(c => ({ code: c.code, name: c.name, active: !!c.active, shareBps: c.shareBps }))
                .sort((a, b) => String(a.code).localeCompare(String(b.code))),
            payouts: creatorPayouts(
                rows.map(r => ({ code: String(r.creatorCode), currency: String(r.currency), amountCents: Number(r.amountCents) })),
                code => share.get(code) ?? CREATOR_DEFAULT_SHARE_BPS
            ),
        };
    }

    // -----------------------------------------------------------------------------------------------------------
    // The first-purchase gift

    /** Whether this account's next paid order is its first (no paid or refunded purchase, no gift yet). */
    async firstOrder(accountId: string): Promise<boolean> {
        if (await this.gifts.findOne({ accountId }).lean()) return false;
        const paid = await this.purchases.countDocuments({ accountId, status: { $in: ['paid', 'refunded'] } });
        return paid === 0;
    }

    /** The store sheet's offer: the 5 coats (owned ones marked) when the next order is the first, else none. */
    async giftOffer(accountId: string): Promise<{ eligible: boolean; coats: { id: string; owned: boolean }[] }> {
        if (!(await this.firstOrder(accountId))) return { eligible: false, coats: [] };
        const owned = new Set(await ownedItemsOf({ owned: this.owned }, accountId));
        return { eligible: true, coats: FIRST_GIFT_COATS.map(id => ({ id, owned: owned.has(id) })) };
    }

    /**
     * Checks a gift choice at checkout: one of the 5, not owned, not part of what is being bought, and this is the
     * account's first order. Throws 409 PAWLEGENDS_GIFT_UNAVAILABLE otherwise (the sheet reloads the offer).
     */
    async checkGift(accountId: string, coat: unknown, buying: readonly string[]): Promise<string> {
        if (!isFirstGiftCoat(coat) || buying.includes(coat)) throw GROWTH_ERRORS.giftUnavailable();
        if (!(await this.firstOrder(accountId))) throw GROWTH_ERRORS.giftUnavailable();
        const owned = new Set(await ownedItemsOf({ owned: this.owned }, accountId));
        if (owned.has(coat)) throw GROWTH_ERRORS.giftUnavailable();
        return coat;
    }

    /**
     * Grants the gift of a paid session, once per account ever: the gift row's unique index decides, so a retried
     * webhook or two first orders paid together give one coat. A coat the account came to own meanwhile is not
     * granted again (its row would lose its own session). Never throws into the webhook for a refusal.
     */
    async grantGift(accountId: string, coat: unknown, sessionId: string): Promise<boolean> {
        if (!accountId || !isFirstGiftCoat(coat)) return false;
        const existing = (await this.gifts.findOne({ accountId }).lean()) as any;
        if (existing && existing.sessionId !== sessionId) return false;
        if (!existing) {
            // only an order that was the account's first may take it (an earlier paid order: no gift)
            const earlier = await this.purchases.countDocuments({
                accountId,
                status: { $in: ['paid', 'refunded'] },
                sessionId: { $ne: sessionId },
            });
            if (earlier > 0) return false;
            try {
                await this.gifts.create({ accountId, coat, sessionId });
            } catch (error) {
                if (!isDuplicate(error)) throw error;
                const winner = (await this.gifts.findOne({ accountId }).lean()) as any;
                if (winner?.sessionId !== sessionId) return false;
            }
        }
        const owned = new Set(await ownedItemsOf({ owned: this.owned }, accountId));
        if (owned.has(coat)) return true;
        await grantItems({ owned: this.owned }, accountId, [coat], 'gift', { sessionId });
        this.logger.log(`first-purchase gift granted for session ${sessionId}`);
        return true;
    }
}
