/*
 * Pawlegends store contracts (POC.md §8). The one SKU table: Checkout uses inline `price_data` from here (no Stripe
 * dashboard products), and `pawlegends/src/money/skus.ts` mirrors the names for display only. The server price
 * always wins: a request carries a SKU and a currency, never an amount.
 */

export const PAWLEGENDS_SKU_IDS = [
    'pl_starter',
    'pl_founder',
    'pl_founder_legend',
    'pl_founder_legend_upgrade',
] as const;
export type PawlegendsSku = typeof PAWLEGENDS_SKU_IDS[number];

export const PAWLEGENDS_CURRENCIES = ['usd', 'eur'] as const;
export type PawlegendsCurrency = typeof PAWLEGENDS_CURRENCIES[number];

/** Cosmetic item ids the game renders (`pawlegends/src/render/cosmetics.ts`). Delivered now, in the POC. */
export const PAWLEGENDS_ITEMS = {
    starterSkin: 'skin.clem.pink_bow',
    starterEmote: 'emote.starter',
    founderCoats: ['coat.founder.clem', 'coat.founder.sage', 'coat.founder.brutus', 'coat.founder.cacklejaw'],
    founderFrame: 'frame.founder',
    founderTitle: 'title.founder',
    legendSkin: 'skin.clem.dawnblade',
    legendFrame: 'frame.legend',
} as const;

const FOUNDER_ITEMS: string[] = [
    ...PAWLEGENDS_ITEMS.founderCoats,
    PAWLEGENDS_ITEMS.founderFrame,
    PAWLEGENDS_ITEMS.founderTitle,
];
const LEGEND_EXTRA_ITEMS: string[] = [PAWLEGENDS_ITEMS.legendSkin, PAWLEGENDS_ITEMS.legendFrame];

/** Date the deferred part of every SKU is promised for (the MVP launch target). */
export const PAWLEGENDS_MVP_TARGET = '2027-04-30';

export interface PawlegendsSkuDef {
    sku: PawlegendsSku;
    label: string;
    /** Price in the smallest unit per currency (VAT-inclusive). */
    cents: Record<PawlegendsCurrency, number>;
    /** Items granted when the payment is confirmed. */
    items: string[];
    /** "Delivered now" line of the purchase sheet. */
    deliveredNow: string;
    /** "Delivered at MVP launch" line (the deferred part). */
    deliveredAtMvp: string;
    /** Once per account, email and device. */
    oncePerBuyer?: boolean;
    /** Counts toward the Founder Legend seat cap. */
    legendSeat?: boolean;
    /** Only for buyers who already own pl_founder (and no Founder Legend). */
    requiresFounder?: boolean;
}

export const PAWLEGENDS_SKUS: Record<PawlegendsSku, PawlegendsSkuDef> = Object.freeze({
    pl_starter: {
        sku: 'pl_starter',
        label: 'Pawlegends Starter',
        cents: { usd: 99, eur: 99 },
        items: [PAWLEGENDS_ITEMS.starterSkin, PAWLEGENDS_ITEMS.starterEmote],
        deliveredNow: '"Pink Bow Clem" Rare skin and the "Starter" emote',
        deliveredAtMvp: '3-day Pride Club trial (bonus)',
        oncePerBuyer: true,
    },
    pl_founder: {
        sku: 'pl_founder',
        label: 'Pawlegends Founder',
        cents: { usd: 999, eur: 999 },
        items: FOUNDER_ITEMS,
        deliveredNow: 'Founder Epic coat for all 4 heroes, animated Founder frame, Founder title',
        deliveredAtMvp: '4 MVP heroes of your choice, Season 1 Legends Pass, your name in the in-game credits',
    },
    pl_founder_legend: {
        sku: 'pl_founder_legend',
        label: 'Pawlegends Founder Legend',
        cents: { usd: 2999, eur: 2999 },
        items: [...FOUNDER_ITEMS, ...LEGEND_EXTRA_ITEMS],
        deliveredNow: 'Everything in Founder, plus the "Dawnblade Clem" Legendary skin and the Legend frame',
        deliveredAtMvp:
            "Everything in Founder at MVP, plus all 8 MVP heroes, Season 1 Legends Pass+, 1 month Pride Club, your name on the Founders' Banner",
        legendSeat: true,
    },
    pl_founder_legend_upgrade: {
        sku: 'pl_founder_legend_upgrade',
        label: 'Pawlegends Founder Legend upgrade',
        cents: { usd: 2000, eur: 2000 },
        items: LEGEND_EXTRA_ITEMS,
        deliveredNow: 'The "Dawnblade Clem" Legendary skin and the Legend frame',
        deliveredAtMvp: 'Everything Founder Legend delivers at MVP',
        legendSeat: true,
        requiresFounder: true,
        oncePerBuyer: true,
    },
}) as Record<PawlegendsSku, PawlegendsSkuDef>;

/** Founder Legend seats, gifts and creator codes included (POC.md §8.1). */
export const FOUNDER_LEGEND_CAP = 500;

export const isPawlegendsSku = (value: unknown): value is PawlegendsSku =>
    typeof value === 'string' && (PAWLEGENDS_SKU_IDS as readonly string[]).includes(value);

export const isPawlegendsCurrency = (value: unknown): value is PawlegendsCurrency =>
    typeof value === 'string' && (PAWLEGENDS_CURRENCIES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------------------------------------------
// Age bands and spend caps (POC.md §8.5)

export const AGE_BANDS = ['under16', '16-17', '18+'] as const;
export type AgeBand = typeof AGE_BANDS[number];
export const isAgeBand = (value: unknown): value is AgeBand =>
    typeof value === 'string' && (AGE_BANDS as readonly string[]).includes(value);

/** Rolling-30-day spend cap per band, in euro cents (USD counts at a fixed €1 = $1). Under 16 cannot buy. */
export const SPEND_CAP_CENTS: Record<AgeBand, number> = Object.freeze({ under16: 0, '16-17': 3000, '18+': 20000 });
export const SPEND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Younger band first: the stricter of two answers wins. */
export const stricterBand = (a: AgeBand | undefined, b: AgeBand | undefined): AgeBand | undefined => {
    if (!a) return b;
    if (!b) return a;
    return AGE_BANDS.indexOf(a) <= AGE_BANDS.indexOf(b) ? a : b;
};

export const UNDER_16_MESSAGE = 'Ask a parent or guardian to buy this on their own device.';

/**
 * Terms versions (POC.md §8.6). `PAWLEGENDS_TERMS_VERSION` is the current `/pawlegends/terms` (2026-10-23: the $5
 * cat terms, launch item U5): `GET /pawlegends/status` reports it and the cat checkout accepts only that consent.
 * The legacy `pl_*` checkout keeps the presale terms it was written for: it accepts only
 * `PAWLEGENDS_CONSENT_VERSIONS` and its Stripe metadata stores `PAWLEGENDS_LEGACY_TERMS_VERSION`.
 */
export const PAWLEGENDS_TERMS_VERSION = '2026-10-23';
export const PAWLEGENDS_LEGACY_TERMS_VERSION = '2026-10-17';
export const PAWLEGENDS_CONSENT_VERSIONS = [PAWLEGENDS_LEGACY_TERMS_VERSION] as const;

// ---------------------------------------------------------------------------------------------------------------
// Requests and answers

export interface PawlegendsCheckoutRequest {
    sku: PawlegendsSku;
    currency: PawlegendsCurrency;
    email?: string;
    ageBand: AgeBand;
    consentVersion: string;
    deviceId: string;
    /** An entitlement token the host holds (proves Founder ownership for the upgrade). */
    token?: string;
}

export interface PawlegendsCheckoutResponse {
    url: string;
    sessionId: string;
}

export interface PawlegendsEntitlements {
    items: string[];
    skus: PawlegendsSku[];
    /** Unix ms; the game refreshes the token after it. */
    expiresAt: number;
}

export interface PawlegendsEntitlementResponse extends PawlegendsEntitlements {
    token: string;
}

/**
 * Offer engine input, sent by the `/pawlegends` host. Since the Token Tails integration the one card is "Meet <cat>":
 * a direct-purchase Token Tails cat from the host's featured list (`catalogIds`, comma-separated, at most 2).
 */
export interface PawlegendsOfferQuery {
    deviceId: string;
    session: number;
    /** The featured cats, in the host's order of preference. */
    catalogIds?: string;
    /** Set by the host in app builds: never an offer then. */
    app?: boolean;
    screen?: string;
    token?: string;
}

/** `meet` is the only kind offered now; `starter` and `founder` are the retired `pl_*` cards (kept for old rows). */
export type PawlegendsOfferKind = 'meet' | 'starter' | 'founder';

export interface PawlegendsOffer {
    kind: 'meet';
    /** A catalog cat the Token Tails $5 checkout sells (`ShelterCatSaleService.check`). */
    catalogId: string;
}

export interface PawlegendsOfferResponse {
    offer: PawlegendsOffer | null;
}

/** The same cat is not offered again within this gap (another featured cat may be). */
export const MEET_SAME_CAT_GAP_MS = 3 * 24 * 60 * 60 * 1000;
/** At most one Meet card a day per device, on top of one per session. */
export const MEET_OFFER_GAP_MS = 20 * 60 * 60 * 1000;
/** The direct-purchase cat's price in the spend cap (euro cents, USD at €1 = $1): `SHELTER_CAT_MIN_PRICE_CENTS`. */
export const MEET_PRICE_CAP_CENTS = 500;

/** Screens where the game may show an offer card. */
export const OFFER_SCREENS = ['lobby', 'results'] as const;
export const STARTER_WINDOW_MS = 48 * 60 * 60 * 1000;
export const FOUNDER_OFFER_GAP_MS = 7 * 24 * 60 * 60 * 1000;
