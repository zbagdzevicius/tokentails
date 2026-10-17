/**
 * Share links (GDD 6.6). Path form under the game's base (`/badcat`):
 *   /d/<dayNo>  /glass  /pick?e=t  /c/<cat>?n=<name>  /r?r=<room>&n=<title>&a=<author>
 * plus query params g c n (ghost 1), g2 c2 n2 (ghost 2), rp (+ c n when no ghost) clip=1 via studio=1 e=t.
 * Standalone exports put the same params in the hash: #d=18&g=… (also #glass, #pick, cat=<code>, r=<room>).
 * Pre-rendered shells (`d/18.html`, `pick.html`, `c.html`, `r.html`) parse like their clean paths.
 *
 * M0 (LANES.md): parseLink leaves `ghosts: []`; it decodes `rp` (clip handoff) only when the payload is the
 * uncompressed form buildLink writes. parseLinkFull (async) decodes every ghost, deflated or not.
 *
 * FULL build (W1-CODEC):
 * - Ghosts recorded with sim version MIN_REPLAY_SIM_VERSION..SIM_VERSION are kept; older-than-current ones are
 *   `replayOnly`. Optional score hints `s` / `s2` (non-negative integers) become GhostRef.score.
 * - Room links: /r?r=<room v2>&g=&c=&gn=&s=&g2=&c2=&gn2=&s2=&remix=1. Ghost names in a room link are `gn`/`gn2`
 *   (`n` is the room title there). v2 payloads carry title/author/ancestors themselves, so `n`/`a` are written only
 *   for a re-shared v1 payload; on parse they fill a title/author the payload lacks. `roomCode` keeps the raw payload.
 * - Routes: /badcat/<route>?<params> or #route=<route>&<params> (see ROUTE_PARAMS). Unknown params are dropped.
 * - `via` must pass creatorCode (6-12 chars [a-z0-9_], lower-cased, not blocked).
 */
import {
  BADCAT_SKUS,
  DEFAULT_CAT,
  MIN_REPLAY_SIM_VERSION,
  SIM_VERSION,
  type CatSpec,
  type GhostRef,
  type LinkRoute,
  type LinkState,
  type RoomDef,
} from '../types';
import { decodeCat, encodeCat } from './cat-codec';
import { decodeGhost, decodeGhostSync, encodeGhost, encodeGhostSync, type DecodedGhost } from './ghost-codec';
import { dailyRoomId, GLASS_ROOM_ID, roomKey } from './ids';
import { fromBase64url } from './base64url';
import { decodeRoom, encodeRoom } from './room-codec';
import { creatorCode } from './creator-code';
import { filterName, filterTitle } from './text-filter';

/** LinkState plus the cat-card name (`/c/<cat>?n=`), which the frozen LinkState has no field for. */
export type LinkStateX = LinkState & { catName?: string };

/** Raw ghost params of a link, before decoding. */
export interface RawGhostParam {
  g: string;
  c: string | null;
  n: string | null;
  /** Score hint (`s` / `s2`), raw. */
  s?: string | null;
}

const DAY_RE = /^(-?\d{1,5}|p\d{1,5})$/;
/**
 * Day slug in a URL (round 3: a pasted "/d/-30" looked broken). Launch days are their number ("18"); pre-launch
 * preview days (dayNo <= 0) are "p" + the days before Day #1 ("p30" = dayNo -30, "p0" = dayNo 0). Old links with a
 * negative number still parse.
 */
export function daySlug(dayNo: number): string {
  const n = Math.trunc(dayNo) | 0;
  return n >= 1 ? String(n) : `p${-n}`;
}
export function parseDaySlug(v: string): number {
  return v.startsWith('p') ? -parseInt(v.slice(1), 10) || 0 : parseInt(v, 10);
}
const CODE_RE = /^[A-Za-z0-9_-]{1,4000}$/;
const SCORE_RE = /^\d{1,9}$/;

/** Non-game routes and their allowed parameters (each value is checked; anything else is dropped). */
export const LINK_ROUTES: readonly LinkRoute[] = ['thanks', 'redeem', 'restore', 'maker', 'club', 'archive', 'rapsheet', 'brand', 'cameo', 'settings', 'gift', 'shop'];
const isRoute = (v: string): v is LinkRoute => (LINK_ROUTES as readonly string[]).includes(v);
const hasSku = (v: string): boolean => Object.prototype.hasOwnProperty.call(BADCAT_SKUS, v);
type ParamRule = (v: string) => string | null;
const re = (r: RegExp, max: number, norm: (v: string) => string = (v) => v): ParamRule => (v) => {
  if (v.length > max) return null;
  const n = norm(v.trim());
  return r.test(n) ? n : null;
};
export const ROUTE_PARAMS: Readonly<Record<LinkRoute, Readonly<Record<string, ParamRule>>>> = {
  thanks: { session_id: re(/^cs_(test|live)_[A-Za-z0-9]{8,200}$/, 220) },
  redeem: { code: re(/^[A-Z0-9]{6,16}$/, 32, (v) => v.toUpperCase()) },
  restore: { t: re(/^[A-Za-z0-9_-]{1,128}$/, 128) },
  maker: {}, // `r` (the room to remix) is handled as a room
  club: { sku: (v) => (v.length <= 32 && hasSku(v) ? v : null) },
  archive: {},
  rapsheet: {},
  brand: {},
  cameo: { sku: (v) => (v === 'cameo' || v === 'guest_star' ? v : null) },
  settings: {},
  // round 2: #route=gift and #route=shop landed on Home
  gift: { sku: (v) => (v === 'gift_cameo' || v === 'gift_club_3m' ? v : null) },
  shop: {},
};

/** Filtered route params: only the route's known keys, only valid values. */
export function routeParams(route: LinkRoute, raw: Iterable<[string, string]> | Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const rules = ROUTE_PARAMS[route];
  const entries = Symbol.iterator in Object(raw) ? (raw as Iterable<[string, string]>) : Object.entries(raw as Record<string, string>);
  for (const [k, v] of entries) {
    if (!Object.prototype.hasOwnProperty.call(rules, k) || typeof v !== 'string') continue;
    const ok = rules[k](v);
    if (ok !== null) out[k] = ok;
  }
  return out;
}

function stripHtml(seg: string): string {
  return seg.endsWith('.html') ? seg.slice(0, -5) : seg;
}

function hashParams(url: URL): URLSearchParams | null {
  const h = url.hash.replace(/^#/, '');
  if (!h) return null;
  if (!h.includes('=') && isRoute(h)) return new URLSearchParams(`route=${h}`);
  return new URLSearchParams(h.includes('=') ? h : h.replace(/^(glass|pick)$/, '$1=1'));
}

/** Merge the query and (standalone) hash params; hash wins. */
function allParams(url: URL): URLSearchParams {
  const p = new URLSearchParams(url.search);
  const h = hashParams(url);
  if (h) for (const [k, v] of h) p.set(k, v);
  return p;
}

/** Ghost params in link order: g/c/n, then g2/c2/n2. */
/** True if the link is a room link (`/r`, `/maker?r=` or `#r=`): ghost names are then `gn` / `gn2`. */
function isRoomLink(url: URL, p: URLSearchParams): boolean {
  if (!p.has('r')) return false;
  if (/(^|[#&])r=/.test(url.hash)) return true;
  return url.pathname.split('/').some((x) => {
    const seg = x.endsWith('.html') ? x.slice(0, -5) : x;
    return seg === 'r' || seg === 'maker';
  });
}

/** Ghost params in link order: g/c/n, then g2/c2/n2 (gn/gn2 in room links). */
export function linkGhostParams(url: URL): { ghosts: RawGhostParam[]; replay?: RawGhostParam } {
  const p = allParams(url);
  const room = isRoomLink(url, p);
  const n1 = room ? p.get('gn') : p.get('n');
  const n2 = room ? p.get('gn2') : p.get('n2');
  const ghosts: RawGhostParam[] = [];
  const g1 = p.get('g');
  if (g1 && CODE_RE.test(g1)) ghosts.push({ g: g1, c: p.get('c'), n: n1, s: p.get('s') });
  const g2 = p.get('g2');
  if (g2 && CODE_RE.test(g2)) ghosts.push({ g: g2, c: p.get('c2'), n: n2, s: p.get('s2') });
  const rp = p.get('rp');
  const replay = rp && CODE_RE.test(rp) ? { g: rp, c: p.get('c'), n: n1, s: g1 ? null : p.get('s') } : undefined;
  return replay ? { ghosts, replay } : { ghosts };
}

function catFor(c: string | null, n: string | null): CatSpec {
  const name = n == null ? undefined : filterName(n);
  const cat = c ? decodeCat(c, name ?? '') : null;
  if (cat) return cat;
  return { ...DEFAULT_CAT, name: name || DEFAULT_CAT.name };
}

/**
 * A ghost recorded in another room, or under a sim version the sim cannot replay, would desync, so it is dropped.
 * Versions MIN_REPLAY_SIM_VERSION..SIM_VERSION are kept; older ones are `replayOnly` (watch, no "beat" result).
 */
function ghostRef(raw: RawGhostParam, d: DecodedGhost | null, s: LinkState): GhostRef | null {
  if (!d) return null;
  if (d.roomHash >>> 0 !== roomKey(linkRoomId(s)) >>> 0) return null;
  const v = d.simVersion & 0xff;
  if (v < MIN_REPLAY_SIM_VERSION || v > SIM_VERSION) return null;
  const cat = catFor(raw.c, raw.n);
  const ref: GhostRef = { inputs: d.inputs, cat, simVersion: v, replayOnly: v < SIM_VERSION };
  if (raw.n != null && cat.name) ref.name = cat.name;
  if (raw.s && SCORE_RE.test(raw.s)) ref.score = parseInt(raw.s, 10);
  return ref;
}

function setRoom(s: LinkStateX, code: string | null): void {
  if (!code || s.room || !CODE_RE.test(code)) return;
  const room = decodeRoom(code);
  if (!room) return;
  s.room = room;
  s.roomCode = code;
}

/** Sync parse (M0): see the file header. Never throws. */
export function parseLink(url: URL): LinkStateX {
  const s: LinkStateX = { ghosts: [] };
  try {
    const p = allParams(url);
    const segs = url.pathname.split('/').filter(Boolean).map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    });
    // Path: the last recognised route segment wins (the base path may contain anything before it).
    for (let i = 0; i < segs.length; i++) {
      const seg = stripHtml(segs[i]);
      const next = i + 1 < segs.length ? stripHtml(segs[i + 1]) : undefined;
      if (seg === 'd' && next !== undefined && DAY_RE.test(next)) {
        s.dayNo = parseDaySlug(next);
        i++;
      } else if (seg === 'glass') s.glass = true;
      else if (seg === 'pick') s.pick = true;
      else if (seg === 'c' && next !== undefined && CODE_RE.test(next)) {
        s.catCode = next;
        i++;
      } else if (seg === 'r') setRoom(s, p.get('r'));
      else if (isRoute(seg)) s.route = seg;
    }
    // Hash / query equivalents (standalone builds).
    const d = p.get('d');
    if (d && DAY_RE.test(d)) s.dayNo = parseDaySlug(d);
    if (p.get('glass') === '1') s.glass = true;
    if (p.get('pick') === '1') s.pick = true;
    const cat = p.get('cat');
    if (cat && CODE_RE.test(cat)) s.catCode = cat;
    const route = p.get('route');
    if (route && isRoute(route)) s.route = route;
    if (s.route) {
      const params = routeParams(s.route, p);
      if (Object.keys(params).length) s.params = params;
    }
    if (!s.room && p.has('r') && (/(^|[#&])r=/.test(url.hash) || s.route === 'maker' || segs.some((x) => stripHtml(x) === 'r'))) {
      setRoom(s, p.get('r'));
    }
    if (s.room) {
      // v1 payloads carry no text: n / a fill what the payload lacks (v2 text wins, it is CRC-checked).
      const t = p.get('n');
      if (t != null && !s.room.title) {
        const title = filterTitle(t);
        if (title) s.room.title = title;
      }
      const a = p.get('a');
      if (a != null && !s.room.author) {
        const author = filterName(a);
        if (author) s.room.author = author;
      }
      if (s.route === 'maker' || p.get('remix') === '1') s.remix = true;
    }
    if (s.catCode && !s.room) {
      const n = p.get('n');
      if (n != null) {
        const name = filterName(n);
        if (name) s.catName = name;
      }
    }
    if (p.get('e') === 't') s.entry = 'typed';
    if (p.get('clip') === '1') s.clip = true;
    if (p.get('studio') === '1') s.studio = true;
    if (p.get('m') === 'f') s.ftue = true;
    const via = creatorCode(p.get('via') ?? '');
    if (via) s.via = via;
    const raw = linkGhostParams(url);
    if (raw.replay) {
      const rp = ghostRef(raw.replay, decodeGhostSync(raw.replay.g), s);
      if (rp) s.replay = rp;
    }
  } catch {
    /* a bad link is just the home screen */
  }
  return s;
}

/** Async parse: parseLink plus every ghost (`g`, `g2`) and a deflated `rp`. */
export async function parseLinkFull(url: URL): Promise<LinkStateX> {
  const s = parseLink(url);
  const raw = linkGhostParams(url);
  for (const g of raw.ghosts.slice(0, 2)) {
    const ref = ghostRef(g, await decodeGhost(g.g), s);
    if (ref) s.ghosts.push(ref);
  }
  if (!s.replay && raw.replay) {
    const ref = ghostRef(raw.replay, await decodeGhost(raw.replay.g), s);
    if (ref) s.replay = ref;
  }
  return s;
}

/** Room id the ghosts of this link are keyed to. */
export function linkRoomId(s: LinkState): string {
  if (s.room) return s.room.id;
  if (s.dayNo !== undefined) return dailyRoomId(s.dayNo);
  return GLASS_ROOM_ID;
}

/** Room payload for a link: a v1 `roomCode` of the same room is reused (its id keys old ghosts), else v2. */
function roomPayload(s: LinkState, room: RoomDef): { code: string; v1: boolean } {
  const rc = s.roomCode;
  if (rc && CODE_RE.test(rc)) {
    const raw = fromBase64url(rc);
    if (raw && raw.length > 0 && raw[0] >> 4 === 1 && decodeRoom(rc)?.id === room.id) return { code: rc, v1: true };
  }
  return { code: encodeRoom(room), v1: false };
}

function ghostParams(q: URLSearchParams, ref: GhostRef, suffix: '' | '2', roomLink: boolean): void {
  q.set(`c${suffix}`, encodeCat(ref.cat));
  const name = filterName(ref.name ?? ref.cat.name ?? '');
  if (name) q.set(`${roomLink ? 'gn' : 'n'}${suffix}`, name);
  if (typeof ref.score === 'number' && Number.isInteger(ref.score) && ref.score >= 0 && ref.score <= 999_999_999) {
    q.set(`s${suffix}`, String(ref.score));
  }
}

type GhostEncoder = (inputs: GhostRef['inputs'], roomId: string, simVersion?: number) => string;

/** A ghost keeps the rule set it was recorded with (a chained v4 ghost must not be re-stamped as v5). */
function ghostVersion(ref: GhostRef): number {
  const v = ref.simVersion;
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_REPLAY_SIM_VERSION && v <= SIM_VERSION ? v : SIM_VERSION;
}

/**
 * Room id the ghosts of a link being built are keyed to: for a room, the id the receiver will decode from the
 * payload actually written (a room straight from the editor has no ugc id yet).
 */
function buildRoomId(s: LinkState, roomCode: string | undefined): string {
  if (s.room && roomCode) return decodeRoom(roomCode)?.id ?? s.room.id;
  return linkRoomId(s);
}

function linkRoomCode(s: LinkState): string | undefined {
  if (!s.room || (s.route && s.route !== 'maker')) return undefined;
  return roomPayload(s, s.room).code;
}

function build(s: LinkStateX, base: string, ghostPayloads: { g: string[]; rp?: string }): string {
  const hashForm = base.includes('#');
  const root = hashForm ? base.slice(0, base.indexOf('#')) : base.replace(/\/+$/, '');
  const q = new URLSearchParams();
  let path = '';
  const room: RoomDef | undefined = s.room;
  const putRoom = (r: RoomDef): void => {
    const { code, v1 } = roomPayload(s, r);
    q.set('r', code);
    if (v1) {
      const title = r.title ? filterTitle(r.title) : '';
      if (title) q.set('n', title);
      const author = r.author ? filterName(r.author) : '';
      if (author) q.set('a', author);
    }
  };
  if (s.route && isRoute(s.route)) {
    path = `/${s.route}`;
    if (hashForm) q.set('route', s.route);
    for (const [k, v] of Object.entries(routeParams(s.route, s.params))) q.set(k, v);
    if (s.route === 'maker' && room) putRoom(room);
  } else if (room) {
    path = '/r';
    putRoom(room);
    if (s.remix) q.set('remix', '1');
  } else if (s.dayNo !== undefined) {
    path = `/d/${daySlug(s.dayNo)}`;
    if (hashForm) q.set('d', daySlug(s.dayNo));
  } else if (s.glass) {
    path = '/glass';
    if (hashForm) q.set('glass', '1');
  } else if (s.pick) {
    path = '/pick';
    if (hashForm) q.set('pick', '1');
  } else if (s.catCode) {
    path = `/c/${s.catCode}`;
    if (hashForm) q.set('cat', s.catCode);
    const n = s.catName ? filterName(s.catName) : '';
    if (n) q.set('n', n);
  }
  const roomLink = !!room && (!s.route || s.route === 'maker');
  if (!s.route || s.route === 'maker') {
    s.ghosts.slice(0, 2).forEach((g, i) => {
      const suffix = i === 0 ? '' : '2';
      q.set(`g${suffix}`, ghostPayloads.g[i]);
      ghostParams(q, g, suffix, roomLink);
    });
    if (s.replay && ghostPayloads.rp) {
      q.set('rp', ghostPayloads.rp);
      if (!s.ghosts.length) ghostParams(q, s.replay, '', roomLink);
    }
    if (s.clip) q.set('clip', '1');
  }
  if (s.entry === 'typed') q.set('e', 't');
  const via = s.via ? creatorCode(s.via) : null;
  if (via) q.set('via', via);
  if (s.studio) q.set('studio', '1');
  if (s.ftue) q.set('m', 'f');
  const qs = q.toString();
  if (hashForm) return `${root}${qs ? `#${qs}` : ''}`;
  return `${root}${path || '/'}${qs ? `?${qs}` : ''}`;
}

/**
 * Sync build. Base is the game root, e.g. 'https://tokentails.com/badcat' (path form) or
 * 'https://example.com/badcat/index.html#' (hash form, standalone). Ghosts are written uncompressed.
 */
export function buildLink(s: LinkState, base: string): string {
  const enc: GhostEncoder = (inputs, roomId, v) => encodeGhostSync(inputs, roomId, v);
  const roomId = buildRoomId(s, linkRoomCode(s));
  return build(s, base, {
    g: s.ghosts.slice(0, 2).map((g) => enc(g.inputs, roomId, ghostVersion(g))),
    rp: s.replay ? enc(s.replay.inputs, roomId, ghostVersion(s.replay)) : undefined,
  });
}

/** Async build with deflated ghosts (shorter dare links, M1a). */
export async function buildLinkAsync(s: LinkState, base: string): Promise<string> {
  const roomId = buildRoomId(s, linkRoomCode(s));
  const g: string[] = [];
  for (const ref of s.ghosts.slice(0, 2)) g.push(await encodeGhost(ref.inputs, roomId, ghostVersion(ref)));
  const rp = s.replay ? await encodeGhost(s.replay.inputs, roomId, ghostVersion(s.replay)) : undefined;
  return build(s, base, { g, rp });
}
