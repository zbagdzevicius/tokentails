/**
 * Pawlegends saves on the `/pawlegends` host page (POC.md §11.5; the `components/heist/heistSaves.ts` pattern).
 *
 * The one write path is `POST /user/catbassadors/live` with `type: PAWLEGENDS` and the match replay in the
 * `pawlegends` field; the backend re-simulates it in a worker thread and keeps only its own result. Won and lost
 * matches are both posted (the backend counts matches; only a first win per difficulty pays catnip).
 *
 * - **A Firebase user exists** (an account, or an anonymous guest from `/game`): the match is posted at once. A
 *   428 creates the guest session once (the API wrapper).
 * - **No Firebase user**: the match is queued in `tt.pawlegends.queue.v1` as a device match (owner `null`) and
 *   posted after sign-in. Unlike the Heist there is no claim prompt in the POC: the first uid that signs in on
 *   this device takes the device matches.
 * - **Outcomes** (`classifyPawlegendsSave`): 2xx saved; 409 (`PAWLEGENDS_DUPLICATE`) is done too; 400
 *   `PAWLEGENDS_SIM_VERSION` purges every queued match of that sim version; any other 4xx drops the match; 401,
 *   403 and 428 keep it; 429 (with `Retry-After`), 5xx and network failures back off (5 s, 15 s, 45 s ... 10 min).
 *
 * No React here: the saver takes its storage, transport and clock, so every rule is unit-tested.
 */
import type { MatchSaveResult } from "@/api/user-api";
import { backoffMs, type QueueStorage } from "@/components/heist/heistSaves";
import { ErrorCode } from "@/shared-contracts/errors";
import { replayOf, type PawlegendsReplay } from "./bridge";

export const PAWLEGENDS_QUEUE_KEY = "tt.pawlegends.queue.v1";
/** Most matches kept on the device (each replay is up to 40 KB); the oldest go first. */
export const PAWLEGENDS_QUEUE_MAX = 12;

export type PawlegendsSaveOutcome = "saved" | "stale" | "dropped" | "keep" | "backoff";
export type PawlegendsSaveStatus = "saved" | "queued" | "rejected" | "stale";

export interface QueuedMatch {
  id: string;
  owner: string | null;
  replay: PawlegendsReplay;
  createdAt: number;
  attempts: number;
  nextAt: number;
}

export function classifyPawlegendsSave(result: Pick<MatchSaveResult, "ok" | "status" | "code">): PawlegendsSaveOutcome {
  if (result.ok || result.status === 409) return "saved";
  const { status, code } = result;
  if (status === 400 && code === ErrorCode.PAWLEGENDS_SIM_VERSION) return "stale";
  if (status === 401 || status === 403 || status === 428) return "keep";
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "backoff";
  return "dropped";
}

export function statusOf(outcome: PawlegendsSaveOutcome): PawlegendsSaveStatus {
  if (outcome === "saved") return "saved";
  if (outcome === "stale") return "stale";
  if (outcome === "dropped") return "rejected";
  return "queued";
}

/** A stable id for one match (the same replay posted twice is one match). */
export const matchIdOf = (replay: PawlegendsReplay) =>
  `${replay.simVersion}-${replay.seed.toString(16)}-${replay.ticks}-${replay.finalHash}`;

function isQueued(value: unknown): value is QueuedMatch {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<QueuedMatch>;
  return (
    typeof m.id === "string" &&
    m.id.length > 0 &&
    m.id.length <= 64 &&
    (m.owner === null || (typeof m.owner === "string" && m.owner.length > 0)) &&
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
    return parsed.matches.filter(isQueued);
  } catch {
    return [];
  }
}

export interface PawlegendsSaverOptions {
  save: (replay: PawlegendsReplay) => Promise<MatchSaveResult>;
  /** The current Firebase uid, anonymous included; null with no Firebase user. */
  currentUid: () => string | null;
  storage?: QueueStorage | null;
  now?: () => number;
  random?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
  onStatus?: (id: string, status: PawlegendsSaveStatus, detail: { outcome: PawlegendsSaveOutcome | "device"; httpStatus: number }) => void;
  onStalePurged?: (count: number) => void;
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
    if (!storage) return;
    try {
      if (matches.length) storage.setItem(PAWLEGENDS_QUEUE_KEY, JSON.stringify({ v: 1, matches }));
      else storage.removeItem(PAWLEGENDS_QUEUE_KEY);
    } catch {
      // Quota or blocked storage: the in-memory copy holds for this page view.
    }
  }

  private enqueue(entry: QueuedMatch): void {
    const matches = this.read().filter((m) => m.id !== entry.id);
    matches.push(entry);
    while (matches.length > PAWLEGENDS_QUEUE_MAX) matches.shift();
    this.write(matches);
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

  /** One finished match from the game. */
  async submit(replay: PawlegendsReplay): Promise<PawlegendsSaveStatus | null> {
    if (this.disposed) return null;
    this.purgeOlderThan(replay.simVersion);
    const id = matchIdOf(replay);
    const now = this.now();
    const uid = this.opts.currentUid();
    if (!uid) {
      this.enqueue({ id, owner: null, replay, createdAt: now, attempts: 0, nextAt: now });
      this.opts.onStatus?.(id, "queued", { outcome: "device", httpStatus: 0 });
      return "queued";
    }
    const result = await this.attempt(replay);
    const outcome = classifyPawlegendsSave(result);
    if (outcome === "stale") {
      const purged = 1 + this.purgeVersion(replay.simVersion);
      this.opts.onStalePurged?.(purged);
    } else if (outcome === "keep" || outcome === "backoff") {
      this.enqueue({
        id,
        owner: uid,
        replay,
        createdAt: now,
        attempts: 1,
        nextAt: outcome === "backoff" ? now + backoffMs(0, this.opts.random, result.retryAfter) : now,
      });
      if (outcome === "backoff") this.scheduleDrain();
    }
    const status = statusOf(outcome);
    this.opts.onStatus?.(id, status, { outcome, httpStatus: result.status });
    return status;
  }

  /** Sends the due matches of the signed-in uid (device matches are taken by that uid first). */
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
    const all = this.read();
    if (all.some((m) => m.owner === null)) {
      this.write(all.map((m) => (m.owner === null ? { ...m, owner: uid, nextAt: this.now() } : m)));
    }
    let stale = 0;
    const due = this.read().filter((m) => m.owner === uid && m.nextAt <= this.now());
    for (const match of due) {
      if (this.disposed || this.opts.currentUid() !== uid) break;
      const current = this.read().find((m) => m.id === match.id);
      if (!current || current.owner !== uid) continue;
      const result = await this.attempt(current.replay);
      const outcome = classifyPawlegendsSave(result);
      if (outcome === "saved" || outcome === "dropped") {
        this.write(this.read().filter((m) => m.id !== current.id));
      } else if (outcome === "stale") {
        stale += this.purgeVersion(current.replay.simVersion);
      } else {
        const wait = backoffMs(current.attempts, this.opts.random, outcome === "backoff" ? result.retryAfter : undefined);
        this.write(
          this.read().map((m) => (m.id === current.id ? { ...m, attempts: m.attempts + 1, nextAt: this.now() + wait } : m))
        );
      }
      this.opts.onStatus?.(current.id, statusOf(outcome), { outcome, httpStatus: result.status });
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
    const pending = this.read().filter((m) => m.owner === uid || m.owner === null);
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
