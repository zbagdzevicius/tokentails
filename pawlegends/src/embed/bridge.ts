/**
 * Embed bridge, game side: `{ns:'tt-pawlegends', v:1, type, ...}` (POC.md §11.1; pattern: swordcat
 * src/core/embed.js). Active only inside a frame with `?embed=1`. A message is accepted only from window.parent
 * and an allowlisted origin (VITE_EMBED_ORIGINS, comma-separated; localhost:3000 only in dev; plus the page's own
 * origin when the parent is same-origin, so a Vercel preview or a local dev port still reaches its host). The first valid
 * `hello` fixes the host origin; every post goes to it, never to '*'. Nothing is posted before the first hello, so
 * the host keeps saying hello until it hears `ready`. No accesstoken or Firebase token ever crosses.
 *
 * In the native app there is no frame: the shell installs an in-page host (`window.__PL_HOST__`,
 * pawlegends-app/src/host) before the game loads, and the same messages travel over that channel (`kind: 'native'`).
 */
import { championByCatalogId, type ChampionId } from '../data/heroes/shelter';
import { inAppShell } from '../app/platform';
import { parseChampionsState, type ChampionsState } from '../meta/champions';

export const EMBED_NS = 'tt-pawlegends';
export const EMBED_VERSION = 1;
// pawlegends.app (pawlegends-web, docs/plans/moba/PAWLEGENDS-WEB.md) is same-origin with the game, so withSameOrigin
// already admits it; listed anyway so a cross-origin preview of the host can name it.
export const DEFAULT_EMBED_ORIGINS = 'https://pawlegends.app,https://tokentails.com,https://www.tokentails.com';
export const DEV_EMBED_ORIGINS = 'http://localhost:3000';

/**
 * POC.md §11.1 types, plus the additive `offer{offer}` (the server offer engine), `save-result` (the host's save
 * queue for a `match-result`), `featured` (unowned direct-purchase cats, display only) and `champions` (sim v9: the
 * shelter champions' cards: art and whether each card is for sale, from `GET /pawlegends/champions`). Payload
 * shapes: docs/plans/moba integration plan §1; the parsers below are the game's half of the contract.
 */
export const HOST_TYPES = Object.freeze(['hello', 'session', 'roster', 'entitlements', 'audio', 'pause', 'resume', 'purchase-result', 'app', 'offer', 'save-result', 'featured', 'champions', 'party-ticket', 'store', 'api-result'] as const);
export type HostType = (typeof HOST_TYPES)[number];
/**
 * POC.md §11.1 types, plus the additive `notify{where}` (Legends Pass notify-me, only after `app{notify: true}`),
 * `request-sign-in{reason}`, `client-error{source, msg, screen, tier, sim}` (launch finding R1: a game or worker crash, `msg` already cut to
 * `crashCode` in app/crash.ts; the host reports it as its scrubbed `app_error`), `analytics{event, props}` (launch
 * finding PUB-02: a game analytics event, flat props of numbers, booleans and short strings; the host sends it with its
 * own `analytics.track`, so it follows the site's policy). `purchase-intent{sku}` is retired: the game no longer sells its own SKUs, so it never
 * sends it (the host still answers older builds).
 */
/**
 * Party play (docs/plans/moba/MULTIPLAYER.md §5.3, §6): `party-ticket-request{id}` asks the host for a single-use party
 * ticket, which the host mints with its own session and answers as `party-ticket{id, ticket|null, error?}` (the
 * access token never crosses); `party-result{matchId, result}` hands a party match's v:2 result to the host's save
 * path (`POST /user/catbassadors/live`), whose status comes back as `save-result{matchId: room}`.
 * `exit{}`: the player tapped the lobby's "Games" button; the host leaves for its games page (it lays no close
 * button of its own over the game any more). `sound{muted}`: the player switched the game's Sound; the host makes it
 * its own mute (tt:audio:v1), so the next `audio` it sends agrees (a host mute is never saved into the game profile).
 * `reload-request{reason, version?}` (force update, docs/plans/moba/FORCE-UPDATE.md §5.1): this build is outdated and
 * the player is on the title; the host starts the frame again on the latest build (`?v=<version>`). An older host
 * ignores it, and the game then reloads its own frame.
 */
export const GAME_TYPES = Object.freeze(['ready', 'match-result', 'share', 'paused', 'sound', 'notify', 'request-sign-in', 'open-cat', 'offer-seen', 'champion-offer', 'skin-preview', 'client-error', 'analytics', 'party-ticket-request', 'party-result', 'exit', 'purchase-intent', 'pass-claim', 'api-request', 'account', 'champ-unlock', 'reload-request'] as const);
export type GameType = (typeof GAME_TYPES)[number];
/*
 * Store and Legends Pass (docs/plans/moba/STORE-PASS.md, web only): `purchase-intent{sku}` is back for the catalogue
 * SKUs only (money/catalog.ts): the host opens its own sheet (sign-in, server price, age band, consent, safeguards)
 * and Stripe Checkout, then answers `purchase-result{sku, ok}` and a fresh `store`. `pass-claim{row, tier}` or
 * `pass-claim{all: true}` asks the host to claim pass rewards (`POST /pawlegends/pass/claim`); it answers `store`.
 * `store{items, season}` is the account's owned store and pass items and its pass row (`GET /pawlegends/me`).
 *
 * Champion store (docs/plans/moba/CHAMPION-STORE.md): `store.champions` is the account's champions, the week's
 * rotation and its Yarn. `purchase-intent{sku}` also takes the champion SKUs (`pl_champ_*`, `pl_champs_*`, web only).
 * `champ-unlock{hero, via: 'yarn' | 'pick'}` asks the host to unlock a champion with Yarn or a Champion Pick (`POST
 * /pawlegends/champions/unlock`, the app too: no money); it answers a fresh `store`.
 */

/*
 * Social, ranked and reports (docs/plans/moba/SOCIAL-RANKED.md §13): `api-request{id, op, args}` asks the host to call
 * one allowlisted route (embed/api.ts `API_OPS`) with its own session; it answers `api-result{id, ok, status, body?}`.
 * The game never sees a token or a URL.
 */

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
  /**
   * How the host is reached: `frame` (the Token Tails page around an `?embed=1` iframe), `native` (the app shell's
   * in-page host, `window.__PL_HOST__`), or null (standalone: nothing is posted).
   */
  readonly kind: 'frame' | 'native' | null;
  post(type: GameType, payload?: Record<string, unknown>): boolean;
  on(handler: (m: HostMessage) => void): void;
}

/**
 * The app shell's in-page host (pawlegends-app/src/host, installed by `shell.js` before the game loads): the same
 * protocol as the iframe host, over a same-window channel instead of postMessage. `post` hands a game message to the
 * host, `listen` registers the game's one receiver. The shell copies every message (structuredClone) and delivers
 * it on a later task, so neither side can hold the other's objects.
 */
export interface NativeHostChannel {
  post(message: unknown): void;
  listen(receiver: (message: unknown) => void): void;
}

/**
 * Game messages the in-app host takes. Everything else stays with the game's standalone path (post returns false):
 * share and copy use the game's own fallback, exit and notify have no meaning in the app, analytics and crash reports
 * are not collected there (no analytics on the privacy label), and nothing about cats for sale or purchases is ever
 * sent (App Store 3.1.1, Google Play payments). `champ-unlock` is: Yarn and Champion Picks are earned, never bought.
 */
export const NATIVE_HOST_TYPES: readonly GameType[] = Object.freeze(['ready', 'match-result', 'request-sign-in', 'account', 'party-ticket-request', 'party-result', 'pass-claim', 'api-request', 'paused', 'sound', 'champ-unlock']);

/** The shell's channel on this page, or null (not the app, or no valid channel). Never throws. */
export function nativeChannel(win: unknown): NativeHostChannel | null {
  try {
    if (!inAppShell(undefined, win)) return null;
    const ch = (win as { __PL_HOST__?: unknown }).__PL_HOST__ as Partial<NativeHostChannel> | undefined;
    return ch && typeof ch.post === 'function' && typeof ch.listen === 'function' ? (ch as NativeHostChannel) : null;
  } catch {
    return null;
  }
}

/** Install on the page. Inactive (posts nothing) unless framed with ?embed=1 or run by the app shell's host. */
export function installBridge(win: Window = window, version = String(import.meta.env.VITE_PAWLEGENDS_BUILD ?? 'dev')): Bridge {
  const framed = win.parent !== win && new URLSearchParams(win.location.search).get('embed') === '1';
  const native = framed ? null : nativeChannel(win);
  const handlers: ((m: HostMessage) => void)[] = [];
  const allow = framed ? withSameOrigin(allowedOrigins(), win) : allowedOrigins();
  let host: string | null = null;
  const post = (type: GameType, payload: Record<string, unknown> = {}): boolean => {
    if (!host) return false;
    if (native) {
      if (!NATIVE_HOST_TYPES.includes(type)) return false;
      try {
        native.post({ ...payload, ns: EMBED_NS, v: EMBED_VERSION, type });
        return true;
      } catch {
        return false;
      }
    }
    if (!framed) return false;
    win.parent.postMessage({ ...payload, ns: EMBED_NS, v: EMBED_VERSION, type }, host);
    return true;
  };
  const receive = (data: unknown, origin: string): void => {
    const m = parseHostMessage(data);
    if (!m) return;
    if (m.type === 'hello') {
      host = origin;
      post('ready', { version });
    }
    for (const h of handlers) h(m);
  };
  if (framed) {
    win.document.documentElement.dataset.embed = '1';
    win.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== win.parent || !acceptOrigin(e.origin, allow, host)) return;
      receive(e.data, e.origin);
    });
  } else if (native) {
    // not `data-embed`: that one moves the HUD for the Token Tails page's frame, the app lays out on its own
    win.document.documentElement.dataset.host = 'native';
    try {
      native.listen((data) => receive(data, 'native'));
    } catch {
      /* a broken shell: the game plays standalone */
    }
  }
  const kind = framed ? 'frame' : native ? 'native' : null;
  return { active: kind !== null, kind, post, on: (h) => void handlers.push(h) };
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

/** How a signed-in player signed in (the account chip's icon). Never the address itself. */
export const SIGN_IN_PROVIDERS = Object.freeze(['google', 'apple', 'email'] as const);
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export interface SessionInfo {
  signedIn: boolean;
  progress: Progress | null;
  /** UX pass 2: the signed-in player's Token Tails profile name (absent: none or not signed in). */
  name?: string;
  /** Sign-in: the signed-in player's sign-in method (absent: unknown or not signed in). */
  provider?: SignInProvider;
}

/** Most characters of `session.name` kept (the plate cuts it to 14 with an ellipsis). */
export const PLAYER_NAME_MAX = 24;

/**
 * `session.name`: one clean line, no markup or control characters, at least one letter or digit, cut to
 * PLAYER_NAME_MAX code points; else null. The host's `playerNameOf` is the same rule (shared fixture).
 */
export function parsePlayerName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const clean = v
    .replace(/[\u0000-\u001f\u007f-\u009f<>&"'`\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(clean)) return null;
  return Array.from(clean).slice(0, PLAYER_NAME_MAX).join('').trim() || null;
}

export function parseSession(m: Record<string, unknown>): SessionInfo | null {
  if (typeof m.signedIn !== 'boolean') return null;
  const name = m.signedIn ? parsePlayerName(m.name) : null;
  const provider = m.signedIn && (SIGN_IN_PROVIDERS as readonly unknown[]).includes(m.provider) ? (m.provider as SignInProvider) : null;
  return { signedIn: m.signedIn, progress: m.signedIn ? parseProgress(m.progress) : null, ...(name ? { name } : {}), ...(provider ? { provider } : {}) };
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
  /** Legends Pass Season XP the save paid (STORE-PASS.md §5); absent from older hosts. */
  season?: SaveSeason;
}

/** A save's Season XP, plus its Yarn (CHAMPION-STORE.md §4) and whether its hero was locked (§8.5). */
export interface SaveSeason {
  gained: number;
  xp: number;
  tier: number;
  prevTier: number;
  yarn?: { gained: number; balance: number; newPicks: number };
  heroLocked?: true;
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
  const season = parseSaveSeason(m.season);
  if (season) out.season = season;
  return out;
}

/** Party play: the host's answer to a ticket request. */
export interface PartyTicketAnswer {
  id: string;
  ticket: string | null;
  error?: string;
}

const PARTY_TICKET = /^[A-Za-z0-9_-]{16,460}\.[A-Za-z0-9_-]{43}$/;

export function parsePartyTicket(m: Record<string, unknown>): PartyTicketAnswer | null {
  if (typeof m.id !== 'string' || !MATCH_ID.test(m.id)) return null;
  if (m.ticket !== null && (typeof m.ticket !== 'string' || !PARTY_TICKET.test(m.ticket))) return null;
  const out: PartyTicketAnswer = { id: m.id, ticket: m.ticket };
  if (m.ticket === null && typeof m.error === 'string' && /^[A-Z0-9_]{1,48}$/.test(m.error)) out.error = m.error;
  return out;
}

/** Party play (§6): the v:2 result the host posts to `/live`; the backend checks it against the relay's room log. */
export interface PartyResult {
  v: 2;
  room: string;
  slot: number;
  simVersion: number;
  ticks: number;
  outcome: 'won' | 'lost';
  finalHash: string;
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

/**
 * `account{action}` (the account chip and the Settings row): `sign-in` opens the host's sign-in, `sign-out` signs
 * out, `manage` opens the host's account sheet (web), `delete` starts the host's account deletion (the app: App
 * Store 5.1.1(v); the host asks for its own last confirmation).
 */
export const ACCOUNT_ACTIONS = Object.freeze(['sign-in', 'sign-out', 'manage', 'delete'] as const);
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

// ------------------------------------------------------------------------------------- store and Legends Pass

/** Store and pass item ids the game knows (anything else in a `store` message is dropped). */
const STORE_ITEM = /^(coat\.[a-z]+\.(store|s1)_[a-z_]+|frame\.(store|s1)\.[a-z_]+|title\.(store|s1)\.[a-z_]+)$/;

export interface StoreSeason {
  id: string;
  xp: number;
  tier: number;
  premium: 'none' | 'pass' | 'plus';
  skips: number;
  claimed: string[];
  endsAt: string;
}

export interface StoreState {
  items: string[];
  season: StoreSeason | null;
  /** CHAMPION-STORE.md: absent from an older host. */
  champions?: ChampionsState;
}

/** `store{items, season}`: owned store and pass items (known shapes only) and the pass row, or null. */
export function parseStoreState(m: Record<string, unknown>): StoreState | null {
  if (!Array.isArray(m.items)) return null;
  const items = [...new Set(m.items.slice(0, 400).filter((i): i is string => typeof i === 'string' && STORE_ITEM.test(i)))];
  let season: StoreSeason | null = null;
  const r = m.season as Record<string, unknown> | null | undefined;
  if (r && typeof r === 'object' && typeof r.id === 'string' && /^s\d{1,3}$/.test(r.id)) {
    const n = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
    const premium = r.premium === 'pass' || r.premium === 'plus' ? r.premium : 'none';
    const claimed = Array.isArray(r.claimed) ? r.claimed.filter((c): c is string => typeof c === 'string' && /^[fp]:\d{1,3}$/.test(c)).slice(0, 200) : [];
    const endsAt = typeof r.endsAt === 'string' && Number.isFinite(Date.parse(r.endsAt)) ? r.endsAt : '';
    season = { id: r.id, xp: n(r.xp, 10_000_000), tier: n(r.tier, 1000), premium, skips: n(r.skips, 1000), claimed, endsAt };
  }
  const champions = parseChampionsState(m.champions);
  return champions ? { items, season, champions } : { items, season };
}

const SKU = /^pl_(coat|frame|set|pass|champ|champs)_[a-z0-9_]{1,40}$/;

/** `purchase-result{sku, ok}` for a store or pass SKU, or null. */
export function parseSkuPurchaseResult(m: Record<string, unknown>): { sku: string; ok: boolean } | null {
  if (typeof m.sku !== 'string' || !SKU.test(m.sku) || typeof m.ok !== 'boolean') return null;
  return { sku: m.sku, ok: m.ok };
}

/** `save-result.season`: the Season XP a saved match paid (absent when the backend sent none). */
export function parseSaveSeason(v: unknown): SaveSeason | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 10_000_000 ? x : null);
  const gained = n(o.gained);
  const xp = n(o.xp);
  const tier = n(o.tier);
  const prevTier = n(o.prevTier);
  if (gained === null || xp === null || tier === null) return null;
  const out: SaveSeason = { gained, xp, tier, prevTier: prevTier ?? tier };
  const y = o.yarn && typeof o.yarn === 'object' ? (o.yarn as Record<string, unknown>) : null;
  const yg = y ? n(y.gained) : null;
  const yb = y ? n(y.balance) : null;
  if (y && yg !== null && yb !== null) out.yarn = { gained: yg, balance: yb, newPicks: Math.min(3, n(y.newPicks) ?? 0) };
  if (o.heroLocked === true) out.heroLocked = true;
  return out;
}
