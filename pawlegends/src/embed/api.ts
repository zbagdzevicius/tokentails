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
  // push notifications (SHARE-PUSH.md §2): the public key, and this device's subscription and categories
  'push.key',
  'push.subscribe',
  'push.prefs',
  'push.off',
  // country flags (FLAGS.md): the caller's flag (the server reads the country, never stores the IP) and the hide choice
  'flag.get',
  'flag.set',
  // match history (MATCH-HISTORY.md): the list (own, or a friend's by `code`), one match, who may see it
  'history.list',
  'history.match',
  // PLAYER-CARD.md: the Player Card from an end-of-match scoreboard (a room and a slot name the player; answers a code)
  'history.seat',
  // nicknames (SOCIAL-RANKED.md §2.3): the name others see, the price of the next change, and the change itself
  'name.get',
  'name.set',
  // Nov 20 (the nickname is the unique username): the live "taken / available" check while typing, and the one-time
  // notice of an assigned name seen
  'name.check',
  'name.seen',
  // LoL-style invites and the fast inbox (SOCIAL-INVITES.md): invites and DMs within seconds
  'social.inbox',
  'invite.answer',
  // SOCIAL-INVITES.md: nickname suggestions while typing in Add friend (`name`: the typed text)
  'social.search',
  // analytics: the play stats choice for the server's own events (registered accounts; the host answers a guest 403)
  'analytics.consent',
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
  // the social sidebar: Away, a preset status note (its index; -1 clears it) and a favourite friend (code + favOn)
  'away',
  'favOn',
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
  // push (SHARE-PUSH.md §2): the push service endpoint (up to 1,000 characters), its keys, categories, UTC offset
  'endpoint',
  'pushKey',
  'pushAuth',
  'cats',
  'tz',
  // gaps5: a Ranked duo invite ('ranked'); match history: the filter chip
  'mode',
  // FLAGS.md: hide the player's country flag (a boolean)
  'hideFlag',
  // match history: a match's id, and who may see the history ('everyone' | 'friends' | 'me')
  'match',
  'visibility',
  // SOCIAL-INVITES.md: the inviter's sim build, an invite's id and the toast's answer
  'sim',
  'invite',
  'answer',
  // social sidebar round 8: the pulse's device ('m' phone or tablet, 'd' computer)
  'dev',
  // analytics.consent: the choice (a boolean) and the account's analytics code
  'granted',
  'distinctId',
] as const);

export type ApiArgs = Partial<Record<(typeof API_ARG_KEYS)[number], string | number | boolean>>;

const MAX_STR = 140;
/** A chat line's raw text (the server normalises and cuts to 120 characters, or refuses). */
const MAX_TEXT = 240;
/** rewards-cloud: the progress blob's JSON (the server takes at most 30,000 characters). */
const MAX_BLOB = 30000;
/** push: a push service endpoint URL. */
const MAX_ENDPOINT = 1000;

/** Round 8: the device the menus run on for the presence pulse ('m' a touch screen, 'd' a computer). */
export const pulseDevice = (): 'm' | 'd' => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'm' : 'd');

/** Flat args: known keys, short strings, finite numbers, booleans; anything else is dropped. Null when not an object. */
export function cleanApiArgs(v: unknown): ApiArgs | null {
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: ApiArgs = {};
  for (const k of API_ARG_KEYS) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x === 'string' && x.length <= (k === 'text' ? MAX_TEXT : k === 'blob' ? MAX_BLOB : k === 'endpoint' ? MAX_ENDPOINT : MAX_STR)) out[k] = x;
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
