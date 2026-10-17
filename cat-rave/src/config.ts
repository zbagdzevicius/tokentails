/**
 * Shared constants: layout, palette, URLs, quality tiers. Every lane reads this file; only the
 * spec owner changes it (SPEC.md "Shared files"). A lane that needs a new constant keeps it in its
 * own module, or asks for it here.
 */
import type { ChainInfo, Quality, QualityProfile, ShotId } from './types';

// ---------------------------------------------------------------------------------------------
// World layout (1 unit = 1 m). Booth at the origin, the crowd faces it, the moon sits behind the
// booth on -Z, the hero camera looks from +Z towards -Z.
// ---------------------------------------------------------------------------------------------
export const LAYOUT = Object.freeze({
  /** Top of the booth table (decks sit on it). */
  boothSize: { w: 2.4, h: 1.1, d: 1.2 },
  /** No cat stands inside this radius (booth plus a ring of floor glow). */
  crowdInnerRadius: 3.2,
  /** Spacing between neighbouring cats in the crowd grid. */
  catSpacing: 1.05,
  /** A standing cat with paws raised is about this tall. */
  catHeight: 1.0,
  /** The DJ cat is this much larger than a crowd cat (hero scale). */
  djScale: 1.75,
  /** The visible floor disk; fog hides the edge. */
  floorRadius: 140,
  /** Huge and low: its bottom fifth sits behind the crowd on the horizon (reference). */
  moon: { radius: 70, center: [0, 22, -260] as const },
  /** Where a new cat starts its drop-in. */
  dropInHeight: 30,
});

// ---------------------------------------------------------------------------------------------
// Palette (linear-ish sRGB hex). Reference: green moon, green floor, hot pink paw pads, violet lasers.
// ---------------------------------------------------------------------------------------------
export const PALETTE = Object.freeze({
  sky: 0x020a05,
  fog: 0x06210f,
  moon: 0xa8f08c,
  moonGlow: 0x2bff5a,
  floor: 0x28d24a,
  floorGlow: 0x46ff7a,
  boothGlow: 0x8dff9a,
  laserGreen: 0x4dff6a,
  laserViolet: 0xb06bff,
  furCream: 0xf0c49a,
  furGinger: 0xe7a46a,
  pawPink: 0xff2a80,
  bowPink: 0xff8fc4,
  headphones: 0x1a1a1f,
  sword: 0xe8f0ff,
});

// ---------------------------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------------------------
export const BPM = 136;
/** Auto arrangement, in bars, looped: groove → build → drop → breakdown. */
export const ARRANGEMENT = Object.freeze([
  { section: 'intro', bars: 4 },
  { section: 'groove', bars: 12 },
  { section: 'build', bars: 8 },
  { section: 'drop', bars: 16 },
  { section: 'breakdown', bars: 8 },
] as const);

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------
/** API base per page host. Any other host: the bundled snapshot only (plus `?api=` in dev). */
export const API_BY_HOST: Readonly<Record<string, string>> = Object.freeze({
  'tokentails.com': 'https://api.tokentails.com',
  'www.tokentails.com': 'https://api.tokentails.com',
  // Local dev and preview: 5180 is the default dev port, 5181-5189 parallel dev servers, 4180 `vite preview`.
  ...Object.fromEntries(
    ['localhost', '127.0.0.1'].flatMap((h) =>
      [4180, 5180, 5181, 5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189].map((port) => [`${h}:${port}`, 'https://api.tokentails.com']),
    ),
  ),
});
/** GET {api}/shelter/payouts?network=mainnet&limit=2000 (public, `Access-Control-Allow-Origin: *`). */
export const PAYOUTS_PATH = '/shelter/payouts';
/**
 * Rave checkout routes on the same API host (CHECKOUT-SPEC.md section 3). `order` takes the order id
 * appended (`${RAVE_PATHS.order}${id}`). Keyed by host like the payout index, so the /rave path on
 * tokentails.com needs nothing extra.
 */
export const RAVE_PATHS = Object.freeze({
  status: '/rave/status',
  checkout: '/rave/checkout',
  cats: '/rave/cats',
  order: '/rave/orders/',
});
/** The index answer is cached 30 s server side; polling faster gains nothing. */
export const POLL_MS = 60_000;
/** Back off to this after repeated failures. */
export const POLL_MAX_MS = 5 * 60_000;
/** 1 USD in micro-USD. All money math is integer micro-USD (bigint while summing). */
export const MICRO = 1_000_000;
/** Dollar-pegged payout symbols, counted 1:1. */
export const USD_SYMBOLS = Object.freeze(['USDC', 'USDC.e', 'USDG', 'pathUSD']);
/**
 * EURC → USD. 1.00 on purpose: EUR trades above USD, so 1:1 undercounts and never inflates the
 * total. The backend's own checkout FX is also `fixed` at 1 (GET /payments/crypto/config, Oct 16).
 */
export const EURC_USD = 1.0;
export const EURC_USD_SOURCE = 'fixed 1:1 (undercounts; EUR > USD)';

/** Mainnet chains with a Pink Paw ShelterSplit (client/components/shelter-payouts/chains.ts). */
export const CHAINS: Readonly<Record<number, ChainInfo>> = Object.freeze({
  5042: { id: 5042, name: 'Arc', short: 'Arc', explorer: 'https://explorer.arc.io' },
  8453: { id: 8453, name: 'Base', short: 'Base', explorer: 'https://basescan.org' },
  42161: { id: 42161, name: 'Arbitrum One', short: 'Arbitrum', explorer: 'https://arbiscan.io' },
  43114: { id: 43114, name: 'Avalanche C-Chain', short: 'Avalanche', explorer: 'https://subnets.avax.network/c-chain' },
  4217: { id: 4217, name: 'Tempo', short: 'Tempo', explorer: 'https://explore.tempo.xyz' },
  4663: { id: 4663, name: 'Robinhood Chain', short: 'Robinhood', explorer: 'https://robinhoodchain.blockscout.com' },
  143: { id: 143, name: 'Monad', short: 'Monad', explorer: 'https://monadvision.com' },
});
export const explorerTx = (explorer: string, tx: string) => `${explorer.replace(/\/+$/, '')}/tx/${tx}`;

// ---------------------------------------------------------------------------------------------
// Ways to add a cat (all existing, live paths; SPEC.md "Add a cat").
// ---------------------------------------------------------------------------------------------
export const LINKS = Object.freeze({
  /** Give with a wallet (gasless USDC/EURC gift or native on Arc), plus the free daily treat. */
  give: 'https://tokentails.com/shelter-payouts/give',
  /** Every payout with its explorer link. */
  payouts: 'https://tokentails.com/shelter-payouts',
  /** Adopt a Pink Paw shelter cat ($5; 50% goes to the shelter as an on-chain payout). */
  adopt: 'https://tokentails.com/cats',
  /** The free sponsored treat: Token Tails pays $0.01 from its hot wallet, one per visitor per UTC day. */
  treatPath: '/shelter/donate/guest',
  treatStatusPath: '/shelter/donate/status',
  /** Canonical page URL (client/public/rave, rewritten from /rave in client/next.config.js). */
  self: 'https://tokentails.com/rave',
});

// ---------------------------------------------------------------------------------------------
// Quality tiers. L-UI picks one at boot (GPU/DPR/memory heuristics, `?quality=`) and steps down
// when the frame-time governor sees sustained misses.
// ---------------------------------------------------------------------------------------------
export const QUALITY: Readonly<Record<Quality, QualityProfile>> = Object.freeze({
  low: { quality: 'low', dprCap: 1.25, bloom: true, reflections: 'fake', maxCats: 2500, nearCats: 250, lasers: 6, haze: 1, confetti: 120, targetFps: 30 },
  mid: { quality: 'mid', dprCap: 1.5, bloom: true, reflections: 'fake', maxCats: 6000, nearCats: 500, lasers: 6, haze: 2, confetti: 80, targetFps: 30 },
  high: { quality: 'high', dprCap: 2, bloom: true, reflections: 'mirror', maxCats: 10000, nearCats: 1000, lasers: 8, haze: 3, confetti: 150, targetFps: 60 },
});

export const SHOTS: readonly ShotId[] = Object.freeze(['hero', 'top', 'pov', 'dj', 'orbit', 'sweep']);
