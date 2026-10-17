/**
 * Pawlegends saves (POC.md §11.5): one POST to /live per match with a Firebase user, the offline queue
 * (`tt.pawlegends.queue.v1`) without one, drained after sign-in, and the outcome rules (409 done, stale sim
 * version purged, 4xx dropped, 401/428 kept, 429/5xx/offline backed off with Retry-After).
 */
import type { MatchSaveResult } from "@/api/user-api";
import {
  classifyPawlegendsSave,
  PAWLEGENDS_QUEUE_KEY,
  PAWLEGENDS_QUEUE_MAX,
  PawlegendsSaver,
  parsePawlegendsQueue,
} from "@/components/pawlegends/saves";
import type { PawlegendsReplay } from "@/components/pawlegends/bridge";
import { ErrorCode } from "@/shared-contracts/errors";

const replay = (over: Partial<PawlegendsReplay> = {}): PawlegendsReplay => ({
  v: 1,
  simVersion: 1,
  seed: 1,
  difficulty: "easy",
  hero: "clem",
  trick: "pounce",
  ticks: 9000,
  inputs: "AA==",
  outcome: "won",
  finalHash: "00000001",
  ...over,
});

function setup(results: MatchSaveResult[], uid: string | null = "uid-1") {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  let current = uid;
  let now = 1_000_000;
  const save = jest.fn(async () => results.shift() ?? { ok: true, status: 201, code: null });
  const scheduled: number[] = [];
  const onStatus = jest.fn();
  const onStalePurged = jest.fn();
  const saver = new PawlegendsSaver({
    save,
    currentUid: () => current,
    storage,
    now: () => now,
    random: () => 0,
    schedule: (_fn, ms) => {
      scheduled.push(ms);
      return () => undefined;
    },
    onStatus,
    onStalePurged,
  });
  return {
    saver,
    save,
    map,
    scheduled,
    onStatus,
    onStalePurged,
    setUid: (next: string | null) => (current = next),
    tick: (ms: number) => (now += ms),
    queue: () => parsePawlegendsQueue(map.get(PAWLEGENDS_QUEUE_KEY) ?? null),
  };
}

describe("classifyPawlegendsSave", () => {
  it("maps every /live answer", () => {
    expect(classifyPawlegendsSave({ ok: true, status: 201, code: null })).toBe("saved");
    expect(classifyPawlegendsSave({ ok: false, status: 409, code: ErrorCode.PAWLEGENDS_DUPLICATE })).toBe("saved");
    expect(classifyPawlegendsSave({ ok: false, status: 400, code: ErrorCode.PAWLEGENDS_SIM_VERSION })).toBe("stale");
    expect(classifyPawlegendsSave({ ok: false, status: 400, code: ErrorCode.PAWLEGENDS_HASH_MISMATCH })).toBe("dropped");
    expect(classifyPawlegendsSave({ ok: false, status: 413, code: null })).toBe("dropped");
    for (const status of [401, 403, 428]) expect(classifyPawlegendsSave({ ok: false, status, code: null })).toBe("keep");
    for (const status of [0, 408, 429, 500, 503]) expect(classifyPawlegendsSave({ ok: false, status, code: null })).toBe("backoff");
  });
});

describe("PawlegendsSaver", () => {
  it("posts at once with a user and queues nothing on success", async () => {
    const h = setup([]);
    expect(await h.saver.submit(replay())).toBe("saved");
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([]);
  });

  it("posts lost matches too", async () => {
    const h = setup([]);
    await h.saver.submit(replay({ outcome: "lost" }));
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ outcome: "lost" }));
  });

  it("without a user, queues a device match and sends it after sign-in", async () => {
    const h = setup([], null);
    expect(await h.saver.submit(replay())).toBe("queued");
    expect(h.save).not.toHaveBeenCalled();
    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].owner).toBeNull();
    h.setUid("uid-2");
    await h.saver.drain();
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([]);
  });

  it("backs off a 429 using Retry-After and retries on the next drain", async () => {
    const h = setup([{ ok: false, status: 429, code: null, retryAfter: 30 }]);
    expect(await h.saver.submit(replay())).toBe("queued");
    const [queued] = h.queue();
    expect(queued.nextAt - 1_000_000).toBe(30_000);
    expect(h.scheduled[0]).toBe(30_000);
    await h.saver.drain();
    expect(h.save).toHaveBeenCalledTimes(1); // not due yet
    h.tick(30_000);
    await h.saver.drain();
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.queue()).toEqual([]);
  });

  it("drops a tampered match (400) and purges a stale sim version with a message", async () => {
    const h = setup([
      { ok: false, status: 400, code: ErrorCode.PAWLEGENDS_HASH_MISMATCH },
      { ok: false, status: 400, code: ErrorCode.PAWLEGENDS_SIM_VERSION },
    ]);
    expect(await h.saver.submit(replay())).toBe("rejected");
    expect(h.queue()).toEqual([]);
    expect(await h.saver.submit(replay({ seed: 2 }))).toBe("stale");
    expect(h.onStalePurged).toHaveBeenCalledWith(1);
  });

  it("a newer sim purges older queued matches; the queue is capped", async () => {
    const h = setup([], null);
    for (let i = 0; i < PAWLEGENDS_QUEUE_MAX + 3; i++) await h.saver.submit(replay({ seed: i }));
    expect(h.queue()).toHaveLength(PAWLEGENDS_QUEUE_MAX);
    await h.saver.submit(replay({ simVersion: 2, seed: 99 }));
    expect(h.queue().map((m) => m.replay.simVersion)).toEqual([2]);
    expect(h.onStalePurged).toHaveBeenCalledWith(PAWLEGENDS_QUEUE_MAX);
  });

  it("the same replay is one queue entry; a malformed stored queue reads as empty", async () => {
    const h = setup([], null);
    await h.saver.submit(replay());
    await h.saver.submit(replay());
    expect(h.queue()).toHaveLength(1);
    h.map.set(PAWLEGENDS_QUEUE_KEY, "{not json");
    expect(h.saver.read()).toEqual([]);
  });
});
