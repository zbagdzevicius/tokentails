/**
 * Embed bridge, game side: `{ns:'tt-pawlegends', v:1, type, ...}` (POC.md §11.1; pattern: swordcat
 * src/core/embed.js). Active only inside a frame with `?embed=1`. A message is accepted only from window.parent
 * and an allowlisted origin (VITE_EMBED_ORIGINS, comma-separated; localhost:3000 only in dev; plus the page's own
 * origin when the parent is same-origin, so a Vercel preview or a local dev port still reaches its host). The first valid
 * `hello` fixes the host origin; every post goes to it, never to '*'. Nothing is posted before the first hello, so
 * the host keeps saying hello until it hears `ready`. No accesstoken or Firebase token ever crosses.
 */
import { championByCatalogId, type ChampionId } from '../data/heroes/shelter';

export const EMBED_NS = 'tt-pawlegends';
export const EMBED_VERSION = 1;
export const DEFAULT_EMBED_ORIGINS = 'https://tokentails.com,https://www.tokentails.com';
export const DEV_EMBED_ORIGINS = 'http://localhost:3000';

/**
 * POC.md §11.1 types, plus the additive `offer{offer}` (the server offer engine), `save-result` (the host's save
 * queue for a `match-result`), `featured` (unowned direct-purchase cats, display only) and `champions` (sim v9: the
 * shelter champions' cards: art and whether each card is for sale, from `GET /pawlegends/champions`). Payload
 * shapes: docs/plans/moba integration plan §1; the parsers below are the game's half of the contract.
 */
export const HOST_TYPES = Object.freeze(['hello', 'session', 'roster', 'entitlements', 'audio', 'pause', 'resume', 'purchase-result', 'app', 'offer', 'save-result', 'featured', 'champions'] as const);
export type HostType = (typeof HOST_TYPES)[number];
/**
 * POC.md §11.1 types, plus the additive `notify{where}` (Legends Pass notify-me, only after `app{notify: true}`),
 * `request-sign-in{reason}`, `open-cat{catalogId}` (the host opens its Token Tails cat checkout),
 * `offer-seen{kind, catalogId}` and `champion-offer{catalogId}` (sim v9: a non-owner just finished a 3rd match on
 * a champion whose card is for sale; the host puts that cat first when it asks `GET /pawlegends/offer`, where every
 * global cap still applies), `skin-preview{catalogId}` (GDD §7.2: the player previewed a featured cat's card skin on
 * the pick screen; the host puts that cat first in its next offer ask, the server's caps still decide). `purchase-intent{sku}` is retired: the game no longer sells its own SKUs, so it never
 * sends it (the host still answers older builds).
 */
export const GAME_TYPES = Object.freeze(['ready', 'match-result', 'share', 'paused', 'notify', 'request-sign-in', 'open-cat', 'offer-seen', 'champion-offer', 'skin-preview'] as const);
export type GameType = (typeof GAME_TYPES)[number];

export interface HostMessage {
  type: HostType;
  [k: string]: unknown;
}

/** Parse a comma-separated origin list into normalised origins (invalid entries dropped). */
export function parseOrigins(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !out.includes(u.origin)) out.push(u.origin);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function allowedOrigins(env: { VITE_EMBED_ORIGINS?: string; DEV?: boolean } = import.meta.env): string[] {
  const raw = typeof env.VITE_EMBED_ORIGINS === 'string' && env.VITE_EMBED_ORIGINS.trim() ? env.VITE_EMBED_ORIGINS : DEFAULT_EMBED_ORIGINS;
  return parseOrigins(env.DEV ? `${raw},${DEV_EMBED_ORIGINS}` : raw);
}

/**
 * The allowlist plus the page's own origin when the parent frame is same-origin (the swordcat `withSameOrigin`
 * rule): the game is served under the host at /pawlegends-game/, so a preview or dev origin the build-time list
 * never named is still its own host. A cross-origin parent throws on `parent.location.origin`: the list stays as is.
 */
export function withSameOrigin(allowed: readonly string[], win: { location?: { origin?: string }; parent?: unknown }): string[] {
  let own: string | null = null;
  try {
    const o = win.location?.origin;
    const po = (win.parent as { location?: { origin?: string } } | undefined)?.location?.origin;
    if (typeof o === 'string' && o && o !== 'null' && o === po) own = o;
  } catch {
    own = null;
  }
  return own && !allowed.includes(own) ? [...allowed, own] : [...allowed];
}

/** The host message in `data`, or null when it is not ours (wrong ns, version or type). Pure. */
export function parseHostMessage(data: unknown): HostMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.ns !== EMBED_NS || m.v !== EMBED_VERSION || typeof m.type !== 'string') return null;
  if (!(HOST_TYPES as readonly string[]).includes(m.type)) return null;
  return m as HostMessage;
}

/** Accept an event? `fixed` is the host origin after the first hello (or null before). Pure. */
export function acceptOrigin(origin: string, allow: readonly string[], fixed: string | null): boolean {
  return fixed ? origin === fixed : allow.includes(origin);
}

export interface Bridge {
  readonly active: boolean;
  post(type: GameType, payload?: Record<string, unknown>): boolean;
  on(handler: (m: HostMessage) => void): void;
}

/** Install on the page. Inactive (posts nothing) unless framed with ?embed=1. */
export function installBridge(win: Window = window, version = String(import.meta.env.VITE_PAWLEGENDS_BUILD ?? 'dev')): Bridge {
  const framed = win.parent !== win && new URLSearchParams(win.location.search).get('embed') === '1';
  const handlers: ((m: HostMessage) => void)[] = [];
  const allow = framed ? withSameOrigin(allowedOrigins(), win) : allowedOrigins();
  let host: string | null = null;
  const post = (type: GameType, payload: Record<string, unknown> = {}): boolean => {
    if (!framed || !host) return false;
    win.parent.postMessage({ ...payload, ns: EMBED_NS, v: EMBED_VERSION, type }, host);
    return true;
  };
  if (framed) {
    win.document.documentElement.dataset.embed = '1';
    win.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== win.parent || !acceptOrigin(e.origin, allow, host)) return;
      const m = parseHostMessage(e.data);
      if (!m) return;
      if (m.type === 'hello') {
        host = e.origin;
        post('ready', { version });
      }
      for (const h of handlers) h(m);
    });
  }
  return { active: framed, post, on: (h) => void handlers.push(h) };
}

// ------------------------------------------------------------------------------------- payload parsers (pure)
// Every parser takes an untrusted message and returns a clean value, or null for "malformed: ignore it". Unknown
// fields are dropped, never passed on.

/** Difficulty keys of `session.progress` (shared/caps.ts PAWLEGENDS_LEVELS). */
export const PROGRESS_LEVELS = Object.freeze(['easy', 'normal', 'rookie', 'hard'] as const);
export type ProgressLevel = (typeof PROGRESS_LEVELS)[number];
/** shared/caps.ts PAWLEGENDS_LEVEL_CAPS by level (display only: the backend pays; a unit test pins the mirror). */
export const LEVEL_CATNIP: Readonly<Record<ProgressLevel, number>> = Object.freeze({ easy: 20, normal: 40, rookie: 10, hard: 0 });
/** shared/caps.ts PAWLEGENDS_MAX_TICKS (30 Hz × 660 s). */
export const PROGRESS_MAX = 19800;

export interface Progress {
  /** Catnip paid per level (first replay-verified win). */
  catnip: Record<ProgressLevel, number>;
  /** Saved matches per level. */
  matches: Record<ProgressLevel, number>;
  /** Fastest verified win per level in sim ticks (0 = none yet). */
  fastestWin: Record<ProgressLevel, number>;
}

export const MATCH_ID = /^[a-z0-9]{1,16}$/;
export const CATALOG_ID = /^[0-9a-f]{24}$/;
/**
 * Cat art may come only from the Token Tails NFT bucket, https: virtual-host style (`tokentails-nfts.fra1.cdn…`, any
 * path, what `catImg` holds) or path-style (`fra1.cdn…/tokentails-nfts/…`). Anything else is dropped, never fetched.
 */
export const ART_HOST = 'fra1.cdn.digitaloceanspaces.com';
export const ART_BUCKET_HOST = 'tokentails-nfts.fra1.cdn.digitaloceanspaces.com';
export const ART_PATH = '/tokentails-nfts/';

const int = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

/** One level map: known levels only, a bad or missing value reads 0 (never a reason to drop the whole message). */
function levelMap(v: unknown): Record<ProgressLevel, number> {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = {} as Record<ProgressLevel, number>;
  for (const l of PROGRESS_LEVELS) out[l] = int(o[l], PROGRESS_MAX) ?? 0;
  return out;
}

/** `session.progress`: null when absent or not an object (the game then keeps its local numbers). */
export function parseProgress(v: unknown): Progress | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return { catnip: levelMap(o.catnip), matches: levelMap(o.matches), fastestWin: levelMap(o.fastestWin) };
}

export interface SessionInfo {
  signedIn: boolean;
  progress: Progress | null;
}

export function parseSession(m: Record<string, unknown>): SessionInfo | null {
  if (typeof m.signedIn !== 'boolean') return null;
  return { signedIn: m.signedIn, progress: m.signedIn ? parseProgress(m.progress) : null };
}

export const SAVE_STATUSES = Object.freeze(['saving', 'saved', 'queued', 'failed', 'rejected'] as const);
export type SaveStatus = (typeof SAVE_STATUSES)[number];

export interface SaveResult {
  matchId: string;
  status: SaveStatus;
  catnipPaid: number;
  catnipTotal: number | null;
  fastestWin: number | null;
  code?: string;
}

export function parseSaveResult(m: Record<string, unknown>): SaveResult | null {
  if (typeof m.matchId !== 'string' || !MATCH_ID.test(m.matchId)) return null;
  if (!(SAVE_STATUSES as readonly unknown[]).includes(m.status)) return null;
  const paid = int(m.catnipPaid, 1_000_000);
  if (paid === null) return null;
  const total = m.catnipTotal === null || m.catnipTotal === undefined ? null : int(m.catnipTotal, Number.MAX_SAFE_INTEGER);
  if (total === null && m.catnipTotal !== null && m.catnipTotal !== undefined) return null;
  const fastest = m.fastestWin === null || m.fastestWin === undefined ? null : int(m.fastestWin, PROGRESS_MAX);
  if (fastest === null && m.fastestWin !== null && m.fastestWin !== undefined) return null;
  const out: SaveResult = { matchId: m.matchId, status: m.status as SaveStatus, catnipPaid: paid, catnipTotal: total, fastestWin: fastest };
  if (typeof m.code === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(m.code)) out.code = m.code;
  return out;
}

/** A cat image URL the game may load, or undefined (anything else is dropped, never fetched). */
export function cleanArt(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 512) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || /\.\.|%2e%2e/i.test(v)) return undefined;
    if (u.hostname === ART_BUCKET_HOST) return u.href;
    if (u.hostname === ART_HOST && u.pathname.startsWith(ART_PATH)) return u.href;
    return undefined;
  } catch {
    return undefined;
  }
}

/** A cat sprite sheet URL (`spriteImg`): an allowlisted CDN `.png`, or undefined. */
export function cleanSprite(v: unknown): string | undefined {
  const u = cleanArt(v);
  return u && /\.png$/i.test(new URL(u).pathname) ? u : undefined;
}

/** `assets/<FAMILY>/<variant>.png` on the cleaned sprite URL (the breed folder is only known from here). */
export const SPRITE_PATH = /\/assets\/([A-Z0-9_-]+)\/([A-Za-z0-9_-]+)\.png$/;
export function spriteParts(url: string): { family: string; variant: string } | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = SPRITE_PATH.exec(path);
  return m ? { family: m[1], variant: m[2] } : null;
}

const CARD_TIERS: readonly string[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export const cleanCatalogId = (v: unknown): string | undefined => (typeof v === 'string' && CATALOG_ID.test(v) ? v : undefined);

const ELEMENT_TYPES: readonly string[] = ['ICE', 'ELECTRIC', 'FIRE', 'WIND', 'DARK', 'WATER', 'GRASS', 'SAND', 'FAIRY', 'STELLAR'];

export interface FeaturedCat {
  catalogId: string;
  name: string;
  type: string;
  art?: string;
  /** Sprite sheet (card skin previews and showcase bots; GDD §7.2). */
  sprite?: string;
  /** The cat's tier (a showcase skin shows at most Rare). */
  tier?: string;
}

export const FEATURED_MAX = 2;

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 24) : null;
}

/** `featured.cats`: the first FEATURED_MAX valid cats, bad ones skipped (null when `cats` is not a list). */
export function parseFeatured(m: Record<string, unknown>): FeaturedCat[] | null {
  if (!Array.isArray(m.cats)) return null;
  const out: FeaturedCat[] = [];
  for (const raw of m.cats.slice(0, 16)) {
    if (out.length >= FEATURED_MAX) break;
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const catalogId = cleanCatalogId(c.catalogId);
    const name = cleanText(c.name);
    if (!catalogId || !name || typeof c.type !== 'string' || !ELEMENT_TYPES.includes(c.type)) continue;
    if (out.some((x) => x.catalogId === catalogId)) continue;
    const cat: FeaturedCat = { catalogId, name, type: c.type };
    const art = cleanArt(c.art);
    if (art) cat.art = art;
    const sprite = cleanSprite(c.sprite);
    if (sprite) cat.sprite = sprite;
    if (typeof c.tier === 'string' && CARD_TIERS.includes(c.tier)) cat.tier = c.tier;
    out.push(cat);
  }
  return out;
}

/** One shelter champion's card (sim v9), as the host sends it: only the four champion catalog ids are kept. */
export interface ChampionCard {
  catalogId: string;
  hero: ChampionId;
  /** The card can be adopted on Token Tails right now (false: sold out or the cat was adopted; the champion stays). */
  forSale: boolean;
  /** The card's `catImg` (the NFT bucket only). */
  art?: string;
}

/** `champions.cats`: the known champion cards, bad or unknown entries skipped (null when `cats` is not a list). */
export function parseChampions(m: Record<string, unknown>): ChampionCard[] | null {
  if (!Array.isArray(m.cats)) return null;
  const out: ChampionCard[] = [];
  for (const raw of m.cats.slice(0, 16)) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const champion = championByCatalogId(cleanCatalogId(c.catalogId) ?? '');
    if (!champion || out.some((x) => x.catalogId === champion.catalogId)) continue;
    const card: ChampionCard = { catalogId: champion.catalogId, hero: champion.hero, forSale: c.forSale === true };
    const art = cleanArt(c.catImg);
    if (art) card.art = art;
    out.push(card);
  }
  return out;
}

export interface MeetOffer {
  kind: 'meet';
  catalogId: string;
}

/** `offer.offer`: a Meet offer, null (none), or undefined (malformed or a retired kind: ignore). */
export function parseOffer(m: Record<string, unknown>): MeetOffer | null | undefined {
  const o = m.offer;
  if (o === null) return null;
  if (!o || typeof o !== 'object') return undefined;
  const r = o as Record<string, unknown>;
  const catalogId = cleanCatalogId(r.catalogId);
  if (r.kind !== 'meet' || !catalogId) return undefined;
  return { kind: 'meet', catalogId };
}

export interface AppInfo {
  isApp: boolean;
  /** The Token Tails cat checkout is reachable (never in an app build). */
  store: boolean;
  /** The host takes notify-me sign-ups (the game still shows none in an app build: Entitlements.notifyOpen). */
  notify: boolean;
}

export function parseApp(m: Record<string, unknown>): AppInfo | null {
  if (typeof m.isApp !== 'boolean') return null;
  return { isApp: m.isApp, store: m.store === true && !m.isApp, notify: m.notify === true };
}

/** `entitlements.token`: a string or null (the token itself is read by money/entitlements.ts). */
export function parseEntitlements(m: Record<string, unknown>): { token: string | null } | null {
  if (m.token === null) return { token: null };
  return typeof m.token === 'string' && m.token.length <= 9000 ? { token: m.token } : null;
}

export interface CatPurchaseResult {
  catalogId: string;
  ok: boolean;
}

export function parsePurchaseResult(m: Record<string, unknown>): CatPurchaseResult | null {
  const catalogId = cleanCatalogId(m.catalogId);
  if (!catalogId || typeof m.ok !== 'boolean') return null;
  return { catalogId, ok: m.ok };
}

export interface AudioInfo {
  muted: boolean;
  music?: number;
  sfx?: number;
}

export function parseAudio(m: Record<string, unknown>): AudioInfo | null {
  if (typeof m.muted !== 'boolean') return null;
  const out: AudioInfo = { muted: m.muted };
  const vol = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined);
  const music = vol(m.music);
  const sfx = vol(m.sfx);
  if (music !== undefined) out.music = music;
  if (sfx !== undefined) out.sfx = sfx;
  return out;
}

export const SIGN_IN_REASONS = Object.freeze(['save-progress', 'claim-rewards'] as const);
export type SignInReason = (typeof SIGN_IN_REASONS)[number];
