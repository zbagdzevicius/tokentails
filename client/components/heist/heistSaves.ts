/**
 * Catnip Heist saves on the `/heist` host page (plan G2 layer 3, F5.7 `optional`).
 *
 * The one write path is `POST /user/catbassadors/live` with the run's input log as `replay`; the
 * backend replays it and keeps only its own score and stars. Only won runs are posted (a lost run is
 * `HEIST_NOT_WON` on the server, so it is never sent).
 *
 * - **A Firebase user exists** (an account, or an anonymous guest from `/game`): the run is posted at
 *   once under that uid. A 428 creates the guest session once (the API wrapper). No queue entry is
 *   written for a run that saves.
 * - **No Firebase user at all**: the run goes to the local queue `tt.heist.queue.v1` as a device run
 *   (owner `null`). Device runs are sent only after the player confirms "Add N heists played on this
 *   device to your account?"; "Not mine" deletes them. Confirming tags them with the uid first.
 * - **Owner tags.** Every queued run that is not a device run carries the uid it belongs to, and is
 *   sent only while that uid is signed in. A run claimed by uid A never drains for uid B.
 * - **Anonymous owners.** A run queued under an anonymous uid (a guest from `/game` whose save
 *   failed) is marked `anon`. When another uid is signed in, that anonymous uid is gone for good
 *   (signing in to an existing account replaces it), so its runs would be stranded: they go back to
 *   device runs (`owner: null`), and the claim prompt asks again. They are never sent for the new uid
 *   without that answer.
 * - **Outcomes** (`classifySave`): 2xx saved; 409 (`HEIST_DUPLICATE`) is done too, the log is already
 *   stored (the 409 body's `mine`, when the backend sends it, tells whose row it is: see
 *   `duplicateOwner`); 400 `HEIST_SIM_VERSION` purges every queued run of that sim version with a visible
 *   message; any other 400 (and 413) drops the run; 401 and 403 keep it for later; 429, 5xx and
 *   network failures back off (5 s, 15 s, 45 s ... up to 10 min). A retryable failure of a direct
 *   save is queued under the uid, so a flaky network never loses a won run.
 * - **Stale sim versions.** When the Heist reports a run from a newer sim, queued runs from older
 *   versions can no longer verify; they are purged with the same message.
 *
 * Heist runs consume no lives (decision #17): nothing here touches lives, catnip or rewards.
 *
 * No React here: `HeistSaver` takes its storage, transport and clock, so every rule is unit-tested.
 */
import type { MatchSaveResult } from "@/api/user-api";
import { ErrorCode } from "@/shared-contracts/errors";
import { isHeistRunLog, type HeistRunLog, type HeistSaveStatus } from "@/shared-contracts/heist-bridge";

export const HEIST_QUEUE_KEY = "tt.heist.queue.v1";
/** Most runs kept on the device; the oldest go first. Logs are 1 to 60 KB. */
export const HEIST_QUEUE_MAX = 20;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 10 * 60_000;

export interface QueuedHeistRun {
  /** The run id the Heist gave it (pairs `save-result` messages). */
  id: string;
  /** The uid the run belongs to, or `null` for a device run waiting for a claim. */
  owner: string | null;
  /** `owner` was an anonymous Firebase uid when the run was queued. */
  anon?: boolean;
  log: HeistRunLog;
  createdAt: number;
  attempts: number;
  /** Earliest time of the next attempt (ms since epoch). */
  nextAt: number;
}

export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What to do with a run after a save attempt. */
export type SaveOutcome = "saved" | "stale" | "dropped" | "keep" | "backoff";

/** Maps a `/live` answer to what happens to the run (see the file comment). */
export function classifySave(result: Pick<MatchSaveResult, "ok" | "status" | "code">): SaveOutcome {
  if (result.ok) return "saved";
  const { status, code } = result;
  if (status === 409) return "saved";
  if (status === 400 && code === ErrorCode.HEIST_SIM_VERSION) return "stale";
  if (status === 401 || status === 403 || status === 428) return "keep";
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "backoff";
  return "dropped";
}

/**
 * Whose row a 409 points at: `mine` (the caller's, re-applied by the backend), `other` (another
 * account saved this exact log, so nothing was added here), or `unknown` (the body did not say).
 */
export type DuplicateOwner = "mine" | "other" | "unknown";

export function duplicateOwner(result: Pick<MatchSaveResult, "status" | "mine">): DuplicateOwner | null {
  if (result.status !== 409) return null;
  return result.mine === true ? "mine" : result.mine === false ? "other" : "unknown";
}

/** The status the Heist is told for an outcome (`save-result`). */
export function bridgeStatus(outcome: SaveOutcome, status: number): HeistSaveStatus {
  switch (outcome) {
    case "saved":
      return "saved";
    case "stale":
    case "dropped":
      return "rejected";
    case "keep":
      return status === 401 ? "signed-out" : "queued";
    case "backoff":
      return "queued";
  }
}

/** `heist_save {status}` for an outcome (the F9 `RequestStatus` vocabulary). */
export function analyticsStatus(outcome: SaveOutcome | "device", status = 0): "ok" | "error" | "rejected" | "guest" | "offline" {
  switch (outcome) {
    case "saved":
      return "ok";
    case "device":
      return "guest";
    case "stale":
    case "dropped":
      return "rejected";
    case "backoff":
      return status === 0 ? "offline" : "error";
    case "keep":
      return "error";
  }
}

/** Delay before attempt `attempts + 1`: 5 s, 15 s, 45 s ... capped at 10 min, with up to 20% jitter. */
export function backoffMs(attempts: number, random: () => number = Math.random, retryAfterS?: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(3, Math.max(0, attempts)));
  const jittered = Math.round(base * (1 + 0.2 * random()));
  const floor = retryAfterS && retryAfterS > 0 ? retryAfterS * 1000 : 0;
  return Math.min(BACKOFF_MAX_MS, Math.max(jittered, floor));
}

function isQueuedRun(value: unknown): value is QueuedHeistRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<QueuedHeistRun>;
  return (
    typeof run.id === "string" &&
    run.id.length > 0 &&
    run.id.length <= 64 &&
    (run.owner === null || (typeof run.owner === "string" && run.owner.length > 0)) &&
    (run.anon === undefined || typeof run.anon === "boolean") &&
    isHeistRunLog(run.log) &&
    Number.isFinite(run.createdAt) &&
    Number.isFinite(run.attempts) &&
    Number.isFinite(run.nextAt)
  );
}

/** Parses the stored queue; malformed entries are dropped, anything unreadable is an empty queue. */
export function parseQueue(raw: string | null): QueuedHeistRun[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; runs?: unknown };
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.runs)) return [];
    return parsed.runs.filter(isQueuedRun);
  } catch {
    return [];
  }
}

/** The page's localStorage, or null when it is blocked (the queue then lives for this page view). */
export function browserQueueStorage(): QueueStorage | null {
  try {
    const storage = window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export interface HeistSaverOptions {
  /** Posts one won run to `/live` (USER_API.saveMatchDetailed). */
  save: (log: HeistRunLog) => Promise<MatchSaveResult>;
  /** The current Firebase uid, anonymous included; null with no Firebase user. */
  currentUid: () => string | null;
  /** The current Firebase user is anonymous (a guest). */
  currentIsAnonymous?: () => boolean;
  storage?: QueueStorage | null;
  now?: () => number;
  random?: () => number;
  /** Schedules the next drain; returns a cancel function. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Every run's final status for this attempt (the save chip and the Heist's `save-result`). */
  onStatus?: (runId: string, status: HeistSaveStatus, detail: SaveDetail) => void;
  /** Runs dropped because their sim version is stale (the visible message). */
  onStalePurged?: (count: number) => void;
  /** The queue changed (counts for the claim prompt). */
  onChange?: () => void;
}

export interface SaveDetail {
  outcome: SaveOutcome | "device";
  code: string | null;
  httpStatus: number;
  /** For a 409: whose row it is. */
  duplicate?: DuplicateOwner | null;
}

/** The Heist's `save-result` status, with a 409 for another account's row reported as rejected. */
function resultStatus(outcome: SaveOutcome, result: MatchSaveResult): HeistSaveStatus {
  return duplicateOwner(result) === "other" ? "rejected" : bridgeStatus(outcome, result.status);
}

export interface SubmitResult {
  status: HeistSaveStatus;
  outcome: SaveOutcome | "device";
  queued: boolean;
}

export class HeistSaver {
  private memory: QueuedHeistRun[] = [];
  private draining: Promise<void> | null = null;
  private cancelTimer: (() => void) | null = null;
  private readonly opts: HeistSaverOptions;
  private disposed = false;

  constructor(options: HeistSaverOptions) {
    this.opts = options;
  }

  private get storage(): QueueStorage | null {
    return this.opts.storage === undefined ? browserQueueStorage() : this.opts.storage;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** The stored queue (read fresh, so another tab's changes are seen). */
  read(): QueuedHeistRun[] {
    const storage = this.storage;
    if (!storage) return this.memory.slice();
    try {
      return parseQueue(storage.getItem(HEIST_QUEUE_KEY));
    } catch {
      return this.memory.slice();
    }
  }

  private write(runs: QueuedHeistRun[]): void {
    this.memory = runs.slice();
    const storage = this.storage;
    if (storage) {
      try {
        if (runs.length) storage.setItem(HEIST_QUEUE_KEY, JSON.stringify({ v: 1, runs }));
        else storage.removeItem(HEIST_QUEUE_KEY);
      } catch {
        // Quota or blocked storage: the in-memory copy holds for this page view.
      }
    }
    this.opts.onChange?.();
  }

  /** Device runs waiting for a claim. */
  unclaimed(): QueuedHeistRun[] {
    return this.read().filter((run) => run.owner === null);
  }

  /** Runs that belong to `uid`. */
  ownedBy(uid: string): QueuedHeistRun[] {
    return this.read().filter((run) => run.owner === uid);
  }

  private enqueue(entry: QueuedHeistRun): void {
    const runs = this.read().filter((run) => run.id !== entry.id);
    runs.push(entry);
    // Keep the newest HEIST_QUEUE_MAX.
    while (runs.length > HEIST_QUEUE_MAX) runs.shift();
    this.write(runs);
  }

  private remove(ids: string[]): void {
    if (!ids.length) return;
    this.write(this.read().filter((run) => ids.indexOf(run.id) === -1));
  }

  /**
   * Drops queued runs whose sim version is below `simVersion` (they can no longer verify). Called
   * when the Heist reports a run from a newer sim. Returns how many went.
   */
  purgeOlderThan(simVersion: number): number {
    const runs = this.read();
    const keep = runs.filter((run) => run.log.simVersion >= simVersion);
    const purged = runs.length - keep.length;
    if (purged) {
      this.write(keep);
      this.opts.onStalePurged?.(purged);
    }
    return purged;
  }

  private purgeVersion(simVersion: number): number {
    const runs = this.read();
    const keep = runs.filter((run) => run.log.simVersion !== simVersion);
    const purged = runs.length - keep.length;
    if (purged) this.write(keep);
    return purged;
  }

  /** A run finished in the Heist. Only won runs are saved; a lost one is ignored. */
  async submit(runId: string, won: boolean, log: HeistRunLog): Promise<SubmitResult | null> {
    if (this.disposed) return null;
    // Any run, won or not, tells which sim the Heist now runs: older queued logs cannot verify.
    this.purgeOlderThan(log.simVersion);
    if (!won) return null;
    const uid = this.opts.currentUid();
    const now = this.now();
    if (!uid) {
      this.enqueue({ id: runId, owner: null, log, createdAt: now, attempts: 0, nextAt: now });
      this.opts.onStatus?.(runId, "queued", { outcome: "device", code: null, httpStatus: 0 });
      return { status: "queued", outcome: "device", queued: true };
    }
    const result = await this.attempt(log);
    const outcome = classifySave(result);
    let queued = false;
    if (outcome === "stale") {
      const purged = 1 + this.purgeVersion(log.simVersion);
      this.opts.onStalePurged?.(purged);
    } else if (outcome === "keep" || outcome === "backoff") {
      // Still this account's run: keep it, under this uid, for the next drain.
      this.enqueue({
        id: runId,
        owner: uid,
        ...(this.opts.currentIsAnonymous?.() ? { anon: true } : {}),
        log,
        createdAt: now,
        attempts: 1,
        nextAt: outcome === "backoff" ? now + backoffMs(0, this.opts.random, result.retryAfter) : now,
      });
      queued = true;
      if (outcome === "backoff") this.scheduleDrain();
    }
    const status = resultStatus(outcome, result);
    this.opts.onStatus?.(runId, status, { outcome, code: result.code, httpStatus: result.status, duplicate: duplicateOwner(result) });
    return { status, outcome, queued };
  }

  private async attempt(log: HeistRunLog): Promise<MatchSaveResult> {
    try {
      return await this.opts.save(log);
    } catch {
      return { ok: false, status: 0, code: null };
    }
  }

  /** "Add N heists to your account": tags every device run with `uid`, then sends them. */
  async claim(uid: string): Promise<number> {
    const runs = this.read();
    let claimed = 0;
    const next = runs.map((run) => {
      if (run.owner !== null) return run;
      claimed += 1;
      const { anon: _anon, ...rest } = run;
      void _anon;
      return { ...rest, owner: uid, nextAt: this.now() };
    });
    if (claimed) this.write(next);
    await this.drain();
    return claimed;
  }

  /**
   * Runs queued under an anonymous uid that is no longer signed in go back to device runs, so the
   * claim prompt covers them (see the file comment). Only with a signed-in uid: while Firebase has
   * not reported yet nothing is released. Returns how many.
   */
  releaseGuestRuns(): number {
    const uid = this.opts.currentUid();
    if (!uid) return 0;
    const runs = this.read();
    let released = 0;
    const next = runs.map((run) => {
      if (!run.anon || run.owner === null || run.owner === uid) return run;
      released += 1;
      const { anon: _anon, ...rest } = run;
      void _anon;
      return { ...rest, owner: null, attempts: 0, nextAt: this.now() };
    });
    if (released) this.write(next);
    return released;
  }

  /** "Not mine": forgets every device run. */
  decline(): number {
    const runs = this.read();
    const keep = runs.filter((run) => run.owner !== null);
    const dropped = runs.length - keep.length;
    if (dropped) this.write(keep);
    return dropped;
  }

  /** Sends the runs of the signed-in uid that are due, one at a time. Never sends device runs. */
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
    let stalePurged = 0;
    // A snapshot of the due runs; each one is re-checked against the stored queue before sending.
    const due = this.ownedBy(uid).filter((run) => run.nextAt <= this.now());
    for (const run of due) {
      if (this.disposed || this.opts.currentUid() !== uid) break;
      const current = this.read().find((entry) => entry.id === run.id);
      if (!current || current.owner !== uid) continue;
      const result = await this.attempt(current.log);
      const outcome = classifySave(result);
      if (outcome === "saved" || outcome === "dropped") {
        this.remove([current.id]);
      } else if (outcome === "stale") {
        stalePurged += this.purgeVersion(current.log.simVersion);
      } else {
        const attempts = current.attempts + 1;
        const wait = outcome === "backoff" ? backoffMs(current.attempts, this.opts.random, result.retryAfter) : backoffMs(current.attempts, this.opts.random);
        this.write(
          this.read().map((entry) => (entry.id === current.id ? { ...entry, attempts, nextAt: this.now() + wait } : entry))
        );
      }
      this.opts.onStatus?.(current.id, resultStatus(outcome, result), {
        outcome,
        code: result.code,
        httpStatus: result.status,
        duplicate: duplicateOwner(result),
      });
      // Busy, offline or signed out: stop and wait, do not hammer the server with the rest.
      if (outcome === "backoff" || outcome === "keep") break;
    }
    if (stalePurged) this.opts.onStalePurged?.(stalePurged);
    this.scheduleDrain();
  }

  /** Arms one timer for the earliest due run of the signed-in uid. */
  scheduleDrain(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    const uid = this.opts.currentUid();
    if (!uid || this.disposed) return;
    const pending = this.ownedBy(uid);
    if (!pending.length) return;
    const next = Math.min(...pending.map((run) => run.nextAt));
    const wait = Math.max(0, next - this.now());
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

  /** (Re)starts after `dispose` (a remount reuses the same saver). */
  start(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
