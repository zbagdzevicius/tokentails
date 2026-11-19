/**
 * What's New (founder Nov 19): the store drop, the Legends Pass season, the live events and later champion releases
 * and patches no longer sit on Home as a rotating promo card. Each one is told ONCE, in a comic-page modal
 * (ui/showcase/showcaseModal.ts, its own chunk) that opens over Home after the first guided match. The modal only
 * informs: its button opens the screen that owns the thing (Store, Pass, Quests → Events, the champion browser).
 *
 * This module is the data half, pure (no DOM): the feed is a function of the time, the live-ops config (the drop and
 * Winter Nap, server or baked) and the catalogue (SEASONS), plus `EXTRA_ITEMS` written by hand. A new showcase is a data
 * change: add an entry to EXTRA_ITEMS (or, later, the backend's live-ops config with the same shape) and drop its art in
 * pawlegends-web/public/pawlegends-art/showcase/<art>-{360|720}.webp.
 *
 * Seen state: `pawlegends.showcaseSeen` (this device: every id seen and its end, pruned 60 days after the end) and
 * `pawlegends.showcase.seen` (≤ 32 characters, so it rides the account's synced device settings, progressCloud.ts
 * SYNCED_KEYS: the short hashes of the newest seen ids). An id counts as seen when either holds it.
 */
import { EFFECT_COATS, HERO_LABEL, SEASONS, STORE_COATS, type SeasonDef } from '../money/catalog';
import type { HeroId } from '../sim/api';
import type { LiveopsDrop, LiveopsNap } from './liveops';

export type ShowcaseType = 'store-drop' | 'pass-season' | 'event' | 'champion' | 'patch' | 'generic';

/** Where the page's button goes: the screen that owns the thing (never a copy of it). */
export type ShowcaseTarget =
  | { screen: 'store'; tab?: 'coats' | 'champions' }
  | { screen: 'pass' }
  | { screen: 'quests'; tab: 'events' | 'today' }
  | { screen: 'champion'; hero: HeroId; coat?: string }
  | { screen: 'none' };

/** One thing on the page's strip: a coat of the drop, a tier reward, a gift. */
export interface ShowcaseThing {
  id: string;
  label: string;
  /** Picture URL (absent: a glyph by `kind`). */
  art?: string;
  sub?: string;
  kind?: 'coat' | 'title' | 'frame' | 'gift';
}

export interface ShowcaseItem {
  /** Versioned and stable: 'drop-2026-11', 'pass-s1', 'nap-2026', 'champ-<hero>-<yyyymm>', 'patch-<ver>'. */
  id: string;
  type: ShowcaseType;
  /** The headline (≤ 18 characters reads best; uppercased by the CSS). */
  title: string;
  kicker?: string;
  /** The speech bubble: at most 14 words (tests/unit/showcase.test.ts). */
  blurb: string;
  /** Art: a key under pawlegends-art/showcase/ ('drop-2026-11' → drop-2026-11-720.webp) or an absolute URL. */
  art: string;
  /** The starburst on the art (≤ 8 characters). */
  burst?: string;
  startsAt: number;
  endsAt: number;
  /** Shown from here (a pre-announce); default `startsAt`. Before `startsAt` the clock says "Starts in". */
  showFrom?: number;
  /** Higher first. */
  priority: number;
  cta: { label: string; target: ShowcaseTarget };
  things?: ShowcaseThing[];
  /** Web store only (never in the apps, never with the store closed). */
  web?: boolean;
}

export interface ShowcaseCtx {
  now: number;
  isApp: boolean;
  storeOpen: boolean;
  drop: LiveopsDrop | null;
  nap: LiveopsNap | null;
  /** ui/art.ts artRoot(): where pawlegends.app serves the art. */
  artRoot: string;
  /** Low quality tier or a short phone: the 360 px art. */
  lowTier: boolean;
  /** A thing's picture (ui/art.ts: the skin art, else the hero's face); absent: no pictures (glyphs). */
  thingArt?: (item: string, hero: string | null) => string | undefined;
}

const DAY = 86_400_000;

/** Type priorities (spec §3): the drop first, then a champion, the season, events, patches, the rest. */
export const PRIORITY: Readonly<Record<ShowcaseType, number>> = Object.freeze({ 'store-drop': 50, champion: 45, 'pass-season': 40, event: 30, patch: 20, generic: 10 });

/**
 * Hand-written showcases (patch notes, champion releases, anything else): a new entry here is the whole change. Times
 * are ms UTC. Example:
 *   { id: 'patch-1-4', type: 'patch', title: 'Patch 1.4', blurb: 'Faster queues and a fairer Blitz.', art: 'generic',
 *     startsAt: Date.parse('2026-12-01T00:00:00Z'), endsAt: Date.parse('2026-12-15T00:00:00Z'), priority: PRIORITY.patch,
 *     cta: { label: 'Got it', target: { screen: 'none' } } }
 */
export const EXTRA_ITEMS: readonly ShowcaseItem[] = Object.freeze([]);

/** The page's art URL: a key under showcase/ (360 or 720 wide), or an absolute URL as it is. Pure. */
export function showcaseArt(art: string, ctx: Pick<ShowcaseCtx, 'artRoot' | 'lowTier'>): string {
  if (/^(https?:|\/|data:)/.test(art)) return art;
  return `${ctx.artRoot}showcase/${encodeURIComponent(art)}-${ctx.lowTier ? 360 : 720}.webp`;
}

const COAT_NAMES: ReadonlyMap<string, string> = new Map([...STORE_COATS, ...EFFECT_COATS].map((c) => [c.id, c.name]));
const heroOf = (item: string): string | null => (item.startsWith('coat.') ? (item.split('.')[1] ?? null) : null);
/** "Chairman of the Board" (catalogue name without " coat"), else a name made from the id. Pure. */
export function coatShortName(id: string): string {
  const n = COAT_NAMES.get(id);
  if (n) return n.replace(/ coat$/i, '');
  const key = id.split('.').slice(2).join(' ').replace(/^(store_|s\d+_|loop )/, '');
  return key.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function dropItem(d: LiveopsDrop, ctx: ShowcaseCtx): ShowcaseItem {
  const web = ctx.storeOpen && !ctx.isApp;
  const [title, kicker] = d.name.split(/:\s*/, 2);
  const n = d.coats.length;
  return {
    id: d.id,
    type: 'store-drop',
    title: title || d.name,
    ...(kicker ? { kicker } : {}),
    blurb: n === 1 ? 'A new coat with its own effects.' : `${n} new coats, each with its own effects.`,
    art: d.id,
    burst: 'NEW!',
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    priority: PRIORITY['store-drop'],
    // the web store's coats (the drop first); the apps open no store: the lead coat on its champion
    cta: web ? { label: 'See the coats', target: { screen: 'store', tab: 'coats' } } : { label: 'Try it on', target: { screen: 'champion', hero: (heroOf(d.coats[0]!) ?? 'clem') as HeroId, coat: d.coats[0]! } },
    things: d.coats.slice(0, 4).map((c) => {
      const h = heroOf(c);
      const art = ctx.thingArt?.(c, h);
      return { id: c, label: coatShortName(c), ...(h && HERO_LABEL[h] ? { sub: HERO_LABEL[h] } : {}), ...(art ? { art } : {}), kind: 'coat' as const };
    }),
  };
}

/** The season running at `now` by its dates (the catalogue, never the server snapshot), or null. Pure. */
export const seasonAt = (now: number): SeasonDef | null => SEASONS.find((s) => Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt)) ?? null;

/** The free-road tiers the season page shows. */
export const PASS_TIERS: readonly number[] = Object.freeze([3, 9, 15, 30]);

function passItem(s: SeasonDef, ctx: ShowcaseCtx): ShowcaseItem {
  const num = /\d+/.exec(s.id)?.[0] ?? '';
  return {
    id: `pass-${s.id}`,
    type: 'pass-season',
    title: 'Legends Pass',
    kicker: s.name,
    blurb: `${s.tiers} tiers. The free road pays coats, titles and frames.`,
    art: `pass-${s.id}`,
    burst: num ? `SEASON ${num}` : 'SEASON',
    startsAt: Date.parse(s.startsAt),
    endsAt: Date.parse(s.endsAt),
    priority: PRIORITY['pass-season'],
    cta: { label: 'Open the Pass', target: { screen: 'pass' } },
    things: s.free
      .filter((r) => PASS_TIERS.includes(r.tier))
      .map((r) => {
        const kind = r.item.startsWith('coat.') ? 'coat' : r.item.startsWith('title.') ? 'title' : r.item.startsWith('frame.') ? 'frame' : 'gift';
        const art = kind === 'coat' ? ctx.thingArt?.(r.item, r.hero ?? heroOf(r.item)) : undefined;
        return { id: r.item, label: `Tier ${r.tier}`, sub: r.name.replace(/ (coat|title|frame)$/i, ''), ...(art ? { art } : {}), kind };
      }),
  };
}

function napItem(n: LiveopsNap, ctx: ShowcaseCtx): ShowcaseItem {
  const days = Math.round((n.endsAt - n.startsAt) / DAY);
  const pick = n.gifts.filter((g) => g.day <= 3 || g.day === 7);
  return {
    id: n.id,
    type: 'event',
    title: n.name,
    kicker: `${days} days of gifts`,
    blurb: 'Each day you play opens the next gift. Skipped days never reset it.',
    art: n.id,
    burst: 'EVENT',
    startsAt: n.startsAt,
    endsAt: n.endsAt,
    showFrom: n.startsAt - 7 * DAY,
    priority: PRIORITY.event,
    cta: { label: 'See the event', target: { screen: 'quests', tab: 'events' } },
    ...(pick.length
      ? {
          things: pick.map((g) => {
            const h = heroOf(g.item);
            const art = ctx.thingArt?.(g.item, h);
            return { id: g.item, label: `Day ${g.day}`, sub: g.name.replace(/ coat for .*$/i, ''), ...(art ? { art } : {}), kind: 'gift' as const };
          }),
        }
      : {}),
  };
}

/** Every showcase item there is now or soon (live or pre-announced, seen or not). Pure. */
export function showcaseFeed(ctx: ShowcaseCtx, extra: readonly ShowcaseItem[] = EXTRA_ITEMS): ShowcaseItem[] {
  const out: ShowcaseItem[] = [];
  if (ctx.drop && ctx.now < ctx.drop.endsAt) out.push(dropItem(ctx.drop, ctx));
  const s = seasonAt(ctx.now);
  if (s) out.push(passItem(s, ctx));
  if (ctx.nap && ctx.now < ctx.nap.endsAt) out.push(napItem(ctx.nap, ctx));
  out.push(...extra);
  return out.map((x) => ({ ...x, art: showcaseArt(x.art, ctx) }));
}

/** Is the item on show at `now` (its pre-announce or its run)? Pure. */
export const isLive = (x: Pick<ShowcaseItem, 'showFrom' | 'startsAt' | 'endsAt'>, now: number): boolean => (x.showFrom ?? x.startsAt) <= now && now < x.endsAt;

/**
 * The pages one opening shows: live, not seen, web-store items only on the web with the store open, by priority (then
 * the soonest end), at most `max`. Pure.
 */
export function queueFor(feed: readonly ShowcaseItem[], seen: ReadonlySet<string> | ((id: string) => boolean), now: number, ctx: Pick<ShowcaseCtx, 'isApp' | 'storeOpen'> = { isApp: false, storeOpen: true }, max = 4): ShowcaseItem[] {
  const has = typeof seen === 'function' ? seen : (id: string) => seen.has(id);
  return feed
    .filter((x) => isLive(x, now) && !has(x.id) && (!x.web || (ctx.storeOpen && !ctx.isApp)))
    .sort((a, b) => b.priority - a.priority || a.endsAt - b.endsAt)
    .slice(0, Math.max(0, max));
}

/** The page's clock: "Starts in 3d 4h" before the start, else "Ends in 11d 4h"; '' once over. Pure. */
export function timeLine(x: Pick<ShowcaseItem, 'startsAt' | 'endsAt'>, now: number, countdown: (ms: number) => string): string {
  if (now < x.startsAt) return `Starts in ${countdown(x.startsAt - now)}`;
  if (now < x.endsAt) return `Ends in ${countdown(x.endsAt - now)}`;
  return '';
}

// ------------------------------------------------------------------------------------------------ the seen state

export const SEEN_KEY = 'pawlegends.showcaseSeen';
/** The synced copy (progressCloud.ts SYNCED_KEYS carries strings of at most 32 characters). */
export const SEEN_SYNC_KEY = 'pawlegends.showcase.seen';
export const SEEN_MAX = 60;
/** Hashes in the synced key: 6 × 4 characters + commas = 29 ≤ 32. */
export const SYNC_MAX = 6;
const PRUNE_AFTER = 60 * DAY;
const ID = /^[a-z0-9][a-z0-9._-]{0,47}$/;

export interface SeenState {
  v: 1;
  /** [id, endsAt] in the order seen (oldest first). */
  seen: [string, number][];
  /** Short hashes from the account (another device). */
  synced: string[];
}

/** A 4-character base-36 hash of an id (FNV-1a). Pure. */
export function seenHash(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 1679616).toString(36).padStart(4, '0');
}

/** Parse both keys (bad data: nothing seen). Pure. */
export function parseSeen(local: string | null, synced: string | null): SeenState {
  const out: SeenState = { v: 1, seen: [], synced: [] };
  try {
    const o = JSON.parse(local ?? 'null') as { v?: unknown; seen?: unknown } | null;
    if (o && o.v === 1 && Array.isArray(o.seen))
      for (const e of o.seen)
        if (Array.isArray(e) && typeof e[0] === 'string' && ID.test(e[0]) && typeof e[1] === 'number' && Number.isFinite(e[1]) && !out.seen.some(([id]) => id === e[0]))
          out.seen.push([e[0], e[1]]);
  } catch {
    /* bad JSON: nothing seen */
  }
  out.seen = out.seen.slice(-SEEN_MAX);
  out.synced = [...new Set((synced ?? '').split(',').filter((h) => /^[0-9a-z]{4}$/.test(h)))].slice(0, SYNC_MAX);
  return out;
}

/** Has this id been shown (here, or on another device of the account)? Pure. */
export const isSeen = (s: SeenState, id: string): boolean => s.seen.some(([x]) => x === id) || s.synced.includes(seenHash(id));

/**
 * Mark items seen: appended (newest last, at most SEEN_MAX, ids ended over 60 days ago dropped); their hashes lead the
 * synced list (the union with what the account had, newest first, at most SYNC_MAX). Pure.
 */
export function markSeen(s: SeenState, items: readonly Pick<ShowcaseItem, 'id' | 'endsAt'>[], now: number): SeenState {
  const add = items.filter((x) => ID.test(x.id));
  const ids = new Set(add.map((x) => x.id));
  const seen = [...s.seen.filter(([id, end]) => !ids.has(id) && end + PRUNE_AFTER > now), ...add.map((x): [string, number] => [x.id, x.endsAt])].slice(-SEEN_MAX);
  const synced = [...new Set([...add.map((x) => seenHash(x.id)).reverse(), ...s.synced])].slice(0, SYNC_MAX);
  return { v: 1, seen, synced };
}

type Kv = Pick<Storage, 'getItem' | 'setItem'>;
const kv = (): Kv | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadSeen(store: Kv | null = kv()): SeenState {
  try {
    return parseSeen(store?.getItem(SEEN_KEY) ?? null, store?.getItem(SEEN_SYNC_KEY) ?? null);
  } catch {
    return parseSeen(null, null);
  }
}

export function saveSeen(s: SeenState, store: Kv | null = kv()): void {
  try {
    store?.setItem(SEEN_KEY, JSON.stringify({ v: 1, seen: s.seen }));
    store?.setItem(SEEN_SYNC_KEY, s.synced.join(','));
  } catch {
    /* blocked storage: this page only */
  }
}
