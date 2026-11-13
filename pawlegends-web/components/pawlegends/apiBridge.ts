/**
 * The host half of the game's API ops (docs/plans/moba/SOCIAL-RANKED.md §13). The game sends `api-request{id, op,
 * args}`; the host maps the op to ONE route of this allowlist, builds the path itself (never a URL from the game),
 * adds its own lowercase `accesstoken` (the `fb…` Firebase token) and answers `api-result{id, ok, status, body?}`.
 * Registered-only ops answer a guest `{ok: false, status: 403}` without a network call. The op list is shared with the
 * game (`pawlegends/src/embed/api.ts`); both are checked against `shared/pawlegends-bridge.fixtures.json` (`apiOps`).
 *
 * No React here: the fetcher and the clock are injected, so every rule is unit-tested.
 */

export const PAWLEGENDS_API_OPS = [
  "social.get",
  "social.pulse",
  "friend.add",
  "friend.accept",
  "friend.decline",
  "friend.remove",
  "block.add",
  "block.remove",
  "social.me",
  "social.age",
  "social.code.rotate",
  "social.recent",
  "invite.send",
  "ranked.status",
  "ranked.me",
  "board.get",
  "report.send",
  "report.notice",
  // friends chat (docs/plans/moba/CHAT-AVATARS.md §4)
  "chat.list",
  "chat.history",
  "chat.since",
  "chat.open",
  "chat.send",
  "chat.read",
  "chat.mute",
  "chat.report",
  // invite and comeback codes (backend pawlegends/growth): free, so the apps may call them too
  "growth.invite",
  "growth.redeem",
  "growth.claim",
  // clubs and good-teammate kudos (docs/plans/moba/CLUBS-KUDOS.md §3, §5); club chat uses the chat ops
  "club.get",
  "club.create",
  "club.join",
  "club.leave",
  "club.remove",
  "club.claim",
  "kudos.give",
  // account progress (gap plan P2 rewards-cloud): the cosmetic-progress blob, max-merged by the server
  "progress.get",
  "progress.sync",
] as const;
export type PawlegendsApiOp = (typeof PAWLEGENDS_API_OPS)[number];

const ARG_KEYS = [
  "code",
  "room",
  "slot",
  "reason",
  "note",
  "tick",
  "name",
  "invisible",
  "allowRecent",
  "ageBand",
  "kind",
  "hero",
  "week",
  "season",
  "page",
  "rev",
  "to",
  // friends chat and avatars (CHAT-AVATARS.md §4, §7.2)
  "thread",
  "before",
  "after",
  "upTo",
  "msg",
  "muted",
  "k",
  "pid",
  "text",
  "avatarKind",
  "avatarRef",
  "frame",
  "title",
  "dmPolicy",
  // rewards-cloud: the progress blob as one JSON string (up to 30,000 characters)
  "blob",
] as const;
export type PawlegendsApiArgs = Partial<Record<(typeof ARG_KEYS)[number], string | number | boolean>>;

export interface PawlegendsApiRequest {
  id: string;
  op: PawlegendsApiOp;
  args: PawlegendsApiArgs;
}

const ID = /^[a-z0-9]{1,16}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A game `api-request`, cleaned (unknown op: null; unknown or nested args: dropped). */
export function parseApiRequest(data: Record<string, unknown>): PawlegendsApiRequest | null {
  if (typeof data.id !== "string" || !ID.test(data.id)) return null;
  if (typeof data.op !== "string" || !(PAWLEGENDS_API_OPS as readonly string[]).includes(data.op)) return null;
  if (data.args !== undefined && !isRecord(data.args)) return null;
  const args: PawlegendsApiArgs = {};
  const raw = (data.args ?? {}) as Record<string, unknown>;
  for (const k of ARG_KEYS) {
    const v = raw[k];
    // a chat line's raw text may be up to 240 code units (the server normalises and cuts to 120, or refuses)
    // the progress blob (rewards-cloud) is one JSON string of up to 30,000 characters
    if (typeof v === "string" && v.length <= (k === "text" ? 240 : k === "blob" ? 30000 : 140)) args[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) args[k] = v;
    else if (typeof v === "boolean") args[k] = v;
  }
  return { id: data.id, op: data.op as PawlegendsApiOp, args };
}

/** The `api-result` the host may post: an object body under 64 KB, else no body. */
export const PAWLEGENDS_API_BODY_MAX = 64_000;
export function apiResultOf(data: Record<string, unknown>): { id: string; ok: boolean; status: number; body?: object } | null {
  if (typeof data.id !== "string" || !ID.test(data.id) || typeof data.ok !== "boolean") return null;
  if (typeof data.status !== "number" || !Number.isInteger(data.status) || data.status < 0 || data.status > 599) return null;
  const out: { id: string; ok: boolean; status: number; body?: object } = { id: data.id, ok: data.ok, status: data.status };
  if (data.body !== undefined && data.body !== null) {
    if (typeof data.body !== "object") return null;
    let size = Infinity;
    try {
      size = JSON.stringify(data.body).length;
    } catch {
      return null;
    }
    if (size > PAWLEGENDS_API_BODY_MAX) return null;
    out.body = data.body as object;
  }
  return out;
}

export interface PawlegendsApiRoute {
  method: "GET" | "POST" | "DELETE";
  /** Path below the API base, built here only. */
  path: string;
  body?: Record<string, unknown>;
  /** "registered": a guest is answered 403 without a call; "any": guests too (a 428 creates the guest session); "none": no token. */
  auth: "registered" | "any" | "none";
}

const CODE = /^[A-Za-z0-9 -]{4,20}$/;
/** An opaque chat thread id (DM, party or club: CLUBS-KUDOS.md) and a message id (CHAT-AVATARS.md §3). */
const THREAD = /^[dpc][A-Za-z0-9_-]{22}$/;
const MID = /^[a-f0-9]{24}$/;
const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const str = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const pick = (a: PawlegendsApiArgs, keys: readonly (keyof PawlegendsApiArgs)[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (a[k] !== undefined) out[k] = a[k];
  return out;
};
const target = (a: PawlegendsApiArgs) => {
  const code = str(a.code, CODE);
  if (code) return { code };
  const room = str(a.room, ROOM);
  const slot = int(a.slot, 0, 9);
  return room && slot !== null ? { room, slot } : null;
};
const q = (params: Record<string, unknown>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : "";
};

/** The one route of an op, or null when its args are bad. */
export function routeOf(op: PawlegendsApiOp, a: PawlegendsApiArgs): PawlegendsApiRoute | null {
  const code = str(a.code, CODE);
  const enc = (c: string) => encodeURIComponent(c);
  switch (op) {
    case "social.get":
      return { method: "GET", path: "/pawlegends/social", auth: "registered" };
    case "social.pulse":
      return { method: "GET", path: `/pawlegends/social/pulse${q({ rev: str(a.rev, /^[A-Za-z0-9_-]{1,32}$/) })}`, auth: "registered" };
    case "friend.add": {
      const t = target(a);
      return t ? { method: "POST", path: "/pawlegends/social/friends", body: t, auth: "registered" } : null;
    }
    case "friend.accept":
      return code ? { method: "POST", path: `/pawlegends/social/friends/${enc(code)}/accept`, body: {}, auth: "registered" } : null;
    case "friend.decline":
      return code ? { method: "POST", path: `/pawlegends/social/friends/${enc(code)}/decline`, body: {}, auth: "registered" } : null;
    case "friend.remove":
      return code ? { method: "DELETE", path: `/pawlegends/social/friends/${enc(code)}`, auth: "registered" } : null;
    case "block.add": {
      const t = target(a);
      return t ? { method: "POST", path: "/pawlegends/social/blocks", body: t, auth: "registered" } : null;
    }
    case "block.remove":
      return code ? { method: "DELETE", path: `/pawlegends/social/blocks/${enc(code)}`, auth: "registered" } : null;
    case "social.me": {
      const body: Record<string, unknown> = pick(a, ["name", "invisible", "allowRecent"]);
      // the avatar (CHAT-AVATARS.md §7.2): flat args to the server's shape; the server checks ownership
      const kind = str(a.avatarKind, /^(hero|cat|icon)$/);
      const ref = str(a.avatarRef, /^[a-z0-9._-]{1,48}$/);
      if (kind && ref) body.avatar = kind === "hero" ? { kind, hero: ref } : kind === "cat" ? { kind, catId: ref } : { kind, icon: ref };
      for (const f of ["frame", "title"] as const) {
        if (a[f] === "none") body[f] = null;
        else if (str(a[f], /^(frame|title)\.[a-z0-9._-]{1,48}$/)) body[f] = a[f];
      }
      const dm = str(a.dmPolicy, /^(friends|off)$/);
      if (dm) body.dmPolicy = dm;
      return { method: "POST", path: "/pawlegends/social/me", body, auth: "registered" };
    }
    case "social.age":
      return str(a.ageBand, /^(under16|16-17|18\+)$/)
        ? { method: "POST", path: "/pawlegends/social/age", body: { ageBand: a.ageBand }, auth: "registered" }
        : null;
    case "social.code.rotate":
      return { method: "POST", path: "/pawlegends/social/code/rotate", body: {}, auth: "registered" };
    case "social.recent":
      return { method: "GET", path: "/pawlegends/social/recent", auth: "registered" };
    case "invite.send": {
      const to = str(a.to, CODE);
      return to ? { method: "POST", path: "/pawlegends/social/invite", body: { to }, auth: "registered" } : null;
    }
    case "ranked.status":
      return { method: "GET", path: "/pawlegends/ranked/status", auth: "none" };
    case "ranked.me":
      return { method: "GET", path: "/pawlegends/ranked/me", auth: "any" };
    case "board.get": {
      const kind = str(a.kind, /^(global|friends|hero|weekly)$/);
      if (!kind) return null;
      const query = q({
        hero: str(a.hero, /^[a-z0-9_-]{1,32}$/i),
        week: str(a.week, /^\d{4}-W\d{2}$/),
        season: str(a.season, /^s\d{1,3}$/),
        page: int(a.page, 0, 50),
      });
      // the friends board and the caller's own rank need a token; the rest are public
      return kind === "friends" || a.name === "me"
        ? { method: "GET", path: `/pawlegends/boards/${kind}/me${query}`, auth: "registered" }
        : { method: "GET", path: `/pawlegends/boards/${kind}${query}`, auth: "none" };
    }
    case "report.send": {
      const room = str(a.room, ROOM);
      const slot = int(a.slot, 0, 9);
      const reason = str(a.reason, /^(afk|grief|cheat|name)$/);
      if (!room || slot === null || !reason) return null;
      const body: Record<string, unknown> = { room, slot, reason };
      const tick = int(a.tick, 0, 1_000_000);
      if (tick !== null) body.tick = tick;
      if (typeof a.note === "string" && a.note.length <= 140) body.note = a.note;
      return { method: "POST", path: "/pawlegends/reports", body, auth: "any" };
    }
    case "report.notice":
      return { method: "POST", path: "/pawlegends/reports/notice", body: {}, auth: "registered" };
    case "chat.list":
      return { method: "GET", path: "/pawlegends/social/chat", auth: "registered" };
    case "chat.history": {
      const thread = str(a.thread, THREAD);
      return thread ? { method: "GET", path: `/pawlegends/social/chat/${thread}${q({ before: str(a.before, MID) })}`, auth: "registered" } : null;
    }
    case "chat.since": {
      const thread = str(a.thread, THREAD);
      const after = str(a.after, MID);
      return thread && after ? { method: "GET", path: `/pawlegends/social/chat/${thread}/since/${after}`, auth: "registered" } : null;
    }
    case "chat.open":
      return code ? { method: "POST", path: `/pawlegends/social/chat/dm/${enc(code)}`, body: {}, auth: "registered" } : null;
    case "chat.send": {
      const thread = str(a.thread, THREAD);
      if (!thread) return null;
      if (a.k === "t" && typeof a.text === "string" && a.text.length >= 1 && a.text.length <= 240)
        return { method: "POST", path: `/pawlegends/social/chat/${thread}`, body: { k: "t", text: a.text }, auth: "registered" };
      const id = int(a.pid, 0, 63);
      if ((a.k === "q" || a.k === "s") && id !== null)
        return { method: "POST", path: `/pawlegends/social/chat/${thread}`, body: { k: a.k, id }, auth: "registered" };
      return null;
    }
    case "chat.read": {
      const thread = str(a.thread, THREAD);
      const upTo = str(a.upTo, MID);
      return thread ? { method: "POST", path: `/pawlegends/social/chat/${thread}/read`, body: upTo ? { upTo } : {}, auth: "registered" } : null;
    }
    case "chat.mute": {
      const thread = str(a.thread, THREAD);
      return thread && typeof a.muted === "boolean"
        ? { method: "POST", path: `/pawlegends/social/chat/${thread}/mute`, body: { muted: a.muted }, auth: "registered" }
        : null;
    }
    case "chat.report": {
      const msg = str(a.msg, MID);
      const kind = str(a.kind, /^(harass|sexual|contact|spam|other)$/);
      if (!msg || !kind) return null;
      const body: Record<string, unknown> = { msg, kind };
      if (typeof a.note === "string" && a.note.length <= 140) body.note = a.note;
      return { method: "POST", path: "/pawlegends/social/chat/report", body, auth: "registered" };
    }
    case "growth.invite":
      return { method: "GET", path: "/pawlegends/growth/invite", auth: "registered" };
    case "growth.redeem":
      return code ? { method: "POST", path: "/pawlegends/growth/invite/redeem", body: { code }, auth: "registered" } : null;
    case "growth.claim":
      return { method: "POST", path: "/pawlegends/growth/invite/claim", body: {}, auth: "registered" };
    // clubs and good-teammate kudos (CLUBS-KUDOS.md §3, §5): registered accounts only
    case "club.get":
      return { method: "GET", path: "/pawlegends/clubs/me", auth: "registered" };
    case "club.create": {
      const name = str(a.name, /^\d{1,2}\.\d{1,2}$/);
      return name ? { method: "POST", path: "/pawlegends/clubs", body: { name }, auth: "registered" } : null;
    }
    case "club.join": {
      const c = str(a.code, /^[A-Za-z0-9 -]{6,12}$/);
      return c ? { method: "POST", path: "/pawlegends/clubs/join", body: { code: c }, auth: "registered" } : null;
    }
    case "club.leave":
      return { method: "POST", path: "/pawlegends/clubs/leave", body: {}, auth: "registered" };
    case "club.remove": {
      const to = str(a.to, /^[a-f0-9]{12}$/);
      return to ? { method: "POST", path: "/pawlegends/clubs/remove", body: { to }, auth: "registered" } : null;
    }
    case "club.claim":
      return { method: "POST", path: "/pawlegends/clubs/chest/claim", body: {}, auth: "registered" };
    case "kudos.give": {
      const room = str(a.room, ROOM);
      const slot = int(a.slot, 0, 9);
      return room && slot !== null ? { method: "POST", path: "/pawlegends/kudos", body: { room, slot }, auth: "registered" } : null;
    }
    // account progress (gap plan P2 rewards-cloud): guests with a session too ("any"); the server max-merges, never scores
    case "progress.get":
      return { method: "GET", path: "/pawlegends/progress", auth: "any" };
    case "progress.sync":
      return typeof a.blob === "string" && a.blob.length >= 2 && a.blob.length <= 30000
        ? { method: "POST", path: "/pawlegends/progress", body: { blob: a.blob }, auth: "any" }
        : null;
    default:
      return null;
  }
}

export interface PawlegendsApiFetchResult {
  status: number;
  body: unknown;
}

export interface PawlegendsApiOptions {
  /** Calls the API with the host's session (`auth` says which token rule); never throws for an HTTP answer. */
  fetch: (route: PawlegendsApiRoute) => Promise<PawlegendsApiFetchResult>;
  answer: (id: string, ok: boolean, status: number, body?: object) => void;
  /** A registered (not anonymous) account is signed in. */
  signedIn: () => boolean;
  now?: () => number;
}

/** Ops a page sends at most per minute (the pulse is 2 a minute; a Friends sheet a few). */
export const PAWLEGENDS_API_PER_MINUTE = 60;

export class PawlegendsApi {
  private times: number[] = [];
  private readonly now: () => number;

  constructor(private readonly opts: PawlegendsApiOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  async request(req: PawlegendsApiRequest): Promise<void> {
    const route = routeOf(req.op, req.args);
    if (!route) return this.opts.answer(req.id, false, 400);
    if (route.auth === "registered" && !this.opts.signedIn())
      return this.opts.answer(req.id, false, 403, { code: "need_account" });
    const now = this.now();
    this.times = this.times.filter((t) => now - t < 60_000);
    if (this.times.length >= PAWLEGENDS_API_PER_MINUTE) return this.opts.answer(req.id, false, 429);
    this.times.push(now);
    try {
      const r = await this.opts.fetch(route);
      const body = r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as object) : undefined;
      const ok = r.status >= 200 && r.status < 300;
      let size = 0;
      try {
        size = body ? JSON.stringify(body).length : 0;
      } catch {
        size = Infinity;
      }
      this.opts.answer(req.id, ok, r.status, size <= PAWLEGENDS_API_BODY_MAX ? body : undefined);
    } catch {
      this.opts.answer(req.id, false, 0);
    }
  }
}
