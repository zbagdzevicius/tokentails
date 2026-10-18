/**
 * Pawlegends saves on the `/pawlegends` host page (POC.md §11.5; the `components/heist/heistSaves.ts` pattern).
 *
 * The one write path is `POST /user/catbassadors/live` with `type: PAWLEGENDS` and the match replay in the
 * `pawlegends` field; the backend re-simulates it in a worker thread and keeps only its own result. Won and lost
 * matches are both posted (the backend counts matches; only a first win per difficulty pays catnip, within
 * `PAWLEGENDS_LEVEL_CAPS`).
 *
 * The queue (`tt.pawlegends.queue.v1`) is keyed by the game's `matchId`, which every `save-result` repeats.
 * - **A Firebase user exists** (an account, or an anonymous guest from `/game`): the match is posted at once. A
 *   428 creates the guest session once (the API wrapper). A guest's match is marked `anon`: when a different uid
 *   signs in on the device, it goes back to the device matches (`releaseGuestRuns`), so the claim prompt asks.
 * - **No Firebase user**: the match is queued as a device match (owner `null`). Device matches are never sent
 *   on their own: the host asks "ADD YOUR MATCHES?" after sign-in (`claim(uid)` or `decline()`), like the Heist.
 * - **Outcomes** (`classifyPawlegendsSave`): 2xx saved; 409 (`PAWLEGENDS_DUPLICATE`) is done too; 400
 *   `PAWLEGENDS_SIM_VERSION` purges every queued match of that sim version; any other 4xx drops the match; 401,
 *   403 and 428 keep it; 429 (with `Retry-After`), 5xx and network failures back off (5 s, 15 s, 45 s ... 10 min).
 * - **Statuses** (`save-result.status`): `saving` before the post, then `saved`, `queued` (signed out, offline or
 *   waiting for an account: kept on the device), `failed` (the server failed, retried later) or `rejected`.
 *
 * No React here: the saver takes its storage, transport and clock, so every rule is unit-tested.
 */
import type { MatchSaveResult } from "@/api/user-api";
import { backoffMs, type QueueStorage } from "@/components/heist/heistSaves";
import { ErrorCode } from "@/shared-contracts/errors";
import { derivedMatchId, isMatchId, replayOf, type PawlegendsReplay, type PawlegendsSaveResultStatus } from "./bridge";
import { liveAnswerOf, type PawlegendsLiveAnswer } from "./session";

export const PAWLEGENDS_QUEUE_KEY = "tt.pawlegends.queue.v1";
/** Most matches kept on the device (each replay is up to 40 KB); the oldest go first. */
export const PAWLEGENDS_QUEUE_MAX = 12;

export type PawlegendsSaveOutcome = "saved" | "stale" | "dropped" | "keep" | "backoff";

export interface QueuedMatch {
  id: string;
  owner: string | null;
  /** Queued under an anonymous Firebase uid (a guest from `/game`). */
  anon?: boolean;
  replay: PawlegendsReplay;
  createdAt: number;
  attempts: number;
  nextAt: number;
}

export interface PawlegendsSaveDetail {
  outcome: PawlegendsSaveOutcome | "device" | "pending";
  httpStatus: number;
  code: string | null;
  /** The `/live` answer of a saved match (null for a 409 or a non-2xx). */
  answer: PawlegendsLiveAnswer | null;
}

export function classifyPawlegendsSave(result: Pick<MatchSaveResult, "ok" | "status" | "code">): PawlegendsSaveOutcome {
  if (result.ok || result.status === 409) return "saved";
  const { status, code } = result;
  if (status === 400 && code === ErrorCode.PAWLEGENDS_SIM_VERSION) return "stale";
  if (status === 401 || status === 403 || status === 428) return "keep";
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "backoff";
  return "dropped";
}

/** The `save-result.status` of an outcome. A network failure stays on the device (`queued`); a server one is `failed`. */
export function statusOf(outcome: PawlegendsSaveOutcome, httpStatus = 0): PawlegendsSaveResultStatus {
  if (outcome === "saved") return "saved";
  if (outcome === "stale" || outcome === "dropped") return "rejected";
  if (outcome === "keep") return "queued";
  return httpStatus === 0 ? "queued" : "failed";
}

/** The replay's own key: the same replay posted twice is one match, whatever id it came with. */
export const replayKeyOf = (replay: PawlegendsReplay) =>
  `${replay.simVersion}-${replay.seed.toString(16)}-${replay.ticks}-${replay.finalHash}`;

function isQueued(value: unknown): value is QueuedMatch {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<QueuedMatch>;
  return (
    typeof m.id === "string" &&
    m.id.length > 0 &&
    m.id.length <= 64 &&
    (m.owner === null || (typeof m.owner === "string" && m.owner.length > 0 && m.owner.length <= 128)) &&
    (m.anon === undefined || typeof m.anon === "boolean") &&
    replayOf(m.replay) !== null &&
    Number.isFinite(m.createdAt) &&
    Number.isFinite(m.attempts) &&
    Number.isFinite(m.nextAt)
  );
}

export function parsePawlegendsQueue(raw: string | null): QueuedMatch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; matches?: unknown };
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.matches)) return [];
    // Entries of the first POC build were keyed by `replayKeyOf`: they get the derived match id.
    return parsed.matches
      .filter(isQueued)
      .map((m) => (isMatchId(m.id) ? m : { ...m, id: derivedMatchId(m.replay) }));
  } catch {
    return [];
  }
}

export interface PawlegendsSaverOptions {
  save: (replay: PawlegendsReplay) => Promise<MatchSaveResult>;
  /** The current Firebase uid, anonymous included; null with no Firebase user. */
  currentUid: () => string | null;
  /** True while the current uid is an anonymous guest. */
  currentIsAnonymous?: () => boolean;
  storage?: QueueStorage | null;
  now?: () => number;
  random?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
  onStatus?: (matchId: string, status: PawlegendsSaveResultStatus, detail: PawlegendsSaveDetail) => void;
  onStalePurged?: (count: number) => void;
  /** The queue changed (the claim prompt counts `unclaimed()`). */
  onChange?: () => void;
}

export class PawlegendsSaver {
  private memory: QueuedMatch[] = [];
  private draining: Promise<void> | null = null;
  private cancelTimer: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly opts: PawlegendsSaverOptions) {}

  private get storage(): QueueStorage | null {
    if (this.opts.storage !== undefined) return this.opts.storage;
    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  read(): QueuedMatch[] {
    const storage = this.storage;
    if (!storage) return this.memory.slice();
    try {
      return parsePawlegendsQueue(storage.getItem(PAWLEGENDS_QUEUE_KEY));
    } catch {
      return this.memory.slice();
    }
  }

  private write(matches: QueuedMatch[]): void {
    this.memory = matches.slice();
    const storage = this.storage;
    if (storage) {
      try {
        if (matches.length) storage.setItem(PAWLEGENDS_QUEUE_KEY, JSON.stringify({ v: 1, matches }));
        else storage.removeItem(PAWLEGENDS_QUEUE_KEY);
      } catch {
        // Quota or blocked storage: the in-memory copy holds for this page view.
      }
    }
    this.opts.onChange?.();
  }

  /** Device matches no account has taken yet (the claim prompt's count). */
  unclaimed(): QueuedMatch[] {
    return this.read().filter((m) => m.owner === null);
  }

  ownedBy(uid: string): QueuedMatch[] {
    return this.read().filter((m) => m.owner === uid);
  }

  private enqueue(entry: QueuedMatch): void {
    const key = replayKeyOf(entry.replay);
    const matches = this.read().filter((m) => m.id !== entry.id && replayKeyOf(m.replay) !== key);
    matches.push(entry);
    while (matches.length > PAWLEGENDS_QUEUE_MAX) matches.shift();
    this.write(matches);
  }

  private remove(id: string): void {
    const matches = this.read();
    const keep = matches.filter((m) => m.id !== id);
    if (keep.length !== matches.length) this.write(keep);
  }

  private purgeVersion(simVersion: number): number {
    const matches = this.read();
    const keep = matches.filter((m) => m.replay.simVersion !== simVersion);
    if (keep.length !== matches.length) this.write(keep);
    return matches.length - keep.length;
  }

  /** Queued matches from an older sim can no longer verify: drop them when the game reports a newer one. */
  purgeOlderThan(simVersion: number): number {
    const matches = this.read();
    const keep = matches.filter((m) => m.replay.simVersion >= simVersion);
    const purged = matches.length - keep.length;
    if (purged) {
      this.write(keep);
      this.opts.onStalePurged?.(purged);
    }
    return purged;
  }

  private async attempt(replay: PawlegendsReplay): Promise<MatchSaveResult> {
    try {
      return await this.opts.save(replay);
    } catch {
      return { ok: false, status: 0, code: null };
    }
  }

  private report(id: string, outcome: PawlegendsSaveOutcome, result: MatchSaveResult): PawlegendsSaveResultStatus {
    const status = statusOf(outcome, result.status);
    const answer = result.ok ? liveAnswerOf(result.body) : null;
    const code = outcome === "stale" ? ErrorCode.PAWLEGENDS_SIM_VERSION : (result.code as string | null) ?? null;
    this.opts.onStatus?.(id, status, { outcome, httpStatus: result.status, code, answer });
    return status;
  }

  /** One finished match from the game, under the game's `matchId`. */
  async submit(matchId: string, replay: PawlegendsReplay): Promise<PawlegendsSaveResultStatus | null> {
    if (this.disposed || !isMatchId(matchId)) return null;
    this.purgeOlderThan(replay.simVersion);
    const now = this.now();
    const uid = this.opts.currentUid();
    if (!uid) {
      this.enqueue({ id: matchId, owner: null, replay, createdAt: now, attempts: 0, nextAt: now });
      this.opts.onStatus?.(matchId, "queued", { outcome: "device", httpStatus: 0, code: null, answer: null });
      return "queued";
    }
    this.opts.onStatus?.(matchId, "saving", { outcome: "pending", httpStatus: 0, code: null, answer: null });
    const result = await this.attempt(replay);
    const outcome = classifyPawlegendsSave(result);
    if (outcome === "stale") {
      const purged = 1 + this.purgeVersion(replay.simVersion);
      this.opts.onStalePurged?.(purged);
    } else if (outcome === "keep" || outcome === "backoff") {
      this.enqueue({
        id: matchId,
        owner: uid,
        ...(this.opts.currentIsAnonymous?.() ? { anon: true } : {}),
        replay,
        createdAt: now,
        attempts: 1,
        nextAt: outcome === "backoff" ? now + backoffMs(0, this.opts.random, result.retryAfter) : now,
      });
      if (outcome === "backoff") this.scheduleDrain();
    }
    return this.report(matchId, outcome, result);
  }

  /** "Add them": the device matches become `uid`'s and are sent. Returns how many were taken. */
  async claim(uid: string): Promise<number> {
    const matches = this.read();
    let claimed = 0;
    const next = matches.map((m) => {
      if (m.owner !== null) return m;
      claimed += 1;
      const { anon: _anon, ...rest } = m;
      void _anon;
      return { ...rest, owner: uid, nextAt: this.now() };
    });
    if (claimed) this.write(next);
    await this.drain();
    return claimed;
  }

  /** "Not mine": forgets every device match. */
  decline(): number {
    const matches = this.read();
    const keep = matches.filter((m) => m.owner !== null);
    const dropped = matches.length - keep.length;
    if (dropped) this.write(keep);
    return dropped;
  }

  /**
   * Matches queued under an anonymous uid that is no longer the signed-in one go back to the device matches, so
   * the claim prompt covers them. Only with a uid: while Firebase has not reported, nothing moves.
   */
  releaseGuestRuns(): number {
    const uid = this.opts.currentUid();
    if (!uid) return 0;
    const matches = this.read();
    let released = 0;
    const next = matches.map((m) => {
      if (!m.anon || m.owner === null || m.owner === uid) return m;
      released += 1;
      const { anon: _anon, ...rest } = m;
      void _anon;
      return { ...rest, owner: null, attempts: 0, nextAt: this.now() };
    });
    if (released) this.write(next);
    return released;
  }

  /** Sends the due matches of the signed-in uid, one at a time. Never sends device matches. */
  drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drainOnce().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async drainOnce(): Promise<void> {
    const uid = this.opts.currentUid();
    if (!uid || this.disposed) return;
    this.releaseGuestRuns();
    let stale = 0;
    const due = this.ownedBy(uid).filter((m) => m.nextAt <= this.now());
    for (const match of due) {
      if (this.disposed || this.opts.currentUid() !== uid) break;
      const current = this.read().find((m) => m.id === match.id);
      if (!current || current.owner !== uid) continue;
      this.opts.onStatus?.(current.id, "saving", { outcome: "pending", httpStatus: 0, code: null, answer: null });
      const result = await this.attempt(current.replay);
      const outcome = classifyPawlegendsSave(result);
      if (outcome === "saved" || outcome === "dropped") {
        this.remove(current.id);
      } else if (outcome === "stale") {
        stale += this.purgeVersion(current.replay.simVersion);
      } else {
        const wait = backoffMs(current.attempts, this.opts.random, outcome === "backoff" ? result.retryAfter : undefined);
        this.write(
          this.read().map((m) => (m.id === current.id ? { ...m, attempts: m.attempts + 1, nextAt: this.now() + wait } : m))
        );
      }
      this.report(current.id, outcome, result);
      if (outcome === "backoff" || outcome === "keep") break;
    }
    if (stale) this.opts.onStalePurged?.(stale);
    this.scheduleDrain();
  }

  scheduleDrain(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    const uid = this.opts.currentUid();
    if (!uid || this.disposed) return;
    const pending = this.ownedBy(uid);
    if (!pending.length) return;
    const wait = Math.max(0, Math.min(...pending.map((m) => m.nextAt)) - this.now());
    const schedule =
      this.opts.schedule ??
      ((fn: () => void, ms: number) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      });
    this.cancelTimer = schedule(() => {
      this.cancelTimer = null;
      void this.drain();
    }, Math.max(1_000, wait));
  }

  start(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
