import {
  ANON_OWNER,
  createFtueStore,
  FTUE_STORE_KEY,
  FTUE_STORE_VERSION,
  parseFtueData,
  PENDING_CLEAR_TTL_MS,
} from "@/components/Phaser/onboarding/ftue-store";

/** Plan G10: the first-run store is versioned and survives blocked storage. */

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
};

describe("ftue store", () => {
  it("round-trips gates, hints, clears, assists and hard deaths through storage", () => {
    const storage = memoryStorage();
    const store = createFtueStore({ storage: () => storage, now: () => 42 });
    store.markGateSeen("CATNIP_CHAOS", "11");
    store.markHintDone("CATNIP_CHAOS", "first-spike");
    store.addLocalClear("CATNIP_CHAOS", "11");
    store.addLocalClear("CATNIP_CHAOS", "11");
    store.setAssist("extraGuards", true);
    expect(store.addHardDeath("CATNIP_CHAOS", "12")).toBe(1);
    expect(store.addHardDeath("CATNIP_CHAOS", "12")).toBe(2);

    const again = createFtueStore({ storage: () => storage });
    expect(again.gateSeen("CATNIP_CHAOS", "11")).toBe(true);
    expect(again.gateSeen("CATNIP_CHAOS", "12")).toBe(false);
    expect(again.hintDone("CATNIP_CHAOS", "first-spike")).toBe(true);
    expect(again.localClears("CATNIP_CHAOS")).toEqual(["11"]);
    expect(again.assists()).toEqual({ slowMo: false, extraGuards: true });
    expect(again.hardDeaths("CATNIP_CHAOS", "12")).toBe(2);
    again.resetHardDeaths("CATNIP_CHAOS", "12");
    expect(again.hardDeaths("CATNIP_CHAOS", "12")).toBe(0);
    expect(JSON.parse(storage.data.get(FTUE_STORE_KEY)!).v).toBe(FTUE_STORE_VERSION);
  });

  it("works from memory when storage throws on every call", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    const store = createFtueStore({ storage: () => blocked });
    expect(store.gateSeen("CATNIP_CHAOS", "11")).toBe(false);
    expect(() => store.markGateSeen("CATNIP_CHAOS", "11")).not.toThrow();
    expect(store.gateSeen("CATNIP_CHAOS", "11")).toBe(true);
    expect(() => store.setAssist("slowMo", true)).not.toThrow();
    expect(store.assists().slowMo).toBe(true);
  });

  it("works when the storage accessor itself throws (private mode)", () => {
    const store = createFtueStore({
      storage: () => {
        throw new Error("no storage");
      },
    });
    expect(() => store.markHintDone("CATNIP_CHAOS", "x")).not.toThrow();
    expect(store.hintDone("CATNIP_CHAOS", "x")).toBe(true);
    expect(() => store.reset()).not.toThrow();
  });

  it("drops a blob from another version or of the wrong shape", () => {
    expect(parseFtueData(JSON.stringify({ v: 0, gates: { a: 1 } }))).toBeNull();
    expect(parseFtueData("{not json")).toBeNull();
    expect(parseFtueData(null)).toBeNull();
    const parsed = parseFtueData(
      JSON.stringify({ v: FTUE_STORE_VERSION, gates: { a: "x", b: 2 }, players: { p: { clears: { M: ["1", 2] } }, q: 3 }, assists: { slowMo: "yes" } }),
    );
    expect(parsed).toMatchObject({ gates: { b: 2 }, players: { p: { clears: { M: ["1"] }, pending: {}, hardDeaths: {} } }, assists: { slowMo: false, extraGuards: false } });
    expect(parsed!.players.q).toBeUndefined();
  });

  it("keeps a v1 blob's gates, hints and assists, and drops its ownerless clears and hard deaths", () => {
    const v1 = JSON.stringify({ v: 1, gates: { "M:1": 5 }, hints: { "M:h": 6 }, clears: { M: ["1"] }, assists: { slowMo: true }, hardDeaths: { "M:2": 3 } });
    const storage = memoryStorage();
    storage.setItem(FTUE_STORE_KEY, v1);
    const store = createFtueStore({ storage: () => storage });
    store.setOwner("p");
    expect(store.gateSeen("M", "1")).toBe(true);
    expect(store.hintDone("M", "h")).toBe(true);
    expect(store.assists().slowMo).toBe(true);
    expect(store.localClears("M")).toEqual([]);
    expect(store.hardDeaths("M", "2")).toBe(0);
  });

  it("keeps clears and hard deaths per player (a shared device, a guest who becomes a new account)", () => {
    const storage = memoryStorage();
    const store = createFtueStore({ storage: () => storage });
    expect(store.owner()).toBe(ANON_OWNER);
    store.setOwner("alice");
    store.addLocalClear("CATNIP_CHAOS", "11");
    store.addHardDeath("CATNIP_CHAOS", "12");
    store.setOwner("bob");
    expect(store.localClears("CATNIP_CHAOS")).toEqual([]);
    expect(store.pendingClears("CATNIP_CHAOS")).toEqual([]);
    expect(store.hardDeaths("CATNIP_CHAOS", "12")).toBe(0);
    store.setOwner(null);
    expect(store.owner()).toBe(ANON_OWNER);
    store.setOwner("alice");
    expect(store.localClears("CATNIP_CHAOS")).toEqual(["11"]);
    store.forgetOwner("alice");
    expect(store.localClears("CATNIP_CHAOS")).toEqual([]);
  });

  it("holds a clear as pending until its save answers or the TTL passes", () => {
    let t = 1000;
    const store = createFtueStore({ storage: () => memoryStorage(), now: () => t });
    store.setOwner("p");
    store.addLocalClear("CATNIP_CHAOS", "12");
    store.addLocalClear("PIXEL_RESCUE", "1");
    expect(store.pendingClears("CATNIP_CHAOS")).toEqual(["12"]);
    store.settleClear("CATNIP_CHAOS", "12");
    expect(store.pendingClears("CATNIP_CHAOS")).toEqual([]);
    expect(store.localClears("CATNIP_CHAOS")).toEqual(["12"]);
    expect(store.pendingClears("PIXEL_RESCUE")).toEqual(["1"]);
    t += PENDING_CLEAR_TTL_MS + 1;
    expect(store.pendingClears("PIXEL_RESCUE")).toEqual([]);
  });

  it("notifies subscribers and forgets everything on reset", () => {
    const storage = memoryStorage();
    const store = createFtueStore({ storage: () => storage });
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.markGateSeen("M", "1");
    expect(listener).toHaveBeenCalledTimes(1);
    store.reset();
    expect(store.gateSeen("M", "1")).toBe(false);
    expect(storage.data.has(FTUE_STORE_KEY)).toBe(false);
    unsubscribe();
    store.markGateSeen("M", "1");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
