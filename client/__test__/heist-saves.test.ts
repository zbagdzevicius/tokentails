/**
 * Catnip Heist saves on /heist (plan G2 layer 3, F5.7 `optional`): status mapping, the owner-tagged
 * device queue, the claim confirmation, back-off and stale sim versions.
 */
import type { MatchSaveResult } from "@/api/user-api";
import {
  analyticsStatus,
  backoffMs,
  BACKOFF_MAX_MS,
  bridgeStatus,
  classifySave,
  HEIST_QUEUE_KEY,
  HEIST_QUEUE_MAX,
  HeistSaver,
  parseQueue,
  type QueueStorage,
  type SaveDetail,
} from "@/components/heist/heistSaves";
import type { HeistRunLog } from "@/shared-contracts/heist-bridge";

const log = (over: Partial<HeistRunLog> = {}): HeistRunLog => ({
  levelId: "heist-01",
  simVersion: 3,
  seed: 1,
  catIds: ["bob", "oreo"],
  ticks: 4,
  runs: [[1, 0, 0, 4]],
  ...over,
});

const ok: MatchSaveResult = { ok: true, status: 201, code: null };
const res = (status: number, code: string | null = null, retryAfter?: number): MatchSaveResult => ({
  ok: false,
  status,
  code: code as MatchSaveResult["code"],
  retryAfter,
});

function memory(): QueueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function setup(answers: MatchSaveResult[] = [], uid: string | null = null, anonymous = false) {
  const storage = memory();
  let now = 1_000_000;
  let current = uid;
  let anon = anonymous;
  const sent: HeistRunLog[] = [];
  const statuses: Array<[string, string]> = [];
  const details: SaveDetail[] = [];
  const stale: number[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const queue = [...answers];
  const saver = new HeistSaver({
    storage,
    save: async (body) => {
      sent.push(body);
      return queue.shift() ?? ok;
    },
    currentUid: () => current,
    currentIsAnonymous: () => anon,
    now: () => now,
    random: () => 0,
    schedule: (fn, ms) => {
      const entry = { fn, ms };
      timers.push(entry);
      return () => timers.splice(timers.indexOf(entry), 1);
    },
    onStatus: (id, status, detail) => {
      statuses.push([id, status]);
      details.push(detail);
    },
    onStalePurged: (count) => stale.push(count),
  });
  return {
    saver,
    storage,
    sent,
    statuses,
    details,
    stale,
    timers,
    answer: (...more: MatchSaveResult[]) => queue.push(...more),
    signIn: (next: string | null, nextAnonymous = false) => {
      current = next;
      anon = nextAnonymous;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("classifySave (status mapping)", () => {
  it.each([
    [ok, "saved"],
    [res(409, "HEIST_DUPLICATE"), "saved"],
    [res(400, "HEIST_SIM_VERSION"), "stale"],
    [res(400, "HEIST_REPLAY_INVALID"), "dropped"],
    [res(400, "HEIST_NOT_WON"), "dropped"],
    [res(400), "dropped"],
    [res(413), "dropped"],
    [res(401), "keep"],
    [res(403, "EMAIL_UNVERIFIED"), "keep"],
    [res(428, "GUEST_SESSION_REQUIRED"), "keep"],
    [res(429), "backoff"],
    [res(500), "backoff"],
    [res(503), "backoff"],
    [res(0), "backoff"],
  ] as const)("%o -> %s", (result, outcome) => {
    expect(classifySave(result)).toBe(outcome);
  });

  it("maps outcomes to bridge and analytics statuses", () => {
    expect(bridgeStatus("saved", 201)).toBe("saved");
    expect(bridgeStatus("dropped", 400)).toBe("rejected");
    expect(bridgeStatus("stale", 400)).toBe("rejected");
    expect(bridgeStatus("keep", 401)).toBe("signed-out");
    expect(bridgeStatus("backoff", 0)).toBe("queued");
    expect(analyticsStatus("saved")).toBe("ok");
    expect(analyticsStatus("device")).toBe("guest");
    expect(analyticsStatus("backoff", 0)).toBe("offline");
    expect(analyticsStatus("backoff", 503)).toBe("error");
    expect(analyticsStatus("dropped")).toBe("rejected");
  });

  it("backs off 5 s, 15 s, 45 s ... capped at 10 min, and honours Retry-After", () => {
    expect([0, 1, 2].map((n) => backoffMs(n, () => 0))).toEqual([5_000, 15_000, 45_000]);
    expect(backoffMs(20, () => 0)).toBe(BACKOFF_MAX_MS);
    expect(backoffMs(0, () => 0, 30)).toBe(30_000);
    expect(backoffMs(0, () => 1)).toBe(6_000);
  });
});

describe("HeistSaver", () => {
  it("with a Firebase user, saves a won run at once and writes no queue entry", async () => {
    const t = setup([ok], "guest-uid");
    await expect(t.saver.submit("run-1", true, log())).resolves.toMatchObject({ status: "saved", queued: false });
    expect(t.sent).toEqual([log()]);
    expect(t.storage.map.has(HEIST_QUEUE_KEY)).toBe(false);
    expect(t.statuses).toEqual([["run-1", "saved"]]);
  });

  it("never posts a lost run (the server only stores wins)", async () => {
    const t = setup([], "uid-a");
    await expect(t.saver.submit("run-1", false, log())).resolves.toBeNull();
    expect(t.sent).toHaveLength(0);
  });

  it("with no Firebase user, queues a device run and sends nothing", async () => {
    const t = setup();
    await expect(t.saver.submit("run-1", true, log())).resolves.toMatchObject({ status: "queued", outcome: "device" });
    expect(t.sent).toHaveLength(0);
    expect(t.saver.unclaimed().map((run) => run.owner)).toEqual([null]);
  });

  it("drains device runs only after the player confirms the claim", async () => {
    const t = setup();
    await t.saver.submit("run-1", true, log());
    await t.saver.submit("run-2", true, log({ levelId: "heist-02" }));
    t.signIn("uid-a");
    await t.saver.drain();
    expect(t.sent).toHaveLength(0); // not confirmed: nothing leaves the device
    await expect(t.saver.claim("uid-a")).resolves.toBe(2);
    expect(t.sent.map((body) => body.levelId)).toEqual(["heist-01", "heist-02"]);
    expect(t.saver.read()).toEqual([]);
  });

  it('"Not mine" deletes the device runs without sending them', async () => {
    const t = setup();
    await t.saver.submit("run-1", true, log());
    t.signIn("uid-a");
    expect(t.saver.decline()).toBe(1);
    await t.saver.drain();
    expect(t.sent).toHaveLength(0);
    expect(t.saver.read()).toEqual([]);
  });

  it("never drains uid A's runs for uid B", async () => {
    const t = setup([res(0)], "uid-a");
    await t.saver.submit("run-a", true, log()); // offline: kept under uid-a
    expect(t.saver.ownedBy("uid-a")).toHaveLength(1);
    t.signIn("uid-b");
    t.advance(60_000);
    await t.saver.drain();
    await t.saver.claim("uid-b"); // claims device runs only, never another uid's
    expect(t.sent).toHaveLength(1); // only the first, failed attempt as uid-a
    expect(t.saver.ownedBy("uid-a")).toHaveLength(1);
    t.signIn("uid-a");
    await t.saver.drain();
    expect(t.sent).toHaveLength(2);
    expect(t.saver.read()).toEqual([]);
  });

  it("hands a failed anonymous guest's runs back to the claim prompt when another uid signs in", async () => {
    const t = setup([res(0), res(503)], "anon-a", true);
    await t.saver.submit("run-1", true, log()); // offline: queued under the anonymous uid
    await t.saver.submit("run-2", true, log({ ticks: 5, runs: [[0, 1, 0, 5]] }));
    expect(t.saver.read().map((run) => [run.owner, run.anon])).toEqual([
      ["anon-a", true],
      ["anon-a", true],
    ]);
    // The guest signs in to an existing account: a new uid. Nothing is sent for it unasked.
    t.signIn("account-b");
    t.advance(60_000);
    await t.saver.drain();
    expect(t.sent).toHaveLength(2); // only the two failed first attempts
    expect(t.saver.unclaimed().map((run) => run.id)).toEqual(["run-1", "run-2"]);
    expect(t.saver.read().every((run) => run.anon === undefined)).toBe(true);
    // The claim prompt's "Add them" sends them for the account.
    await expect(t.saver.claim("account-b")).resolves.toBe(2);
    expect(t.sent).toHaveLength(4);
    expect(t.saver.read()).toEqual([]);
  });

  it("keeps an anonymous guest's runs while that guest is still signed in, and before auth reports", () => {
    const t = setup([res(0)], "anon-a", true);
    return t.saver.submit("run-1", true, log()).then(() => {
      expect(t.saver.releaseGuestRuns()).toBe(0);
      t.signIn(null);
      expect(t.saver.releaseGuestRuns()).toBe(0);
      expect(t.saver.ownedBy("anon-a")).toHaveLength(1);
    });
  });

  it("never releases a registered account's runs to another uid", async () => {
    const t = setup([res(0)], "account-a", false);
    await t.saver.submit("run-1", true, log());
    t.signIn("account-b");
    expect(t.saver.releaseGuestRuns()).toBe(0);
    expect(t.saver.unclaimed()).toHaveLength(0);
    expect(t.saver.ownedBy("account-a")).toHaveLength(1);
  });

  it("reports whose row a 409 is: the caller's is saved, another account's is rejected", async () => {
    const t = setup(
      [
        { ...res(409, "HEIST_DUPLICATE"), mine: true },
        { ...res(409, "HEIST_DUPLICATE"), mine: false },
        res(409, "HEIST_DUPLICATE"),
      ],
      "uid-a"
    );
    await expect(t.saver.submit("mine", true, log())).resolves.toMatchObject({ status: "saved", queued: false });
    await expect(t.saver.submit("other", true, log({ ticks: 5, runs: [[0, 1, 0, 5]] }))).resolves.toMatchObject({ status: "rejected", queued: false });
    await expect(t.saver.submit("unknown", true, log({ ticks: 6, runs: [[0, 1, 0, 6]] }))).resolves.toMatchObject({ status: "saved" });
    expect(t.details.map((detail) => detail.duplicate)).toEqual(["mine", "other", "unknown"]);
    expect(t.saver.read()).toEqual([]);
  });

  it("keeps a 401 for later, drops a 400, and treats 409 as done", async () => {
    const t = setup([res(401), res(400, "HEIST_REPLAY_INVALID"), res(409, "HEIST_DUPLICATE")], "uid-a");
    await expect(t.saver.submit("run-401", true, log())).resolves.toMatchObject({ status: "signed-out", queued: true });
    await expect(t.saver.submit("run-400", true, log({ ticks: 5, runs: [[0, 1, 0, 5]] }))).resolves.toMatchObject({ status: "rejected", queued: false });
    await expect(t.saver.submit("run-409", true, log({ ticks: 6, runs: [[0, 1, 0, 6]] }))).resolves.toMatchObject({ status: "saved", queued: false });
    expect(t.saver.read().map((run) => run.id)).toEqual(["run-401"]);
  });

  it("backs off on 429 and network failures, stops the drain, and retries when due", async () => {
    const t = setup([res(429, null, 20), res(0)], "uid-a");
    await t.saver.submit("run-1", true, log());
    const [entry] = t.saver.read();
    expect(entry.nextAt - 1_000_000).toBe(20_000);
    expect(t.timers.at(-1)?.ms).toBe(20_000);
    await t.saver.drain(); // not due yet
    expect(t.sent).toHaveLength(1);
    t.advance(20_000);
    await t.saver.drain(); // network failure: kept, attempt 2
    expect(t.sent).toHaveLength(2);
    expect(t.saver.read()[0].attempts).toBe(2);
    t.advance(60_000);
    await t.saver.drain(); // ok
    expect(t.sent).toHaveLength(3);
    expect(t.saver.read()).toEqual([]);
  });

  it("purges every queued run of a stale sim version with one visible message", async () => {
    const t = setup([res(0), res(0), res(400, "HEIST_SIM_VERSION")], "uid-a");
    await t.saver.submit("run-1", true, log());
    await t.saver.submit("run-2", true, log({ ticks: 5, runs: [[0, 1, 0, 5]] }));
    t.advance(BACKOFF_MAX_MS);
    await t.saver.drain();
    expect(t.saver.read()).toEqual([]);
    expect(t.stale).toEqual([2]);
  });

  it("purges older sim versions when the Heist reports a newer one", async () => {
    const t = setup();
    await t.saver.submit("old", true, log({ simVersion: 2 }));
    await t.saver.submit("new", true, log({ simVersion: 3 }));
    expect(t.saver.read().map((run) => run.id)).toEqual(["new"]);
    expect(t.stale).toEqual([1]);
  });

  it("keeps at most HEIST_QUEUE_MAX runs (the newest) and survives a corrupt store", async () => {
    const t = setup();
    for (let i = 0; i < HEIST_QUEUE_MAX + 3; i++) await t.saver.submit(`run-${i}`, true, log());
    const ids = t.saver.read().map((run) => run.id);
    expect(ids).toHaveLength(HEIST_QUEUE_MAX);
    expect(ids[0]).toBe("run-3");
    t.storage.map.set(HEIST_QUEUE_KEY, "{not json");
    expect(t.saver.read()).toEqual([]);
    expect(parseQueue(JSON.stringify({ v: 1, runs: [{ id: "x", owner: null, log: { bad: true } }] }))).toEqual([]);
  });

  it("posts only the replay, never lives or rewards (decision #17)", async () => {
    const t = setup([ok], "uid-a");
    await t.saver.submit("run-1", true, log());
    expect(Object.keys(t.sent[0]).sort()).toEqual(["catIds", "levelId", "runs", "seed", "simVersion", "ticks"]);
  });
});
