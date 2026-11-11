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
    if (typeof v === "string" && v.length <= 140) args[k] = v;
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
    case "social.me":
      return { method: "POST", path: "/pawlegends/social/me", body: pick(a, ["name", "invisible", "allowRecent"]), auth: "registered" };
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
