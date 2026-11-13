/*
 * Paw Legends growth rules (docs/plans/moba/GROWTH.md): invite and comeback codes, creator codes and the first-purchase
 * gift. Pure data and math, no imports from Nest or Mongoose, so every rule is unit-tested without a database.
 *
 * Nothing here is read by the sim, the replay record or the hash: every reward is a cosmetic coat that already exists
 * in the store catalogue (`STORE_COATS`, a Rare coat in a match).
 */

import { STORE_COATS } from '../pawlegends-catalog';

// ---------------------------------------------------------------------------------------------------------------
// Invite and comeback codes (Wild Rift "See You on the Rift", research/wild-rift-growth.md §9)

/** Verified matches the invited friend must finish before both players can claim their coat. */
export const INVITE_MATCHES = 3;
/** A friend counts as "coming back" after this long without a saved match. */
export const COMEBACK_DAYS = 21;
/** A brand-new account: created this recently (the guided first match may come before sign-in). */
export const NEW_ACCOUNT_DAYS = 14;
/** The invited friend has this long after redeeming to finish the matches. */
export const INVITE_WINDOW_DAYS = 30;
/** A match counts only when it lasted at least this long in game time (no instant forfeits). Ticks at 30 Hz. */
export const INVITE_MIN_TICKS = 60 * 30;
/** Coats one inviter can earn from invites in all (one per finished invite). */
export const INVITER_REWARD_CAP = 5;
/** Invites one inviter may have running (redeemed, not finished) at once. */
export const INVITER_PENDING_CAP = 10;

const DAY = 24 * 60 * 60 * 1000;

/** Invite codes: 7 characters without look-alikes (no 0/O, 1/I/L). */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 7;
const INVITE_CODE = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

/** A typed or linked code, cleaned (case and spaces ignored), or null when it cannot be one. */
export function normalizeInviteCode(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 20) return null;
    const code = value.replace(/[\s-]/g, '').toUpperCase();
    return INVITE_CODE.test(code) ? code : null;
}

/** A fresh code from `bytes` (crypto random in the service, fixed bytes in specs). */
export function inviteCodeFrom(bytes: ArrayLike<number>): string {
    let out = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) out += INVITE_ALPHABET[(bytes[i] ?? 0) % INVITE_ALPHABET.length];
    return out;
}

/** The share link: the landing redirects `?ref=` to `/play` (pawlegends-web routes.json `playQueryKeys`). */
export const inviteLink = (code: string, origin = 'https://pawlegends.app') => `${origin}/?ref=${code}`;

/** The coats invites pay, in order: each claim gives the first one the player does not own yet. Rare store coats. */
export const INVITE_COATS: readonly string[] = Object.freeze([
    'coat.sage.store_silver_tabby',
    'coat.meatball.store_siamese',
    'coat.nugget.store_merle',
    'coat.chili.store_red_brindle',
    'coat.howler.store_sable',
]);

/** The next invite coat for a player who owns `owned`, or null when they own them all. */
export function nextInviteCoat(owned: Iterable<string>): string | null {
    const have = new Set(owned);
    return INVITE_COATS.find(c => !have.has(c)) ?? null;
}

export type InviteKind = 'new' | 'comeback';

export interface InviteeFacts {
    createdAt?: Date | string | null;
    lastPlayedAt?: Date | string | null;
    /** `pawlegendsMatches` of the user: saved matches per difficulty. */
    matches?: Record<string, unknown> | null;
}

const time = (d: Date | string | null | undefined): number | null => {
    if (!d) return null;
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? t : null;
};

export function totalMatches(matches: Record<string, unknown> | null | undefined): number {
    if (!matches || typeof matches !== 'object') return 0;
    return Object.values(matches).reduce<number>(
        (n, v) => n + (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0),
        0
    );
}

/**
 * Whether this account may accept an invite, and as what: a new player (no saved match yet, or an account made in the
 * last NEW_ACCOUNT_DAYS), or one coming back after COMEBACK_DAYS without a saved match. Null: neither.
 */
export function inviteKindOf(facts: InviteeFacts, now: Date): InviteKind | null {
    const played = totalMatches(facts.matches);
    const created = time(facts.createdAt);
    const last = time(facts.lastPlayedAt);
    if (played === 0) return 'new';
    if (created !== null && now.getTime() - created <= NEW_ACCOUNT_DAYS * DAY) return 'new';
    if (last !== null && now.getTime() - last >= COMEBACK_DAYS * DAY) return 'comeback';
    return null;
}

/** What `/live` tells the invite counter about one verified save (never the client's word). */
export interface InviteMatch {
    /** The save's unique key (replay digest, or party room and slot digest). */
    ref: string;
    /** Game time of the match in ticks. */
    ticks: number;
    forfeit: boolean;
}

/** A save counts toward an invite when it is a real match: not a forfeit and at least INVITE_MIN_TICKS long. */
export const inviteMatchCounts = (m: InviteMatch): boolean =>
    typeof m.ref === 'string' && m.ref.length > 0 && !m.forfeit && Number.isFinite(m.ticks) && m.ticks >= INVITE_MIN_TICKS;

export const inviteExpiresAt = (now: Date) => new Date(now.getTime() + INVITE_WINDOW_DAYS * DAY);

// ---------------------------------------------------------------------------------------------------------------
// Creator codes (Brawl Stars Creator Boost, research/brawl-stars-growth.md §6)

/** A creator code entered at checkout stays on the account's purchases this long. */
export const CREATOR_LINK_DAYS = 30;
/** The default share of a purchase's price (VAT included) owed to the creator, in basis points (GDD §8.6: 20%). */
export const CREATOR_DEFAULT_SHARE_BPS = 2000;
export const CREATOR_MAX_SHARE_BPS = 3000;

const CREATOR_CODE = /^[A-Z0-9]{3,16}$/;

/** A creator code as typed (case, spaces and dashes ignored), or null. */
export function normalizeCreatorCode(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 32) return null;
    const code = value.replace(/[\s_-]/g, '').toUpperCase();
    return CREATOR_CODE.test(code) ? code : null;
}

/** Whether a creator link set at `setAt` still applies at `now`. */
export const creatorLinkLive = (setAt: Date | string | null | undefined, now: Date): boolean => {
    const t = time(setAt);
    return t !== null && now.getTime() - t < CREATOR_LINK_DAYS * DAY;
};

export interface CreatorPayoutRow {
    code: string;
    currency: string;
    amountCents: number;
}

export interface CreatorPayoutLine {
    code: string;
    orders: number;
    /** Gross (VAT-inclusive) per currency, smallest unit. */
    gross: Record<string, number>;
    shareBps: number;
    /** What the creator is owed per currency (rounded down to the cent). */
    payout: Record<string, number>;
}

/** The payout report: paid orders per code, gross and the creator's share per currency. */
export function creatorPayouts(rows: readonly CreatorPayoutRow[], shareOf: (code: string) => number): CreatorPayoutLine[] {
    const by = new Map<string, CreatorPayoutLine>();
    for (const r of rows) {
        if (!r.code || !Number.isFinite(r.amountCents) || r.amountCents <= 0) continue;
        let line = by.get(r.code);
        if (!line) {
            line = { code: r.code, orders: 0, gross: {}, shareBps: shareOf(r.code), payout: {} };
            by.set(r.code, line);
        }
        line.orders += 1;
        line.gross[r.currency] = (line.gross[r.currency] ?? 0) + Math.round(r.amountCents);
    }
    for (const line of by.values())
        for (const [cur, cents] of Object.entries(line.gross)) line.payout[cur] = Math.floor((cents * line.shareBps) / 10_000);
    return [...by.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// ---------------------------------------------------------------------------------------------------------------
// The first-purchase gift (Wild Rift: the first Wild Cores purchase picks 1 skin from 5). A fixed choice, no chance.

/** The 5 Rare coats a first purchase may add, one of each kind of champion. */
export const FIRST_GIFT_COATS: readonly string[] = Object.freeze([
    'coat.clem.store_calico',
    'coat.pixel.store_leopard',
    'coat.duchess.store_blue_point',
    'coat.brutus.store_brindle',
    'coat.rocket.store_tiger',
]);

export const isFirstGiftCoat = (value: unknown): value is string =>
    typeof value === 'string' && FIRST_GIFT_COATS.includes(value);

/** Every reward coat is a real store coat (a spec checks the lists against the catalogue). */
export const STORE_COAT_IDS: ReadonlySet<string> = new Set(STORE_COATS.map(c => c.id));
