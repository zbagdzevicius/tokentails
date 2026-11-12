/**
 * Pawlegends saves (POC.md §11.5): one POST to /live per match with a Firebase user, keyed by the game's matchId;
 * the device queue (`tt.pawlegends.queue.v1`) without one, sent only after the player claims it ("ADD YOUR
 * MATCHES?"); guest matches released to the claim when another uid signs in; the outcome rules (409 done, stale sim
 * version purged, 4xx dropped, 401/428 kept, 429/5xx/offline backed off with Retry-After) and the `save-result`
 * statuses with the `/live` answer; the match written to the queue before its POST, so a page closed mid-POST
 * sends it on the next load (launch finding R3).
 */
import type { MatchSaveResult } from "@/api/user-api";
import {
  classifyPawlegendsSave,
  PAWLEGENDS_INFLIGHT_HOLD_MS,
  PAWLEGENDS_QUEUE_KEY,
  PAWLEGENDS_QUEUE_MAX,
  PAWLEGENDS_SAVE_TIMEOUT_MS,
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

function setup(results: MatchSaveResult[], uid: string | null = "uid-1", anonymous = false) {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  let current = uid;
  let anon = anonymous;
  let now = 1_000_000;
  const save = jest.fn(async () => results.shift() ?? { ok: true, status: 201, code: null });
  const scheduled: number[] = [];
  const onStatus = jest.fn();
  const onStalePurged = jest.fn();
  const saver = new PawlegendsSaver({
    save,
    currentUid: () => current,
    currentIsAnonymous: () => anon,
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
    setUid: (next: string | null, nextAnon = false) => {
      current = next;
      anon = nextAnon;
    },
    tick: (ms: number) => (now += ms),
    /** A second page load on the same device storage and clock. */
    reload: (nextResults: MatchSaveResult[] = []) => {
      const nextSave = jest.fn(async () => nextResults.shift() ?? { ok: true, status: 201, code: null });
      const next = new PawlegendsSaver({
        save: nextSave,
        currentUid: () => current,
        currentIsAnonymous: () => anon,
        storage,
        now: () => now,
        random: () => 0,
        schedule: () => () => undefined,
      });
      return { saver: next, save: nextSave };
    },
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
  const LIVE = { difficulty: "easy", outcome: "won", ticks: 9000, finalHash: "00000001", catnipPaid: 20, catnipCount: 140, fastestWin: 9000 };

  it("posts at once with a user: saving, then saved with the /live answer; nothing queued", async () => {
    const h = setup([{ ok: true, status: 201, code: null, body: LIVE }]);
    expect(await h.saver.submit("m1", replay())).toBe("saved");
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([]);
    expect(h.onStatus.mock.calls.map((c) => c[1])).toEqual(["saving", "saved"]);
    expect(h.onStatus.mock.calls[1][0]).toBe("m1");
    expect(h.onStatus.mock.calls[1][2].answer).toEqual({
      difficulty: "easy",
      outcome: "won",
      catnipPaid: 20,
      catnipCount: 140,
      fastestWin: 9000,
    });
  });

  it("posts lost matches too; a 409 duplicate counts as saved with no answer", async () => {
    const h = setup([{ ok: true, status: 201, code: null }, { ok: false, status: 409, code: ErrorCode.PAWLEGENDS_DUPLICATE }]);
    await h.saver.submit("m1", replay({ outcome: "lost" }));
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ outcome: "lost" }), expect.any(AbortSignal));
    expect(await h.saver.submit("m2", replay({ seed: 3 }))).toBe("saved");
    expect(h.onStatus.mock.calls[3][2].answer).toBeNull();
  });

  it("refuses a malformed match id", async () => {
    const h = setup([]);
    expect(await h.saver.submit("Not-An-Id", replay())).toBeNull();
    expect(h.save).not.toHaveBeenCalled();
  });

  it("without a user, queues a device match that is only sent once claimed", async () => {
    const h = setup([], null);
    expect(await h.saver.submit("m1", replay())).toBe("queued");
    expect(h.save).not.toHaveBeenCalled();
    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0]).toMatchObject({ id: "m1", owner: null });
    h.setUid("uid-2");
    await h.saver.drain();
    // No silent "first uid takes all": the host asks first.
    expect(h.save).not.toHaveBeenCalled();
    expect(h.saver.unclaimed()).toHaveLength(1);
    expect(await h.saver.claim("uid-2")).toBe(1);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([]);
  });

  it("decline forgets the device matches and keeps the account's own", async () => {
    const h = setup([{ ok: false, status: 503, code: null }], null);
    await h.saver.submit("m1", replay());
    h.setUid("uid-1");
    await h.saver.submit("m2", replay({ seed: 2 }));
    expect(h.saver.decline()).toBe(1);
    expect(h.queue().map((m) => m.id)).toEqual(["m2"]);
  });

  it("a guest's queued match goes back to the claim when another uid signs in", async () => {
    const h = setup([{ ok: false, status: 503, code: null }], "anon-1", true);
    expect(await h.saver.submit("m1", replay())).toBe("failed");
    expect(h.queue()[0]).toMatchObject({ owner: "anon-1", anon: true });
    h.setUid("uid-9");
    expect(h.saver.releaseGuestRuns()).toBe(1);
    expect(h.saver.unclaimed().map((m) => m.id)).toEqual(["m1"]);
  });

  it("backs off a 429 using Retry-After (failed), retries on the next drain; offline stays queued", async () => {
    const h = setup([{ ok: false, status: 429, code: null, retryAfter: 30 }, { ok: false, status: 0, code: null }]);
    expect(await h.saver.submit("m1", replay())).toBe("failed");
    const [queued] = h.queue();
    expect(queued.nextAt - 1_000_000).toBe(30_000);
    expect(h.scheduled[0]).toBe(30_000);
    await h.saver.drain();
    expect(h.save).toHaveBeenCalledTimes(1); // not due yet
    h.tick(30_000);
    await h.saver.drain();
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.onStatus.mock.calls[h.onStatus.mock.calls.length - 1][1]).toBe("queued");
  });

  it("drops a tampered match (400, rejected) and purges a stale sim version (rejected, with its code)", async () => {
    const h = setup([
      { ok: false, status: 400, code: ErrorCode.PAWLEGENDS_HASH_MISMATCH },
      { ok: false, status: 400, code: ErrorCode.PAWLEGENDS_SIM_VERSION },
    ]);
    expect(await h.saver.submit("m1", replay())).toBe("rejected");
    expect(h.queue()).toEqual([]);
    expect(await h.saver.submit("m2", replay({ seed: 2 }))).toBe("rejected");
    expect(h.onStalePurged).toHaveBeenCalledWith(1);
    const last = h.onStatus.mock.calls[h.onStatus.mock.calls.length - 1];
    expect(last[2].code).toBe(ErrorCode.PAWLEGENDS_SIM_VERSION);
  });

  it("a newer sim purges older queued matches; the queue is capped", async () => {
    const h = setup([], null);
    for (let i = 0; i < PAWLEGENDS_QUEUE_MAX + 3; i++) await h.saver.submit(`m${i}`, replay({ seed: i }));
    expect(h.queue()).toHaveLength(PAWLEGENDS_QUEUE_MAX);
    await h.saver.submit("m99", replay({ simVersion: 2, seed: 99 }));
    expect(h.queue().map((m) => m.replay.simVersion)).toEqual([2]);
    expect(h.onStalePurged).toHaveBeenCalledWith(PAWLEGENDS_QUEUE_MAX);
  });

  it("the same replay is one queue entry whatever its id; old POC ids are re-keyed; a malformed queue reads empty", async () => {
    const h = setup([], null);
    await h.saver.submit("m1", replay());
    await h.saver.submit("m2", replay());
    expect(h.queue().map((m) => m.id)).toEqual(["m2"]);
    h.map.set(
      PAWLEGENDS_QUEUE_KEY,
      JSON.stringify({ v: 1, matches: [{ id: "1-1-9000-00000001", owner: null, replay: replay(), createdAt: 1, attempts: 0, nextAt: 1 }] })
    );
    expect(h.saver.read()[0].id).toBe("000000011");
    h.map.set(PAWLEGENDS_QUEUE_KEY, "{not json");
    expect(h.saver.read()).toEqual([]);
  });
  it("writes the match to the queue before the POST: a page closed mid-POST sends it on the next load", async () => {
    const h = setup([]);
    h.save.mockImplementationOnce(() => new Promise<MatchSaveResult>(() => undefined)); // never answers: the tab closes
    void h.saver.submit("m1", replay());
    await Promise.resolve();
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([
      expect.objectContaining({ id: "m1", owner: "uid-1", attempts: 0, nextAt: 1_000_000 + PAWLEGENDS_INFLIGHT_HOLD_MS }),
    ]);
    // The same page does not post it a second time while its own POST is out.
    h.tick(PAWLEGENDS_INFLIGHT_HOLD_MS);
    await h.saver.drain();
    expect(h.save).toHaveBeenCalledTimes(1);
    h.saver.dispose();
    // Next load: the server had verified it (409 duplicate counts as saved), so the queue empties.
    const next = h.reload([{ ok: false, status: 409, code: ErrorCode.PAWLEGENDS_DUPLICATE }]);
    await next.saver.drain();
    expect(next.save).toHaveBeenCalledWith(expect.objectContaining({ seed: 1 }), expect.any(AbortSignal));
    expect(h.queue()).toEqual([]);
  });

  it("a next load inside the hold window waits for it before sending", async () => {
    const h = setup([]);
    h.save.mockImplementationOnce(() => new Promise<MatchSaveResult>(() => undefined));
    void h.saver.submit("m1", replay());
    await Promise.resolve();
    h.saver.dispose();
    const next = h.reload();
    h.tick(PAWLEGENDS_INFLIGHT_HOLD_MS - 1);
    await next.saver.drain();
    expect(next.save).not.toHaveBeenCalled();
    h.tick(1);
    await next.saver.drain();
    expect(next.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([]);
  });

  it("keep and backoff update the entry written before the POST (one entry, attempts 1)", async () => {
    const h = setup([{ ok: false, status: 428, code: null }]);
    expect(await h.saver.submit("m1", replay())).toBe("queued");
    expect(h.queue()).toEqual([expect.objectContaining({ id: "m1", owner: "uid-1", attempts: 1, nextAt: 1_000_000 })]);
  });

  it("hold keeps a match through the Firebase wait: a device match for the next load, not for this page's prompt", async () => {
    const h = setup([], null);
    h.saver.hold("m1", replay());
    expect(h.queue()).toEqual([expect.objectContaining({ id: "m1", owner: null })]);
    expect(h.saver.unclaimed()).toEqual([]);
    expect(h.saver.decline()).toBe(0);
    // Page closed during the wait: the next load offers it to the claim prompt.
    expect(h.reload().saver.unclaimed().map((m) => m.id)).toEqual(["m1"]);
    // Page stayed: Firebase reports a uid and the submit takes the held entry over, posted once.
    h.setUid("uid-1");
    expect(await h.saver.submit("m1", replay())).toBe("saved");
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.queue()).toEqual([]);
  });

  it("hold leaves a match already queued under that id alone", async () => {
    const h = setup([{ ok: false, status: 503, code: null }]);
    await h.saver.submit("m1", replay());
    const before = h.queue();
    h.saver.hold("m1", replay());
    expect(h.queue()).toEqual(before);
  });

  describe("timeout (launch finding R4)", () => {
    afterEach(() => jest.useRealTimers());

    function stalledSaver(timeoutMs?: number) {
      const signals: (AbortSignal | undefined)[] = [];
      const save = jest.fn((_r: PawlegendsReplay, signal?: AbortSignal) => {
        signals.push(signal);
        return new Promise<MatchSaveResult>(() => undefined);
      });
      const onStatus = jest.fn();
      const scheduled: number[] = [];
      let now = 1_000_000;
      const saver = new PawlegendsSaver({
        save,
        currentUid: () => "uid-1",
        storage: null,
        now: () => now,
        random: () => 0,
        schedule: (_fn, ms) => {
          scheduled.push(ms);
          return () => undefined;
        },
        onStatus,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      return { saver, save, signals, onStatus, scheduled, tick: (ms: number) => (now += ms) };
    }

    it("a stalled POST is aborted after 20 s and reads as offline: queued, backed off", async () => {
      jest.useFakeTimers();
      const h = stalledSaver();
      const pending = h.saver.submit("m1", replay());
      await jest.advanceTimersByTimeAsync(PAWLEGENDS_SAVE_TIMEOUT_MS - 1);
      expect(h.onStatus.mock.calls.map((c) => c[1])).toEqual(["saving"]);
      await jest.advanceTimersByTimeAsync(1);
      expect(await pending).toBe("queued");
      expect(h.signals[0]?.aborted).toBe(true);
      expect(h.onStatus.mock.calls.at(-1)?.[2]).toMatchObject({ outcome: "backoff", httpStatus: 0 });
      expect(h.scheduled).toHaveLength(1);
    });

    it("a stalled drain does not block later drains", async () => {
      jest.useFakeTimers();
      const h = stalledSaver(1_000);
      const first = h.saver.submit("m1", replay());
      await jest.advanceTimersByTimeAsync(1_000);
      await first;
      h.tick(10 * 60_000);
      const drained = h.saver.drain();
      await jest.advanceTimersByTimeAsync(1_000);
      await drained;
      h.tick(10 * 60_000);
      const again = h.saver.drain();
      await jest.advanceTimersByTimeAsync(1_000);
      await again;
      expect(h.save).toHaveBeenCalledTimes(3);
    });

    it("an answer before the timeout clears the timer", async () => {
      jest.useFakeTimers();
      const h = setup([]);
      expect(await h.saver.submit("m1", replay())).toBe("saved");
      expect(jest.getTimerCount()).toBe(0);
    });

    it("take() gives the device matches to the account without sending them", async () => {
      const h = setup([], null);
      await h.saver.submit("m1", replay());
      h.setUid("uid-2");
      expect(h.saver.take("uid-2")).toBe(1);
      expect(h.save).not.toHaveBeenCalled();
      expect(h.saver.unclaimed()).toHaveLength(0);
      await h.saver.drain();
      expect(h.save).toHaveBeenCalledTimes(1);
    });
  });
});
