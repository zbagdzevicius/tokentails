/**
 * The host side of the Pawlegends bridge, version 1 (POC.md §11.1 plus the additive Token Tails integration
 * messages). The game side is `pawlegends/src/embed/bridge.ts`; the handshake is the `/swordcat` one. Both sides
 * test their parsers against `shared/pawlegends-bridge.fixtures.json`.
 *
 * Envelope: `{ ns: 'tt-pawlegends', v: 1, type, ...payload }`. Every change is additive; each side ignores unknown
 * types and unknown fields.
 * - Host to game: `hello` (until `ready`), `session {signedIn, progress}`, `roster {cats[]}` (each cat may carry
 *   `art`, `catalogId` and `sprite`, its sprite sheet for the game's card skins), `featured {cats[]}` (at most 2
 *   unowned direct-purchase cats, each with optional `art`, `sprite` and `tier`), `offer {offer}` (one
 *   `meet` card or null), `save-result {matchId, status, catnipPaid, catnipTotal, fastestWin, code?}`,
 *   `entitlements {token}`, `audio {muted, music?, sfx?}`, `pause`, `resume`, `purchase-result {catalogId, ok}`,
 *   `app {isApp, store, notify}`, and (sim v9) `champions {cats[]}`: the shelter champions' cards, each
 *   `{catalogId, forSale, catImg?}` (`GET /pawlegends/champions`; never for sale in an app build). `app.store` means
 *   "the Token Tails cat checkout is reachable" (web only).
 * - Game to host: `ready {version}`, `match-result {replay, summary, matchId}`, `request-sign-in {reason}`,
 *   `open-cat {catalogId}`, `offer-seen {kind, catalogId}`, `notify {where}`, `share {kind, url, text?}`,
 *   `paused {paused}`, `champion-offer {catalogId}` (sim v9: the player's 3rd finished match on a champion whose card
 *   is for sale; the host asks its offer engine with that card first), `skin-preview {catalogId}` (the player
 *   previewed a featured cat's card skin on the pick screen: the same re-ask with that cat first; the server's caps
 *   still decide), `client-error {source, msg, screen, tier, sim}` (launch finding R1: a game or worker crash; the
 *   host reports it as a scrubbed `app_error`), `analytics {event, props}` (launch finding PUB-02: one of the game's
 *   own events; the host sends it with `analytics.track`, at most `PAWLEGENDS_GAME_EVENT_BUDGET` a page), and the
 *   deprecated `purchase-intent {sku}`
 *   (answered with a legacy refusal).
 *
 * A message counts only when it comes from our iframe's window and the game's origin; every post names that
 * exact origin, never `'*'`. No `accesstoken` or Firebase token ever crosses: each payload is rebuilt here field by
 * field (`sanitizeHostMessage`). Cat art is only ever a Token Tails CDN URL.
 *
 * No React, no DOM globals: the window and timers are passed in, so the handshake is unit-tested.
 */
import { PAWLEGENDS_GAME_EVENTS, type PawlegendsGameEventName, type PawlegendsGameProps } from "@/analytics/pawlegends-events";
import { PAWLEGENDS_LEVELS, PAWLEGENDS_MAX_INPUT_CHARS, PAWLEGENDS_MAX_TICKS } from "@/shared-contracts/caps";

export const PAWLEGENDS_NS = "tt-pawlegends";
export const PAWLEGENDS_BRIDGE_VERSION = 1;
export const PAWLEGENDS_HELLO_RETRY_MS = 500;
export const PAWLEGENDS_HELLO_SLOW_MS = 10_000;
export const PAWLEGENDS_HELLO_SLOW_RETRY_MS = 2_000;
export const PAWLEGENDS_HELLO_TIMEOUT_MS = 120_000;
/** Most cats in `roster` and in `featured`. */
export const PAWLEGENDS_ROSTER_LIMIT = 24;
export const PAWLEGENDS_FEATURED_LIMIT = 2;
/** Most cards in `champions` (four shelter champions today). */
export const PAWLEGENDS_CHAMPIONS_LIMIT = 8;
/** Save results held for a game that is not `ready` yet (a reload mid-save). */
const PENDING_SAVE_RESULTS = 8;

/** Mirror of `PAWLEGENDS_SKU_IDS` in `backend/src/pawlegends/pawlegends.contracts.ts` (legacy items only). */
export const PAWLEGENDS_SKUS = ["pl_starter", "pl_founder", "pl_founder_legend", "pl_founder_legend_upgrade"] as const;
export type PawlegendsSku = (typeof PAWLEGENDS_SKUS)[number];
export const isPawlegendsSku = (value: unknown): value is PawlegendsSku =>
  typeof value === "string" && (PAWLEGENDS_SKUS as readonly string[]).includes(value);

/** Mirrors of `HeroId` and `TrickId` in `pawlegends/src/data/`. */
export const PAWLEGENDS_HEROES = ["clem", "sage", "brutus", "cacklejaw", "lambo", "aviete", "bengas", "gabe"] as const;
export const PAWLEGENDS_TRICKS = ["pounce", "snack", "hiss"] as const;

export const PAWLEGENDS_SIGN_IN_REASONS = ["save-progress", "claim-rewards"] as const;
export type PawlegendsSignInReason = (typeof PAWLEGENDS_SIGN_IN_REASONS)[number];
export const PAWLEGENDS_NOTIFY_WHERE = ["lobby", "results", "store"] as const;
export type PawlegendsNotifyWhere = (typeof PAWLEGENDS_NOTIFY_WHERE)[number];
export const PAWLEGENDS_SAVE_STATUSES = ["saving", "saved", "queued", "failed", "rejected"] as const;
export type PawlegendsSaveResultStatus = (typeof PAWLEGENDS_SAVE_STATUSES)[number];
const ROSTER_ORIGINS = ["starter", "pack", "redeem", "adopt", "portrait"];

/** A catalog cat id (a Mongo ObjectId as the backend prints it). */
export const CATALOG_ID = /^[0-9a-f]{24}$/;
export const isCatalogId = (value: unknown): value is string => typeof value === "string" && CATALOG_ID.test(value);
/** The game's id for one match: the key of the host's save queue entry. */
export const MATCH_ID = /^[a-z0-9]{1,16}$/;
export const isMatchId = (value: unknown): value is string => typeof value === "string" && MATCH_ID.test(value);

/** The Token Tails CDN that serves cat art (`catImg`): the bucket's virtual host, or the path-style address. */
export const PAWLEGENDS_ART_HOST = "tokentails-nfts.fra1.cdn.digitaloceanspaces.com";
export const PAWLEGENDS_ART_PATH_HOST = "fra1.cdn.digitaloceanspaces.com";
export const PAWLEGENDS_ART_PATH_PREFIX = "/tokentails-nfts/";

/**
 * Cat art the game may load: an https URL on the Token Tails CDN, else null. Leading and trailing spaces are trimmed
 * first (known bug: a few storefront `spriteImg` / `catImg` values end in a space, so their art was dropped).
 */
export function artUrlOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > 512 || /[\s\\<>"'`]/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const onBucketHost = url.hostname === PAWLEGENDS_ART_HOST;
  const onPathHost = url.hostname === PAWLEGENDS_ART_PATH_HOST && url.pathname.startsWith(PAWLEGENDS_ART_PATH_PREFIX);
  return onBucketHost || onPathHost ? url.href : null;
}

/** `ReplayRecord` of `pawlegends/src/sim/api.ts` (POC.md §11.3), checked here for shape only. */
export interface PawlegendsReplay {
  v: 1;
  simVersion: number;
  seed: number;
  difficulty: string;
  hero: string;
  trick: string;
  ticks: number;
  inputs: string;
  outcome: "won" | "lost";
  finalHash: string;
}

/** What the game says about the match for display and analytics; never trusted for a save. */
export interface PawlegendsSummary {
  won: boolean;
  ticks: number | null;
  hero: string | null;
  difficulty: string | null;
  takedowns: number | null;
}

export interface PawlegendsRosterCat {
  id: string;
  name: string;
  type: string;
  tier: string;
  isStarter: boolean;
  starterBreed?: string;
  origin?: string;
  /** Token Tails CDN art (`catImg`). */
  art?: string;
  /** The catalog cat this one is a copy of (`sourceCat`, or the blessing's cat). */
  catalogId?: string;
  /** Token Tails CDN sprite sheet (`spriteImg`, `.png` only): the game's card skin palette. */
  sprite?: string;
}

export interface PawlegendsFeaturedCat {
  catalogId: string;
  name: string;
  type: string;
  art?: string;
  /** Token Tails CDN sprite sheet (`spriteImg`, `.png` only). */
  sprite?: string;
  tier?: string;
}

/** A sprite sheet the game may read: `artUrlOf` and a `.png` path, else null. */
export function spriteUrlOf(value: unknown): string | null {
  const url = artUrlOf(value);
  return url && /\.png$/i.test(new URL(url).pathname) ? url : null;
}

const CARD_TIERS: readonly string[] = ["COMMON", "RARE", "EPIC", "LEGENDARY"];

/** Sim v9: one shelter champion's card (the game keeps only the champion catalog ids it knows). */
export interface PawlegendsChampionCard {
  catalogId: string;
  forSale: boolean;
  /** Token Tails CDN art (`catImg`). */
  catImg?: string;
}

/** Per difficulty, keys from `PAWLEGENDS_LEVELS`: catnip earned, matches saved, fastest win in ticks (0 = none). */
export interface PawlegendsProgress {
  catnip: Record<string, number>;
  matches: Record<string, number>;
  fastestWin: Record<string, number>;
}

export interface PawlegendsMeetOffer {
  kind: "meet";
  catalogId: string;
}

export interface PawlegendsSaveResult {
  matchId: string;
  status: PawlegendsSaveResultStatus;
  catnipPaid: number;
  catnipTotal: number | null;
  fastestWin: number | null;
  code?: string;
}

export interface PawlegendsAudio {
  muted: boolean;
  music?: number;
  sfx?: number;
}

type Envelope = { ns: typeof PAWLEGENDS_NS; v: 1 };

export type HostToPawlegendsMessage = Envelope &
  (
    | { type: "hello" | "pause" | "resume" }
    | { type: "session"; signedIn: boolean; progress: PawlegendsProgress | null }
    | { type: "roster"; cats: PawlegendsRosterCat[] }
    | { type: "featured"; cats: PawlegendsFeaturedCat[] }
    | { type: "offer"; offer: PawlegendsMeetOffer | null }
    | ({ type: "save-result" } & PawlegendsSaveResult)
    | { type: "entitlements"; token: string | null }
    | ({ type: "audio" } & PawlegendsAudio)
    | { type: "purchase-result"; catalogId: string; ok: boolean }
    | { type: "app"; isApp: boolean; store: boolean; notify: boolean }
    | { type: "champions"; cats: PawlegendsChampionCard[] }
  );

export type PawlegendsToHostMessage =
  | { type: "ready"; version: string | null }
  | { type: "match-result"; replay: PawlegendsReplay; summary: PawlegendsSummary; matchId: string | null }
  | { type: "request-sign-in"; reason: PawlegendsSignInReason }
  | { type: "open-cat"; catalogId: string }
  | { type: "offer-seen"; kind: "meet"; catalogId: string }
  | { type: "notify"; where: PawlegendsNotifyWhere }
  | { type: "purchase-intent"; sku: PawlegendsSku }
  | { type: "share"; kind: string; url: string; text: string | null }
  | { type: "paused"; paused: boolean }
  | { type: "champion-offer"; catalogId: string }
  | { type: "skin-preview"; catalogId: string }
  | ({ type: "client-error" } & PawlegendsClientError)
  | { type: "analytics"; event: PawlegendsGameEventName; props: PawlegendsGameProps };

/** Relayed game events a page sends at most (PUB-02): a runaway loop must not flood PostHog. About 15 per match. */
export const PAWLEGENDS_GAME_EVENT_BUDGET = 1000;
const GAME_PROP_KEY = /^[a-z0-9_]{1,40}$/;
/** Token strings only (hero, difficulty, tier, sku, catalog id): no slash, `@`, `?` or `=`, so no URL or email. */
const GAME_PROP_TEXT = /^[A-Za-z0-9_ .:-]{0,80}$/;
const GAME_PROPS_MAX = 24;

/** The game's flat props, cleaned: a bad key or value drops that prop only; more than 24 props drops the event. */
function gamePropsOf(value: unknown): PawlegendsGameProps | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length > GAME_PROPS_MAX) return null;
  const out: PawlegendsGameProps = {};
  for (const k of keys) {
    if (!GAME_PROP_KEY.test(k)) continue;
    const v = value[k];
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && GAME_PROP_TEXT.test(v)) out[k] = v;
  }
  return out;
}

/** Where a game crash came from (`pawlegends/src/app/crash.ts` CrashSource). */
export const PAWLEGENDS_CRASH_SOURCES = ["window", "rejection", "worker", "boot"] as const;
export type PawlegendsCrashSource = (typeof PAWLEGENDS_CRASH_SOURCES)[number];

/**
 * A game crash (R1). `msg` is the game's `crashCode`: lower-case letters, digits, `_` and spaces, at most 80
 * characters; anything else drops the whole message. No stack, no URL.
 */
export interface PawlegendsClientError {
  source: PawlegendsCrashSource;
  msg: string;
  screen: string;
  tier: string;
  sim: number;
}

const CRASH_MSG = /^[a-z0-9_ ]{1,80}$/;
const CRASH_WORD = /^[a-z0-9_-]{1,16}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const intIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ENTITLEMENT_TOKEN = /^[A-Za-z0-9_-]{1,8000}\.[A-Za-z0-9_-]{16,128}$/;
const ENUM_WORD = /^[A-Z][A-Z_]{1,15}$/;
const CAT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ERROR_CODE = /^[A-Z0-9_]{1,48}$/;
export const PAWLEGENDS_CAT_NAME_MAX = 32;
/** Bounds of `save-result.catnipTotal` (the account total) and `catnipPaid` (one save). */
const CATNIP_TOTAL_MAX = 100_000_000;
const CATNIP_PAID_MAX = 10_000;

/** A clean single-line display name, cut to `PAWLEGENDS_CAT_NAME_MAX`; null when nothing is left. */
export function catNameOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, PAWLEGENDS_CAT_NAME_MAX) : null;
}

/** A replay with the backend DTO's shape (`pawlegends-replay.dto.ts`), as a clean copy; else null. */
export function replayOf(value: unknown): PawlegendsReplay | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const { simVersion, seed, difficulty, hero, trick, ticks, inputs, outcome, finalHash } = value;
  if (!intIn(simVersion, 1, 1_000_000) || !intIn(seed, 0, 0xffffffff) || !intIn(ticks, 1, PAWLEGENDS_MAX_TICKS)) return null;
  if (typeof difficulty !== "string" || !PAWLEGENDS_LEVELS.includes(difficulty)) return null;
  if (typeof hero !== "string" || !/^[a-z]{1,16}$/.test(hero)) return null;
  if (typeof trick !== "string" || !/^[a-z]{1,16}$/.test(trick)) return null;
  if (typeof inputs !== "string" || inputs.length > PAWLEGENDS_MAX_INPUT_CHARS || !BASE64.test(inputs)) return null;
  if (outcome !== "won" && outcome !== "lost") return null;
  if (typeof finalHash !== "string" || !/^[0-9a-f]{8}$/.test(finalHash)) return null;
  return { v: 1, simVersion, seed, difficulty, hero, trick, ticks, inputs, outcome, finalHash };
}

const shortId = (value: unknown, max = 16): string | null =>
  typeof value === "string" && /^[a-z0-9_-]+$/i.test(value) && value.length <= max ? value : null;

const countOf = (value: unknown, max: number): number | null => (intIn(value, 0, max) ? value : null);

/** A display summary (the replay decides `won` when the game leaves it out). */
export function summaryOf(value: unknown, replay: PawlegendsReplay): PawlegendsSummary {
  const s = isRecord(value) ? value : {};
  return {
    won: replay.outcome === "won",
    ticks: countOf(s.ticks, PAWLEGENDS_MAX_TICKS) ?? replay.ticks,
    hero: shortId(s.hero) ?? replay.hero,
    difficulty: shortId(s.difficulty) ?? replay.difficulty,
    takedowns: countOf(s.takedowns, 999),
  };
}

/** Progress with every level present, each value an int from 0 to `PAWLEGENDS_MAX_TICKS` (bad values are 0). */
export function progressOf(value: unknown): PawlegendsProgress | null {
  if (!isRecord(value)) return null;
  const table = (raw: unknown): Record<string, number> => {
    const r = isRecord(raw) ? raw : {};
    const out: Record<string, number> = {};
    for (const level of PAWLEGENDS_LEVELS) out[level] = intIn(r[level], 0, PAWLEGENDS_MAX_TICKS) ? (r[level] as number) : 0;
    return out;
  };
  return { catnip: table(value.catnip), matches: table(value.matches), fastestWin: table(value.fastestWin) };
}

function rosterCatOf(value: unknown): PawlegendsRosterCat | null {
  if (!isRecord(value)) return null;
  const name = catNameOf(value.name);
  if (typeof value.id !== "string" || !CAT_ID.test(value.id) || !name) return null;
  if (typeof value.type !== "string" || !ENUM_WORD.test(value.type)) return null;
  if (typeof value.tier !== "string" || !ENUM_WORD.test(value.tier)) return null;
  const cat: PawlegendsRosterCat = {
    id: value.id,
    name,
    type: value.type,
    tier: value.tier,
    isStarter: value.isStarter === true,
  };
  if (typeof value.starterBreed === "string" && ENUM_WORD.test(value.starterBreed)) cat.starterBreed = value.starterBreed;
  if (oneOf(ROSTER_ORIGINS, value.origin)) cat.origin = value.origin;
  const art = artUrlOf(value.art);
  if (art) cat.art = art;
  if (isCatalogId(value.catalogId)) cat.catalogId = value.catalogId;
  const sprite = spriteUrlOf(value.sprite);
  if (sprite) cat.sprite = sprite;
  return cat;
}

function featuredCatOf(value: unknown): PawlegendsFeaturedCat | null {
  if (!isRecord(value) || !isCatalogId(value.catalogId)) return null;
  const name = catNameOf(value.name);
  if (!name || typeof value.type !== "string" || !ENUM_WORD.test(value.type)) return null;
  const cat: PawlegendsFeaturedCat = { catalogId: value.catalogId, name, type: value.type };
  const art = artUrlOf(value.art);
  if (art) cat.art = art;
  const sprite = spriteUrlOf(value.sprite);
  if (sprite) cat.sprite = sprite;
  if (typeof value.tier === "string" && CARD_TIERS.includes(value.tier)) cat.tier = value.tier;
  return cat;
}

const unit = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/**
 * The only way a host message is made, and the check the fixture tests run: a clean copy with known fields only,
 * or null when a required field is missing or wrong. Bad optional fields are dropped.
 */
export function sanitizeHostMessage(data: unknown): HostToPawlegendsMessage | null {
  if (!isRecord(data) || data.ns !== PAWLEGENDS_NS || data.v !== PAWLEGENDS_BRIDGE_VERSION) return null;
  const base = { ns: PAWLEGENDS_NS, v: PAWLEGENDS_BRIDGE_VERSION } as const;
  switch (data.type) {
    case "hello":
    case "pause":
    case "resume":
      return { ...base, type: data.type };
    case "session":
      if (typeof data.signedIn !== "boolean") return null;
      return { ...base, type: "session", signedIn: data.signedIn, progress: progressOf(data.progress) };
    case "roster": {
      if (!Array.isArray(data.cats)) return null;
      const seen = new Set<string>();
      const cats: PawlegendsRosterCat[] = [];
      for (const raw of data.cats) {
        const cat = rosterCatOf(raw);
        if (!cat || seen.has(cat.id)) continue;
        seen.add(cat.id);
        cats.push(cat);
        if (cats.length >= PAWLEGENDS_ROSTER_LIMIT) break;
      }
      return { ...base, type: "roster", cats };
    }
    case "featured": {
      if (!Array.isArray(data.cats)) return null;
      const seen = new Set<string>();
      const cats: PawlegendsFeaturedCat[] = [];
      for (const raw of data.cats) {
        const cat = featuredCatOf(raw);
        if (!cat || seen.has(cat.catalogId)) continue;
        seen.add(cat.catalogId);
        cats.push(cat);
        if (cats.length >= PAWLEGENDS_FEATURED_LIMIT) break;
      }
      return { ...base, type: "featured", cats };
    }
    case "offer": {
      if (data.offer === null) return { ...base, type: "offer", offer: null };
      const o = data.offer;
      if (!isRecord(o) || o.kind !== "meet" || !isCatalogId(o.catalogId)) return null;
      return { ...base, type: "offer", offer: { kind: "meet", catalogId: o.catalogId } };
    }
    case "save-result": {
      if (!isMatchId(data.matchId) || !oneOf(PAWLEGENDS_SAVE_STATUSES, data.status)) return null;
      if (!intIn(data.catnipPaid, 0, CATNIP_PAID_MAX)) return null;
      const message: HostToPawlegendsMessage = {
        ...base,
        type: "save-result",
        matchId: data.matchId,
        status: data.status,
        catnipPaid: data.catnipPaid,
        catnipTotal: intIn(data.catnipTotal, 0, CATNIP_TOTAL_MAX) ? data.catnipTotal : null,
        fastestWin: intIn(data.fastestWin, 1, PAWLEGENDS_MAX_TICKS) ? data.fastestWin : null,
      };
      if (typeof data.code === "string" && ERROR_CODE.test(data.code)) message.code = data.code;
      return message;
    }
    case "entitlements":
      if (data.token === null) return { ...base, type: "entitlements", token: null };
      if (typeof data.token !== "string") return null;
      return { ...base, type: "entitlements", token: ENTITLEMENT_TOKEN.test(data.token) ? data.token : null };
    case "audio": {
      if (typeof data.muted !== "boolean") return null;
      const message: HostToPawlegendsMessage = { ...base, type: "audio", muted: data.muted };
      if (unit(data.music)) message.music = data.music;
      if (unit(data.sfx)) message.sfx = data.sfx;
      return message;
    }
    case "purchase-result":
      if (!isCatalogId(data.catalogId) || typeof data.ok !== "boolean") return null;
      return { ...base, type: "purchase-result", catalogId: data.catalogId, ok: data.ok };
    case "champions": {
      if (!Array.isArray(data.cats)) return null;
      const seen = new Set<string>();
      const cats: PawlegendsChampionCard[] = [];
      for (const raw of data.cats) {
        if (!isRecord(raw) || !isCatalogId(raw.catalogId) || seen.has(raw.catalogId)) continue;
        seen.add(raw.catalogId);
        const card: PawlegendsChampionCard = { catalogId: raw.catalogId, forSale: raw.forSale === true };
        const art = artUrlOf(raw.catImg);
        if (art) card.catImg = art;
        cats.push(card);
        if (cats.length >= PAWLEGENDS_CHAMPIONS_LIMIT) break;
      }
      return { ...base, type: "champions", cats };
    }
    case "app":
      if (typeof data.isApp !== "boolean" || typeof data.store !== "boolean") return null;
      return {
        ...base,
        type: "app",
        isApp: data.isApp,
        // The Token Tails checkout is web only (Apple 3.1.1): an app build never hears `store: true`.
        store: data.store && !data.isApp,
        notify: data.notify === true,
      };
    default:
      return null;
  }
}

/** Builds a host message from a payload (copied field by field by `sanitizeHostMessage`); null when invalid. */
export function hostMessage(type: "hello" | "pause" | "resume"): HostToPawlegendsMessage;
export function hostMessage(
  type: "session",
  payload: { signedIn: boolean; progress?: PawlegendsProgress | null }
): HostToPawlegendsMessage;
export function hostMessage(type: "roster", payload: { cats: PawlegendsRosterCat[] }): HostToPawlegendsMessage;
export function hostMessage(type: "featured", payload: { cats: PawlegendsFeaturedCat[] }): HostToPawlegendsMessage;
export function hostMessage(type: "champions", payload: { cats: PawlegendsChampionCard[] }): HostToPawlegendsMessage;
export function hostMessage(type: "offer", payload: { offer: PawlegendsMeetOffer | null }): HostToPawlegendsMessage | null;
export function hostMessage(type: "save-result", payload: PawlegendsSaveResult): HostToPawlegendsMessage | null;
export function hostMessage(type: "entitlements", payload: { token: string | null }): HostToPawlegendsMessage;
export function hostMessage(type: "audio", payload: PawlegendsAudio): HostToPawlegendsMessage;
export function hostMessage(
  type: "purchase-result",
  payload: { catalogId: string; ok: boolean }
): HostToPawlegendsMessage | null;
export function hostMessage(
  type: "app",
  payload: { isApp: boolean; store: boolean; notify?: boolean }
): HostToPawlegendsMessage;
export function hostMessage(
  type: HostToPawlegendsMessage["type"],
  payload?: object
): HostToPawlegendsMessage | null {
  const p: Record<string, unknown> = { ...((payload ?? {}) as Record<string, unknown>) };
  // Required booleans default to false, so a caller's `undefined` never drops a sticky message.
  if (type === "session") p.signedIn = p.signedIn === true;
  if (type === "app") {
    p.isApp = p.isApp === true;
    p.store = p.store === true;
  }
  if (type === "audio") p.muted = p.muted === true;
  if (type === "entitlements" && typeof p.token !== "string") p.token = null;
  if ((type === "roster" || type === "featured" || type === "champions") && !Array.isArray(p.cats)) p.cats = [];
  return sanitizeHostMessage({ ...p, ns: PAWLEGENDS_NS, v: PAWLEGENDS_BRIDGE_VERSION, type });
}

/**
 * A share link the host may hand to the system share sheet: a same-origin `/pawlegends` path, or an https URL
 * on `origin` (the dare link carries seed, picks and difficulty in the query). Anything else is null.
 */
export function shareUrlOf(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length > 512 || /[\s\\<>"']/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (!url.pathname.startsWith("/pawlegends")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The longest share line the host passes on ("Beat my 7:12 vs Normal bots in Pawlegends!" is 44). */
export const PAWLEGENDS_SHARE_TEXT_MAX = 120;

/**
 * The dare line the game sends with a share (PUB-06), for the system share sheet's `text`: one plain line of
 * printable characters, at most PAWLEGENDS_SHARE_TEXT_MAX long, with no link markup. Anything else is null.
 */
export function shareTextOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > PAWLEGENDS_SHARE_TEXT_MAX) return null;
  if (/[\u0000-\u001f\u007f<>]|:\/\//.test(text)) return null;
  return text;
}

/** Validates a message from the game. A clean copy (known fields only), or null. */
export function parsePawlegendsMessage(data: unknown): PawlegendsToHostMessage | null {
  if (!isRecord(data) || data.ns !== PAWLEGENDS_NS || data.v !== PAWLEGENDS_BRIDGE_VERSION) return null;
  switch (data.type) {
    case "ready":
      return { type: "ready", version: typeof data.version === "string" && data.version.length <= 64 ? data.version : null };
    case "match-result": {
      const replay = replayOf(data.replay);
      return replay
        ? {
            type: "match-result",
            replay,
            summary: summaryOf(data.summary, replay),
            // An older build sends no id: the host derives one from the replay.
            matchId: isMatchId(data.matchId) ? data.matchId : null,
          }
        : null;
    }
    case "request-sign-in":
      return oneOf(PAWLEGENDS_SIGN_IN_REASONS, data.reason) ? { type: "request-sign-in", reason: data.reason } : null;
    case "open-cat":
      return isCatalogId(data.catalogId) ? { type: "open-cat", catalogId: data.catalogId } : null;
    case "offer-seen":
      return data.kind === "meet" && isCatalogId(data.catalogId)
        ? { type: "offer-seen", kind: "meet", catalogId: data.catalogId }
        : null;
    case "notify":
      return oneOf(PAWLEGENDS_NOTIFY_WHERE, data.where) ? { type: "notify", where: data.where } : null;
    case "purchase-intent":
      return isPawlegendsSku(data.sku) ? { type: "purchase-intent", sku: data.sku } : null;
    case "share": {
      const kind = shortId(data.kind, 24);
      // The url is checked against the page origin by the host (`shareUrlOf`); the text is optional (older builds).
      return kind && typeof data.url === "string" && data.url.length <= 512
        ? { type: "share", kind, url: data.url, text: shareTextOf(data.text) }
        : null;
    }
    case "paused":
      return typeof data.paused === "boolean" ? { type: "paused", paused: data.paused } : null;
    case "champion-offer":
      return isCatalogId(data.catalogId) ? { type: "champion-offer", catalogId: data.catalogId } : null;
    case "skin-preview":
      return isCatalogId(data.catalogId) ? { type: "skin-preview", catalogId: data.catalogId } : null;
    case "client-error":
      return oneOf(PAWLEGENDS_CRASH_SOURCES, data.source) &&
        typeof data.msg === "string" &&
        CRASH_MSG.test(data.msg) &&
        typeof data.screen === "string" &&
        CRASH_WORD.test(data.screen) &&
        typeof data.tier === "string" &&
        CRASH_WORD.test(data.tier) &&
        intIn(data.sim, 1, 999)
        ? { type: "client-error", source: data.source, msg: data.msg, screen: data.screen, tier: data.tier, sim: data.sim }
        : null;
    case "analytics": {
      if (!oneOf(PAWLEGENDS_GAME_EVENTS, data.event)) return null;
      const props = gamePropsOf(data.props);
      return props ? { type: "analytics", event: data.event, props } : null;
    }
    default:
      return null;
  }
}

/** A stable id for a match whose game sent none (an older build): lower-case hex, at most 16 characters. */
export const derivedMatchId = (replay: PawlegendsReplay): string =>
  `${replay.finalHash}${(replay.seed >>> 0).toString(16)}`.slice(0, 16);

export function isFromGame(event: Pick<MessageEvent, "source" | "origin">, target: unknown, origin: string | null): boolean {
  return !!target && !!origin && event.source === target && event.origin === origin;
}

export interface PawlegendsBridgeWindow {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface PawlegendsBridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface PawlegendsBridgeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  now(): number;
}

export interface PawlegendsBridgeHandlers {
  onReady?(version: string | null): void;
  onSlow?(): void;
  onTimeout?(): void;
  onMatchResult?(replay: PawlegendsReplay, summary: PawlegendsSummary, matchId: string): void;
  onRequestSignIn?(reason: PawlegendsSignInReason): void;
  /** Only for a cat of the last `featured` list or the roster, and never in an app build. */
  onOpenCat?(catalogId: string): void;
  /** Only for the offer the host holds. */
  onOfferSeen?(catalogId: string): void;
  onNotify?(where: PawlegendsNotifyWhere): void;
  /** Deprecated: the bridge already answered the legacy refusal. */
  onPurchaseIntent?(sku: PawlegendsSku): void;
  /** `text`: the game's dare line (`shareTextOf`), or null. */
  onShare?(kind: string, url: string, text: string | null): void;
  onPaused?(paused: boolean): void;
  /** Sim v9: only for a champion card the host holds as for sale, and never in an app build. */
  onChampionOffer?(catalogId: string): void;
  /** Card skins: only for a cat of the last `featured` list, and never in an app build. */
  onSkinPreview?(catalogId: string): void;
  /** A game crash (R1), already validated; the host reports it as `app_error`. */
  onClientError?(error: PawlegendsClientError): void;
  /** One of the game's analytics events (PUB-02), cleaned; at most `PAWLEGENDS_GAME_EVENT_BUDGET` a page. */
  onGameEvent?(event: PawlegendsGameEventName, props: PawlegendsGameProps): void;
}

/** The state the host keeps; every `ready` re-sends whatever is set. */
export interface PawlegendsBridge {
  readonly ready: boolean;
  setSession(signedIn: boolean, progress: PawlegendsProgress | null): void;
  setRoster(cats: PawlegendsRosterCat[]): void;
  setFeatured(cats: PawlegendsFeaturedCat[]): void;
  /** Sim v9: the shelter champions' cards (an app build hears none for sale). */
  setChampions(cats: PawlegendsChampionCard[]): void;
  /** A `meet` offer for a cat of the current `featured` list or a champion card for sale, or null. Refused (false) for any other id. */
  setOffer(offer: PawlegendsMeetOffer | null): boolean;
  setEntitlements(token: string | null): void;
  setAudio(audio: PawlegendsAudio): void;
  setApp(isApp: boolean, store: boolean, notify: boolean): void;
  saveResult(result: PawlegendsSaveResult): void;
  purchaseResult(catalogId: string, ok: boolean): void;
  pause(): void;
  resume(): void;
  reconnect(): void;
  dispose(): void;
}

export interface PawlegendsBridgeOptions {
  win: PawlegendsBridgeWindow;
  target: () => PawlegendsBridgeTarget | null;
  origin: string | null;
  handlers?: PawlegendsBridgeHandlers;
  timers?: PawlegendsBridgeTimers;
}

const defaultTimers: PawlegendsBridgeTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

const STICKY = ["app", "session", "audio", "roster", "featured", "champions", "offer", "entitlements"] as const;
type StickyKey = (typeof STICKY)[number];

export function createPawlegendsBridge(options: PawlegendsBridgeOptions): PawlegendsBridge {
  const { win, origin } = options;
  const handlers = options.handlers ?? {};
  const timers = options.timers ?? defaultTimers;
  let ready = false;
  let disposed = false;
  let paused = false;
  // Sticky state, re-sent in this order on every `ready` (app first, so the game knows about the store; featured
  // before offer, so the offer's cat is known).
  const state: Partial<Record<StickyKey, HostToPawlegendsMessage>> = {};
  let featuredIds = new Set<string>();
  let rosterIds = new Set<string>();
  /** Champion cards for sale (sim v9): open-cat, an offer and champion-offer may name them. */
  let championIds = new Set<string>();
  let championCards: PawlegendsChampionCard[] = [];
  let offerId: string | null = null;
  let isApp = false;
  const pendingSaves: HostToPawlegendsMessage[] = [];

  const post = (message: unknown) => {
    const target = options.target();
    if (!target || disposed || !origin) return;
    try {
      target.postMessage(message, origin);
    } catch {
      // The frame navigated away or was removed.
    }
  };
  const keep = (key: StickyKey, message: HostToPawlegendsMessage | null) => {
    if (!message) return;
    state[key] = message;
    if (ready) post(message);
  };
  const resendAll = () => {
    for (const key of STICKY) {
      const message = state[key];
      if (message) post(message);
    }
    while (pendingSaves.length) post(pendingSaves.shift());
    if (paused) post(hostMessage("pause"));
  };

  let started = timers.now();
  let slowSent = false;
  let timeoutSent = false;
  let helloTimer: unknown = null;
  let gameEvents = 0;
  const stopHello = () => {
    if (helloTimer !== null) timers.clearTimeout(helloTimer);
    helloTimer = null;
  };
  const hello = () => {
    helloTimer = null;
    if (ready || disposed) return;
    const elapsed = timers.now() - started;
    if (!slowSent && elapsed >= PAWLEGENDS_HELLO_SLOW_MS) {
      slowSent = true;
      handlers.onSlow?.();
    }
    if (!timeoutSent && elapsed >= PAWLEGENDS_HELLO_TIMEOUT_MS) {
      timeoutSent = true;
      handlers.onTimeout?.();
    }
    post(hostMessage("hello"));
    if (ready || disposed) return;
    helloTimer = timers.setTimeout(hello, elapsed < PAWLEGENDS_HELLO_SLOW_MS ? PAWLEGENDS_HELLO_RETRY_MS : PAWLEGENDS_HELLO_SLOW_RETRY_MS);
  };
  const startHello = () => {
    stopHello();
    started = timers.now();
    slowSent = false;
    timeoutSent = false;
    hello();
  };
  startHello();

  const onMessage = (event: MessageEvent) => {
    if (disposed || !isFromGame(event, options.target(), origin)) return;
    const message = parsePawlegendsMessage(event.data);
    if (!message) return;
    switch (message.type) {
      case "ready": {
        const first = !ready;
        ready = true;
        stopHello();
        resendAll();
        if (first) handlers.onReady?.(message.version);
        break;
      }
      case "match-result":
        handlers.onMatchResult?.(message.replay, message.summary, message.matchId ?? derivedMatchId(message.replay));
        break;
      case "request-sign-in":
        handlers.onRequestSignIn?.(message.reason);
        break;
      case "open-cat":
        if (isApp || !(featuredIds.has(message.catalogId) || rosterIds.has(message.catalogId) || championIds.has(message.catalogId))) break;
        handlers.onOpenCat?.(message.catalogId);
        break;
      case "offer-seen":
        if (isApp || message.catalogId !== offerId) break;
        handlers.onOfferSeen?.(message.catalogId);
        break;
      case "notify":
        handlers.onNotify?.(message.where);
        break;
      case "purchase-intent":
        // The `pl_*` store is gone from the game. An older build still waits for its legacy answer.
        post({ ns: PAWLEGENDS_NS, v: PAWLEGENDS_BRIDGE_VERSION, type: "purchase-result", sku: message.sku, ok: false });
        handlers.onPurchaseIntent?.(message.sku);
        break;
      case "share":
        handlers.onShare?.(message.kind, message.url, message.text);
        break;
      case "paused":
        handlers.onPaused?.(message.paused);
        break;
      case "champion-offer":
        if (isApp || !championIds.has(message.catalogId)) break;
        handlers.onChampionOffer?.(message.catalogId);
        break;
      case "skin-preview":
        if (isApp || !featuredIds.has(message.catalogId)) break;
        handlers.onSkinPreview?.(message.catalogId);
        break;
      case "client-error":
        handlers.onClientError?.({
          source: message.source,
          msg: message.msg,
          screen: message.screen,
          tier: message.tier,
          sim: message.sim,
        });
        break;
      case "analytics":
        if (gameEvents >= PAWLEGENDS_GAME_EVENT_BUDGET) break;
        gameEvents += 1;
        handlers.onGameEvent?.(message.event, message.props);
        break;
    }
  };
  win.addEventListener("message", onMessage);

  return {
    get ready() {
      return ready;
    },
    setSession: (signedIn, progress) => keep("session", hostMessage("session", { signedIn, progress })),
    setRoster(cats) {
      const message = hostMessage("roster", { cats });
      rosterIds = new Set(
        (message as { cats?: PawlegendsRosterCat[] }).cats?.flatMap((c) => (c.catalogId ? [c.catalogId] : [])) ?? []
      );
      keep("roster", message);
    },
    setFeatured(cats) {
      const message = hostMessage("featured", { cats: isApp ? [] : cats });
      featuredIds = new Set((message as { cats?: PawlegendsFeaturedCat[] }).cats?.map((c) => c.catalogId) ?? []);
      keep("featured", message);
      // An offer for a cat that left the list is withdrawn.
      if (offerId && !featuredIds.has(offerId) && !championIds.has(offerId)) {
        offerId = null;
        keep("offer", hostMessage("offer", { offer: null }));
      }
    },
    setChampions(cats) {
      championCards = cats;
      const message = hostMessage("champions", { cats: isApp ? cats.map((c) => ({ ...c, forSale: false })) : cats });
      const kept = (message as { cats?: PawlegendsChampionCard[] }).cats ?? [];
      championIds = new Set(kept.filter((c) => c.forSale).map((c) => c.catalogId));
      keep("champions", message);
      if (offerId && !featuredIds.has(offerId) && !championIds.has(offerId)) {
        offerId = null;
        keep("offer", hostMessage("offer", { offer: null }));
      }
    },
    setOffer(offer) {
      if (offer && (isApp || !(featuredIds.has(offer.catalogId) || championIds.has(offer.catalogId)))) return false;
      const message = hostMessage("offer", { offer });
      if (!message) return false;
      offerId = offer?.catalogId ?? null;
      keep("offer", message);
      return true;
    },
    setEntitlements: (token) => keep("entitlements", hostMessage("entitlements", { token })),
    setAudio: (audio) => keep("audio", hostMessage("audio", audio)),
    setApp(app, store, notify) {
      isApp = app;
      keep("app", hostMessage("app", { isApp: app, store, notify }));
      if (app) {
        featuredIds = new Set();
        championIds = new Set();
        offerId = null;
        if (state.featured) keep("featured", hostMessage("featured", { cats: [] }));
        if (state.champions) keep("champions", hostMessage("champions", { cats: championCards.map((c) => ({ ...c, forSale: false })) }));
        if (state.offer) keep("offer", hostMessage("offer", { offer: null }));
      }
    },
    saveResult(result) {
      const message = hostMessage("save-result", result);
      if (!message) return;
      if (ready) post(message);
      else {
        pendingSaves.push(message);
        while (pendingSaves.length > PENDING_SAVE_RESULTS) pendingSaves.shift();
      }
    },
    purchaseResult(catalogId, ok) {
      const message = hostMessage("purchase-result", { catalogId, ok });
      if (ready && message) post(message);
    },
    pause() {
      paused = true;
      post(hostMessage("pause"));
    },
    resume() {
      paused = false;
      post(hostMessage("resume"));
    },
    reconnect() {
      if (disposed) return;
      ready = false;
      startHello();
    },
    dispose() {
      disposed = true;
      stopHello();
      win.removeEventListener("message", onMessage);
    },
  };
}
