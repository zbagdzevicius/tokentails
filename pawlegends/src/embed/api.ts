/**
 * The game's API ops through the host (docs/plans/moba/SOCIAL-RANKED.md §13): the game never sees a token or a URL. It
 * sends `api-request{id, op, args}`; the host maps the op to one route from its own allowlist, adds its `accesstoken`
 * and answers `api-result{id, ok, status, body?}`. The op list is shared with the host
 * (`client/components/pawlegends/apiBridge.ts`); both are checked against `shared/pawlegends-bridge.fixtures.json`
 * (`apiOps`). Pure.
 */

export const API_OPS = Object.freeze([
  'social.get',
  'social.pulse',
  'friend.add',
  'friend.accept',
  'friend.decline',
  'friend.remove',
  'block.add',
  'block.remove',
  'social.me',
  'social.age',
  'social.code.rotate',
  'social.recent',
  'invite.send',
  'ranked.status',
  'ranked.me',
  'board.get',
  'report.send',
  'report.notice',
  // friends chat (CHAT-AVATARS.md §4)
  'chat.list',
  'chat.history',
  'chat.since',
  'chat.open',
  'chat.send',
  'chat.read',
  'chat.mute',
  'chat.report',
  // invite and comeback codes (backend pawlegends/growth): free, so the apps may call them too
  'growth.invite',
  'growth.redeem',
  'growth.claim',
  // clubs and good-teammate kudos (CLUBS-KUDOS.md §3, §5); club chat uses the chat ops with the club's thread
  'club.get',
  'club.create',
  'club.join',
  'club.leave',
  'club.remove',
  'club.claim',
  'kudos.give',
  // account progress (gap plan P2 rewards-cloud): the cosmetic-progress blob, max-merged by the server
  'progress.get',
  'progress.sync',
  // live ops (LIVEOPS.md): the Events calendar, the community goal, Winter Nap and the fan vote
  'liveops.config',
  'liveops.me',
  'liveops.claim',
  'liveops.nap',
  'liveops.vote',
] as const);
export type ApiOp = (typeof API_OPS)[number];
export const isApiOp = (v: unknown): v is ApiOp => typeof v === 'string' && (API_OPS as readonly string[]).includes(v);

/** The argument keys any op may carry (each op's route reads only its own). */
export const API_ARG_KEYS = Object.freeze([
  'code',
  'room',
  'slot',
  'reason',
  'note',
  'tick',
  'name',
  'invisible',
  'allowRecent',
  'ageBand',
  'kind',
  'hero',
  'week',
  'season',
  'page',
  'rev',
  'to',
  // friends chat and avatars (CHAT-AVATARS.md §4, §7.2): flat, like every other arg
  'thread',
  'before',
  'after',
  'upTo',
  'msg',
  'muted',
  'k',
  'pid',
  'text',
  'avatarKind',
  'avatarRef',
  'frame',
  'title',
  'dmPolicy',
  // rewards-cloud: the progress blob as one JSON string (up to BLOB_MAX)
  'blob',
  // live ops: the fan vote's choice ('a' | 'b')
  'option',
] as const);

export type ApiArgs = Partial<Record<(typeof API_ARG_KEYS)[number], string | number | boolean>>;

const MAX_STR = 140;
/** A chat line's raw text (the server normalises and cuts to 120 characters, or refuses). */
const MAX_TEXT = 240;
/** rewards-cloud: the progress blob's JSON (the server takes at most 30,000 characters). */
const MAX_BLOB = 30000;

/** Flat args: known keys, short strings, finite numbers, booleans; anything else is dropped. Null when not an object. */
export function cleanApiArgs(v: unknown): ApiArgs | null {
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: ApiArgs = {};
  for (const k of API_ARG_KEYS) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x === 'string' && x.length <= (k === 'text' ? MAX_TEXT : k === 'blob' ? MAX_BLOB : MAX_STR)) out[k] = x;
    else if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'boolean') out[k] = x;
  }
  return out;
}

export interface ApiResult {
  id: string;
  ok: boolean;
  status: number;
  body?: unknown;
}

const ID = /^[a-z0-9]{1,16}$/;
/** The largest answer body the game accepts (a Friends sheet of 100 friends fits in well under it). */
export const API_BODY_MAX = 64_000;

export function parseApiResult(m: Record<string, unknown>): ApiResult | null {
  if (typeof m.id !== 'string' || !ID.test(m.id)) return null;
  if (typeof m.ok !== 'boolean') return null;
  if (typeof m.status !== 'number' || !Number.isInteger(m.status) || m.status < 0 || m.status > 599) return null;
  const out: ApiResult = { id: m.id, ok: m.ok, status: m.status };
  if (m.body !== undefined && m.body !== null) {
    if (typeof m.body !== 'object') return null;
    let size = Infinity;
    try {
      size = JSON.stringify(m.body).length;
    } catch {
      return null;
    }
    if (size > API_BODY_MAX) return null;
    out.body = m.body;
  }
  return out;
}

export interface ApiRequest {
  id: string;
  op: ApiOp;
  args: ApiArgs;
}

export function parseApiRequest(m: Record<string, unknown>): ApiRequest | null {
  if (typeof m.id !== 'string' || !ID.test(m.id) || !isApiOp(m.op)) return null;
  const args = cleanApiArgs(m.args);
  return args ? { id: m.id, op: m.op, args } : null;
}
