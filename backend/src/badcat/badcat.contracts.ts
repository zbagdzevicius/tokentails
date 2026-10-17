/*
 * Bad Cat Daily (badcat): the request and response shapes of `/badcat/*` and the money constants.
 *
 * Mirror of the money and cameo blocks of `bad-cat/src/types.ts` (the game package is the source of
 * truth; FULL-PLAN.md decision 1). `badcat.contracts.spec.ts` reads that file as text and fails when the
 * SKU table, the route paths, the cameo constants or the unions differ. Keep this file free of imports so
 * both copies stay plain.
 */

export type PaywallTrigger =
    | 'post_share'
    | 'perfect_crime'
    | 'catmaker_saved'
    | 'streak_break'
    | 'archive_old'
    | 'gift_s1';

export type CheckoutTrigger =
    | PaywallTrigger
    | 'home'
    | 'settings'
    | 'shop'
    | 'cameo_flow'
    | 'gift_flow'
    | 'brand'
    | 'presale'
    | 'thanks';

export const CHECKOUT_TRIGGERS: readonly CheckoutTrigger[] = [
    'post_share',
    'perfect_crime',
    'catmaker_saved',
    'streak_break',
    'archive_old',
    'gift_s1',
    'home',
    'settings',
    'shop',
    'cameo_flow',
    'gift_flow',
    'brand',
    'presale',
    'thanks',
];

// ---------------------------------------------------------------------------------------------
// Cameos (GDD 6.5)
// ---------------------------------------------------------------------------------------------

export type CameoKind = 'paid' | 'guest_star' | 'club' | 'free' | 'gift' | 'streak' | 'reply' | 'community' | 'pinkpaw';
export const CAMEO_KINDS: readonly CameoKind[] = [
    'paid',
    'guest_star',
    'club',
    'free',
    'gift',
    'streak',
    'reply',
    'community',
    'pinkpaw',
];

export interface CameoEntry {
    id: string;
    name: string; // filtered
    catCode: string; // codec cat code
    kind: CameoKind;
    /** Approved face only (GET /badcat/face/<id>.png); null = default face with the cat's colours. */
    faceUrl?: string | null;
    club?: boolean;
    alumni?: boolean;
}

export interface CameoBundle {
    dayNo: number;
    shuffle: number;
    spectators: CameoEntry[];
    fridge: CameoEntry[];
    guestStars: CameoEntry[];
    source: 'server' | 'offline';
}

export const CAMEO_SHUFFLES = 8;
export const FRIDGE_MAGNETS = 40;
export const CAMEO_LOADS_GUARANTEE = 300;
export const CAMEO_WEIGHTS: Readonly<Record<CameoKind, number>> = {
    paid: 4,
    guest_star: 4,
    club: 2,
    free: 1,
    gift: 4,
    streak: 1,
    reply: 1,
    community: 1,
    pinkpaw: 1,
};
/** The most spectator slots any shell has (GDD 6.5: 10–15); the client keeps its shell's first N. */
export const MAX_SPECTATORS = 15;
/** Friday guest stars listed per day. */
export const MAX_GUEST_STARS = 3;
/** Fridge weight of a cameo cat that is not a Club cat (GDD 6.5). */
export const FRIDGE_CAMEO_WEIGHT = 1;

// ---------------------------------------------------------------------------------------------
// Money: SKUs, prices, the backend contract.
// ---------------------------------------------------------------------------------------------

export type BadcatSku =
    | 'club_monthly'
    | 'club_annual'
    | 'founding'
    | 'cameo'
    | 'guest_star'
    | 'gift_cameo'
    | 'gift_club_3m'
    | 'brand_shelf'
    | 'sponsor_day'
    | 'sponsor_week'
    | 'collar_pinkpaw'
    | 'cosmetic_collar'
    | 'cosmetic_hat'
    | 'cosmetic_trail'
    | 'cosmetic_bundle'
    | 'cosmetic_collar_spiked'
    | 'cosmetic_hat_wizard'
    | 'cosmetic_trail_bubbles'
    | 'cosmetic_stamp_neon'
    | 'cosmetic_bundle2';

export interface SkuDef {
    sku: BadcatSku;
    label: string;
    cents: number; // USD cents
    recurring?: 'month' | 'year';
    revenueBearing: boolean;
    needsDay?: boolean;
    needsCat?: boolean;
}

export const BADCAT_SKUS: Readonly<Record<BadcatSku, SkuDef>> = {
    club_monthly: {
        sku: 'club_monthly',
        label: 'Chaos Club, monthly',
        cents: 499,
        recurring: 'month',
        revenueBearing: true,
    },
    club_annual: {
        sku: 'club_annual',
        label: 'Chaos Club, yearly',
        cents: 3999,
        recurring: 'year',
        revenueBearing: true,
    },
    founding: {
        sku: 'founding',
        label: 'Founding Bad Cat (first year)',
        cents: 2499,
        recurring: 'year',
        revenueBearing: true,
    },
    cameo: { sku: 'cameo', label: 'Cameo', cents: 499, revenueBearing: true, needsDay: true, needsCat: true },
    guest_star: {
        sku: 'guest_star',
        label: 'Guest star (a Friday)',
        cents: 999,
        revenueBearing: true,
        needsDay: true,
        needsCat: true,
    },
    gift_cameo: { sku: 'gift_cameo', label: 'Gift a cameo', cents: 499, revenueBearing: true },
    gift_club_3m: { sku: 'gift_club_3m', label: 'Gift 3 months of Club', cents: 1499, revenueBearing: true },
    brand_shelf: { sku: 'brand_shelf', label: 'Brand Shelf', cents: 19900, recurring: 'month', revenueBearing: true },
    sponsor_day: {
        sku: 'sponsor_day',
        label: 'Sponsor prop of the day',
        cents: 9900,
        revenueBearing: true,
        needsDay: true,
    },
    sponsor_week: {
        sku: 'sponsor_week',
        label: 'Sponsor room of the week',
        cents: 49900,
        revenueBearing: true,
        needsDay: true,
    },
    collar_pinkpaw: { sku: 'collar_pinkpaw', label: 'Pink Paw charity collar', cents: 499, revenueBearing: false },
    cosmetic_collar: { sku: 'cosmetic_collar', label: 'Bandana', cents: 199, revenueBearing: true },
    cosmetic_hat: { sku: 'cosmetic_hat', label: 'Tiny crown', cents: 299, revenueBearing: true },
    cosmetic_trail: { sku: 'cosmetic_trail', label: 'Glitter trail', cents: 299, revenueBearing: true },
    cosmetic_bundle: { sku: 'cosmetic_bundle', label: 'Bundle of 3', cents: 499, revenueBearing: true },
    cosmetic_collar_spiked: { sku: 'cosmetic_collar_spiked', label: 'Spiked collar', cents: 199, revenueBearing: true },
    cosmetic_hat_wizard: { sku: 'cosmetic_hat_wizard', label: 'Wizard hat', cents: 299, revenueBearing: true },
    cosmetic_trail_bubbles: { sku: 'cosmetic_trail_bubbles', label: 'Bubble trail', cents: 299, revenueBearing: true },
    cosmetic_stamp_neon: { sku: 'cosmetic_stamp_neon', label: 'Neon stamp', cents: 199, revenueBearing: true },
    cosmetic_bundle2: {
        sku: 'cosmetic_bundle2',
        label: 'Bundle of 3: Spiked, Wizard, Bubbles',
        cents: 499,
        revenueBearing: true,
    },
};

export const isBadcatSku = (value: unknown): value is BadcatSku =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(BADCAT_SKUS, value);

/** Founding pre-sale cap (GDD 9.2). */
export const FOUNDING_CAP = 200;
/** Founding: Club annual at $39.99 with a once-only $15 coupon, so the first year is $24.99 (GDD 9.2). */
export const FOUNDING_RENEWAL_CENTS = BADCAT_SKUS.club_annual.cents;
export const FOUNDING_COUPON_ID = 'badcat_founding_1500_once';

/** Club plans (an active one makes `Entitlements.club` true). */
export const CLUB_SKUS: readonly BadcatSku[] = ['club_monthly', 'club_annual', 'founding'];
/** One-off SKUs that unlock something on the player's cat (listed in `Entitlements.skus`). */
export const OWNED_SKUS: readonly BadcatSku[] = [
    'collar_pinkpaw',
    'cosmetic_collar',
    'cosmetic_hat',
    'cosmetic_trail',
    'cosmetic_bundle',
    'cosmetic_collar_spiked',
    'cosmetic_hat_wizard',
    'cosmetic_trail_bubbles',
    'cosmetic_stamp_neon',
    'cosmetic_bundle2',
];
export const GIFT_SKUS: readonly BadcatSku[] = ['gift_cameo', 'gift_club_3m'];
export const BRAND_SKUS: readonly BadcatSku[] = ['brand_shelf', 'sponsor_day', 'sponsor_week'];
export const CAMEO_SKUS: readonly BadcatSku[] = ['cameo', 'guest_star'];

export interface CheckoutMeta {
    trigger: CheckoutTrigger;
    via?: string;
    entry?: string;
    from_in_app: boolean;
    ab_arm?: 'A' | 'B';
    session_index?: number;
}

export interface CheckoutRequest {
    sku: BadcatSku;
    email?: string;
    catCode?: string;
    catName?: string;
    dayNo?: number;
    giftFor?: string;
    brand?: { name: string; url?: string; note?: string };
    faceOptIn?: boolean;
    meta: CheckoutMeta;
    returnBase: string;
}

export interface CheckoutResponse {
    url: string;
    sessionId: string;
}

export interface Entitlements {
    club: boolean;
    plan?: 'monthly' | 'annual' | 'founding' | 'gift';
    skus: string[];
    cosmetics: number[];
    maxCats: number;
    freezesPerWeek: number;
    archiveDays: number;
    seasonTiers: number;
    expiresAt: number;
    email?: string;
    source: 'free' | 'cache' | 'server';
}

export interface EntitlementResponse {
    token: string;
    entitlements: Entitlements;
}

export interface CheckoutCompletion {
    ok: boolean;
    sku?: BadcatSku;
    token?: string;
    entitlements?: Entitlements | null;
    gift?: { code: string; sku: BadcatSku };
    cameoId?: string;
    dayNo?: number;
    pending?: boolean;
    error?: string;
}

export interface RedeemRequest {
    code: string;
    email: string;
    /** The device's current token, so a redeem adds to its scope instead of replacing it (optional). */
    token?: string;
    catCode?: string;
    catName?: string;
    dayNo?: number;
}

export interface RedeemResponse {
    ok: boolean;
    kind?: 'cameo' | 'club';
    token?: string;
    entitlements?: Entitlements;
    error?: string;
    /** Backend extra (not yet in types.ts, see LANE-NOTES/W1-BACKEND.md): the gift cameo's id for the face upload. */
    cameoId?: string;
}

export interface BadcatServerStatus {
    enabled: boolean;
    checkout: boolean;
    cameos: boolean;
    gifts: boolean;
    restoreEmail: boolean;
    faceUploads: boolean;
    creatorCodes: boolean;
    brand: boolean;
    testMode: boolean;
    foundingLeft?: number;
    // ----- Phase 2 (GDD 10, 17.3); absent from older backends = off -----
    scores?: boolean;
    boards?: boolean;
    accounts?: boolean;
    shortLinks?: boolean;
    feed?: boolean;
    meter?: boolean;
    push?: boolean;
    streakEmail?: boolean;
    creatorDashboard?: boolean;
}

export interface SeenResponse {
    week: number;
    total: number;
}

/** Entitlement limits (GDD 9.2): free vs Club. */
export const FREE_LIMITS = { maxCats: 1, freezesPerWeek: 1, archiveDays: 14, seasonTiers: 15 } as const;
/** `archiveDays` for Club: "all" (a number larger than any day count). */
export const CLUB_LIMITS = { maxCats: 5, freezesPerWeek: 3, archiveDays: 100000, seasonTiers: 30 } as const;
/** An entitlement token is trusted by the client for at most a week (then refreshed online). */
export const ENTITLEMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const BADCAT_ROUTES = {
    status: '/badcat/status',
    checkout: '/badcat/checkout',
    webhook: '/badcat/stripe/webhook',
    entitlement: '/badcat/entitlement',
    restore: '/badcat/restore',
    restoreVerify: '/badcat/restore/verify',
    portal: '/badcat/portal',
    redeem: '/badcat/redeem',
    cameos: '/badcat/cameos',
    seen: '/badcat/seen',
    face: '/badcat/face',
    clubCat: '/badcat/club/cat',
    creatorCode: '/badcat/creator-code',
    typed: '/badcat/t',
    adminFaces: '/badcat/admin/faces',
    adminCameo: '/badcat/admin/cameo',
    adminStats: '/badcat/admin/stats',
    adminCreatorCodes: '/badcat/admin/creator-codes',
    // ----- Phase 2 -----
    sim: '/badcat/sim',
    board: '/badcat/board',
    account: '/badcat/account',
    accountClaim: '/badcat/account/claim',
    streakEmail: '/badcat/account/streak-email',
    link: '/badcat/link',
    shortLink: '/badcat/s',
    og: '/badcat/og',
    room: '/badcat/room',
    feed: '/badcat/feed',
    meter: '/badcat/meter',
    pushKey: '/badcat/push/key',
    pushSubscribe: '/badcat/push/subscribe',
    pushUnsubscribe: '/badcat/push/unsubscribe',
    creatorDashboard: '/badcat/creator/me',
    adminRooms: '/badcat/admin/rooms',
} as const;

/** Day #1 (GDD 3.4), mirror of `DAY1` in bad-cat/src/content/daily.ts. Day 1 is a Monday. */
export const BADCAT_DAY1 = '2026-11-16';

/** Creator codes (GDD 9.2): 20 % of net revenue from the players a code brings, for their first 6 months. */
export const CREATOR_SHARE_BPS = 2000;
export const CREATOR_WINDOW_MONTHS = 6;
export const CREATOR_MIN_PAYOUT_CENTS = 2500;
export const CREATOR_CODE_PATTERN = /^[a-z0-9_]{6,12}$/;

/** Cameo face uploads: a PNG of at most 64 KB. */
export const FACE_MAX_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------------------------
// Phase 2 (GDD 10, 17.3): ranked saves, boards, accounts, short links, the room feed, the live meter, push
// ---------------------------------------------------------------------------------------------

/** The `badcat` field of a BAD_CAT the one score route (`/live` in the user module) body (bad-cat/src/server/index.ts BadcatRunLog). */
export interface BadcatRunLog {
    dayNo: number;
    simVersion: number;
    runs: [number, number, number, number][];
    finalHash?: number;
    score?: number;
    catCode?: string;
    name?: string;
}

/** The answer of a BAD_CAT save: the server replay's own result. */
export interface BadcatSaveResponse {
    dayNo: number;
    score: number;
    stamp: string;
    rank: string;
    ticks: number;
    finalHash: number;
    hashMatch?: boolean;
    level: string;
}

/** Top 100 of a day; registered players only (guests save but never rank). */
export const BOARD_SIZE = 100;

export interface BoardRow {
    rank: number;
    score: number;
    stamp: string;
    name: string;
    catCode?: string;
}

export interface BoardResponse {
    dayNo: number;
    label: string;
    rows: BoardRow[];
    updatedAt: string;
}

export interface BoardMeResponse {
    dayNo: number;
    saved: boolean;
    guest: boolean;
    score?: number;
    stamp?: string;
    /** 1-based among registered players; absent for guests and unsaved days. */
    rank?: number;
}

export interface AccountResponse {
    signedIn: boolean;
    guest: boolean;
    emailVerified: boolean;
    ranked: { days: number; best: number; lastDay: number | null; streak: number };
    streakEmail: boolean;
    /** A verified email: POST /badcat/account/claim gives this device the purchases made with it. */
    canClaim: boolean;
}

export type ShortLinkKind = 'dare' | 'room' | 'cat' | 'day' | 'other';

export interface ShortLinkRequest {
    /** The long game path: `/badcat/...` with its query, at most SHORT_LINK_MAX_PATH chars. */
    path: string;
    kind: ShortLinkKind;
    name?: string;
    score?: number;
    dayNo?: number;
    catCode?: string;
}

export interface ShortLinkResponse {
    id: string;
    url: string;
}

export const SHORT_LINK_MAX_PATH = 4000;

export type FeedRoomStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export interface RoomPublishRequest {
    code: string;
    /** The maker's clear run (input runs), replayed on the server. */
    clear?: [number, number, number, number][];
    /** List it in the public feed (after review unless auto-approve). */
    feed?: boolean;
}

export interface RoomPublishResponse {
    id: string;
    url: string;
    status: FeedRoomStatus;
    feed: boolean;
}

export interface FeedRoom {
    id: string;
    code: string;
    title: string;
    author: string;
    shell: number;
    props: number;
    plays: number;
    ancestors: string[];
    createdAt: string;
}

export interface FeedResponse {
    rooms: FeedRoom[];
    /** Opaque cursor for the next page. */
    next?: string;
}

export interface PushSubscribeRequest {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    /** Local hour 0..23 of the reminder. */
    hour: number;
    /** `Date.getTimezoneOffset()` of the device (minutes, UTC - local). */
    tzOffsetMin: number;
}

export interface CreatorDashboardRow {
    code: string;
    status: 'pending' | 'approved' | 'rejected';
    purchases: number;
    grossCents: number;
    shareCents: number;
}

export interface CreatorDashboard {
    rows: CreatorDashboardRow[];
    minPayoutCents: number;
}
