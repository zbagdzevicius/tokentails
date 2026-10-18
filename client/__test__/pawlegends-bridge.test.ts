/**
 * The /pawlegends host side of the bridge, v1 (POC.md §11.1): hello until ready, sticky state re-sent on every
 * ready, source and origin checks, unknown types ignored, the exact target origin (never '*'), no token or
 * accesstoken in any post, replay shape checks, and `app.store` never true in an app build.
 */
import {
  createPawlegendsBridge,
  hostMessage,
  parsePawlegendsMessage,
  PAWLEGENDS_HELLO_RETRY_MS,
  PAWLEGENDS_HELLO_SLOW_MS,
  PAWLEGENDS_HELLO_TIMEOUT_MS,
  PAWLEGENDS_NS,
  replayOf,
  shareUrlOf,
  type PawlegendsBridgeHandlers,
  type PawlegendsBridgeTimers,
} from "@/components/pawlegends/bridge";

const ORIGIN = "https://tokentails.com";
const CAT_A = "65a1b2c3d4e5f6a7b8c9d0e1";
const CAT_B = "65a1b2c3d4e5f6a7b8c9d0e2";
const env = (type: string, extra: Record<string, unknown> = {}) => ({ ns: PAWLEGENDS_NS, v: 1, type, ...extra });

const REPLAY = Object.freeze({
  v: 1,
  simVersion: 1,
  seed: 123456,
  difficulty: "easy",
  hero: "clem",
  trick: "pounce",
  ticks: 9000,
  inputs: "AQIDBA==",
  outcome: "won",
  finalHash: "0a1b2c3d",
});

function harness(handlers: PawlegendsBridgeHandlers = {}, origin: string | null = ORIGIN) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const win = {
    addEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.add(fn),
    removeEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.delete(fn),
  };
  const posted: Array<{ message: Record<string, unknown>; origin: string }> = [];
  const frame = {
    postMessage: (message: unknown, targetOrigin: string) =>
      void posted.push({ message: message as Record<string, unknown>, origin: targetOrigin }),
  };
  let now = 0;
  let pending: { fn: () => void; at: number; id: number } | null = null;
  let ids = 0;
  const timers: PawlegendsBridgeTimers = {
    setTimeout: (fn, ms) => {
      pending = { fn, at: now + ms, id: ++ids };
      return pending.id;
    },
    clearTimeout: (id) => {
      if (pending?.id === id) pending = null;
    },
    now: () => now,
  };
  const advance = (ms: number) => {
    const end = now + ms;
    while (pending && pending.at <= end) {
      const due = pending;
      pending = null;
      now = due.at;
      due.fn();
    }
    now = end;
  };
  const fromGame = (data: unknown, source: unknown = frame, from = ORIGIN) =>
    listeners.forEach((fn) => fn({ data, source, origin: from } as MessageEvent));
  const bridge = createPawlegendsBridge({ win, target: () => frame, origin, handlers, timers });
  const types = () => posted.map((entry) => entry.message.type);
  return { bridge, posted, types, advance, fromGame, listeners, hasPending: () => pending !== null };
}

describe("pawlegends bridge handshake", () => {
  it("says hello until ready, then re-sends app, session, audio, roster, entitlements and a pending pause", () => {
    const onReady = jest.fn();
    const h = harness({ onReady });
    h.bridge.setApp(false, true, false);
    h.bridge.setSession(true, null);
    h.bridge.setAudio({ muted: false });
    h.bridge.setRoster([{ id: "c1", name: "Mochi", type: "FIRE", tier: "RARE", isStarter: true }]);
    h.bridge.setEntitlements("abc.defghijklmnopqrstuv");
    h.bridge.pause();
    h.advance(PAWLEGENDS_HELLO_RETRY_MS * 2);
    expect(h.types()).toEqual(["hello", "pause", "hello", "hello"]);
    h.fromGame(env("ready", { version: "0.1.0" }));
    expect(onReady).toHaveBeenCalledWith("0.1.0");
    expect(h.types().slice(-6)).toEqual(["app", "session", "audio", "roster", "entitlements", "pause"]);
    expect(h.hasPending()).toBe(false);
    // A second ready (the game reloaded itself) re-sends the same state but is not a new onReady.
    h.fromGame(env("ready", { version: "0.1.0" }));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(h.types().slice(-6)).toEqual(["app", "session", "audio", "roster", "entitlements", "pause"]);
  });

  it("reports slow and timeout but never stops saying hello; a late ready still connects", () => {
    const onSlow = jest.fn();
    const onTimeout = jest.fn();
    const onReady = jest.fn();
    const h = harness({ onSlow, onTimeout, onReady });
    h.advance(PAWLEGENDS_HELLO_SLOW_MS);
    expect(onSlow).toHaveBeenCalledTimes(1);
    h.advance(PAWLEGENDS_HELLO_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(h.hasPending()).toBe(true);
    h.fromGame(env("ready"));
    expect(onReady).toHaveBeenCalled();
  });

  it("posts only to the exact game origin, never '*', and stays silent without an origin", () => {
    const h = harness();
    h.fromGame(env("ready"));
    h.bridge.setSession(true, null);
    expect(h.posted.every((p) => p.origin === ORIGIN)).toBe(true);
    const silent = harness({}, null);
    silent.advance(2000);
    expect(silent.posted).toHaveLength(0);
  });

  it("ignores messages from another window, another origin, another namespace or version, and unknown types", () => {
    const onMatchResult = jest.fn();
    const onPurchaseIntent = jest.fn();
    const h = harness({ onMatchResult, onPurchaseIntent });
    h.fromGame(env("purchase-intent", { sku: "pl_founder" }), {});
    h.fromGame(env("purchase-intent", { sku: "pl_founder" }), undefined, "https://evil.example");
    h.fromGame({ ns: "tt-swordcat", v: 1, type: "purchase-intent", sku: "pl_founder" });
    h.fromGame({ ns: PAWLEGENDS_NS, v: 2, type: "purchase-intent", sku: "pl_founder" });
    h.fromGame(env("open-wallet"));
    h.fromGame(env("purchase-intent", { sku: "pl_free_money" }));
    expect(onPurchaseIntent).not.toHaveBeenCalled();
    h.fromGame(env("purchase-intent", { sku: "pl_founder" }));
    expect(onPurchaseIntent).toHaveBeenCalledWith("pl_founder");
    h.fromGame(env("match-result", { replay: { ...REPLAY, inputs: "not base64!" } }));
    expect(onMatchResult).not.toHaveBeenCalled();
    h.fromGame(env("match-result", { replay: REPLAY, summary: { takedowns: 4, extra: "<script>" } }));
    expect(onMatchResult).toHaveBeenCalledWith(
      REPLAY,
      { won: true, ticks: 9000, hero: "clem", difficulty: "easy", takedowns: 4 },
      // An older build sends no matchId: one is derived from the replay.
      "0a1b2c3d1e240"
    );
  });

  it("purchase-result goes out only after ready, and nothing carries a token or accesstoken field", () => {
    const h = harness();
    h.bridge.purchaseResult(CAT_A, true);
    expect(h.types()).not.toContain("purchase-result");
    h.fromGame(env("ready"));
    h.bridge.purchaseResult(CAT_A, true);
    h.bridge.setEntitlements("abc.defghijklmnopqrstuv");
    expect(h.types()).toContain("purchase-result");
    for (const { message } of h.posted) {
      expect(Object.keys(message)).not.toContain("accesstoken");
      expect(JSON.stringify(message)).not.toMatch(/accesstoken|fb[A-Za-z0-9]{20}/);
    }
  });

  it("dispose stops hello and removes the listener", () => {
    const h = harness();
    h.bridge.dispose();
    expect(h.listeners.size).toBe(0);
    const count = h.posted.length;
    h.advance(5000);
    expect(h.posted.length).toBe(count);
  });
});

describe("pawlegends integration messages", () => {
  const featured = [
    { catalogId: CAT_A, name: "Pumpkin", type: "GRASS" },
    { catalogId: CAT_B, name: "Nova", type: "STELLAR" },
  ];

  it("open-cat counts only for a featured or roster cat, and never in an app build", () => {
    const onOpenCat = jest.fn();
    const h = harness({ onOpenCat });
    h.fromGame(env("ready"));
    h.fromGame(env("open-cat", { catalogId: CAT_A }));
    expect(onOpenCat).not.toHaveBeenCalled();
    h.bridge.setFeatured(featured);
    h.fromGame(env("open-cat", { catalogId: CAT_A }));
    expect(onOpenCat).toHaveBeenCalledWith(CAT_A);
    const OWNED = "65a1b2c3d4e5f6a7b8c9d0ff";
    h.bridge.setRoster([{ id: "mine1", name: "Mochi", type: "FIRE", tier: "COMMON", isStarter: false, catalogId: OWNED }]);
    h.fromGame(env("open-cat", { catalogId: OWNED }));
    expect(onOpenCat).toHaveBeenCalledWith(OWNED);
    h.bridge.setApp(true, false, false);
    onOpenCat.mockClear();
    h.fromGame(env("open-cat", { catalogId: CAT_A }));
    h.fromGame(env("open-cat", { catalogId: OWNED }));
    expect(onOpenCat).not.toHaveBeenCalled();
    // The app build also clears what was featured and offered.
    expect(h.posted.filter((p) => p.message.type === "featured").pop()?.message).toMatchObject({ cats: [] });
  });

  it("an offer must name a featured cat, is withdrawn when that cat leaves the list, and offer-seen must match it", () => {
    const onOfferSeen = jest.fn();
    const h = harness({ onOfferSeen });
    h.fromGame(env("ready"));
    expect(h.bridge.setOffer({ kind: "meet", catalogId: CAT_A })).toBe(false);
    h.bridge.setFeatured(featured);
    expect(h.bridge.setOffer({ kind: "meet", catalogId: CAT_A })).toBe(true);
    expect(h.types().slice(-2)).toEqual(["featured", "offer"]);
    h.fromGame(env("offer-seen", { kind: "meet", catalogId: CAT_B }));
    expect(onOfferSeen).not.toHaveBeenCalled();
    h.fromGame(env("offer-seen", { kind: "meet", catalogId: CAT_A }));
    expect(onOfferSeen).toHaveBeenCalledWith(CAT_A);
    h.bridge.setFeatured([featured[1]]);
    expect(h.posted[h.posted.length - 1].message).toMatchObject({ type: "offer", offer: null });
    // A reload re-sends featured before the offer.
    h.fromGame(env("ready"));
    const order = h.types();
    expect(order.lastIndexOf("featured")).toBeLessThan(order.lastIndexOf("offer"));
  });

  it("save-result waits for ready (a reload mid-save) and carries only clean fields", () => {
    const h = harness();
    h.bridge.saveResult({ matchId: "m1", status: "saved", catnipPaid: 20, catnipTotal: 140, fastestWin: 8000 });
    h.bridge.saveResult({ matchId: "BAD ID", status: "saved", catnipPaid: 0, catnipTotal: null, fastestWin: null });
    expect(h.types()).not.toContain("save-result");
    h.fromGame(env("ready"));
    const saves = h.posted.filter((p) => p.message.type === "save-result").map((p) => p.message);
    expect(saves).toEqual([
      { ns: PAWLEGENDS_NS, v: 1, type: "save-result", matchId: "m1", status: "saved", catnipPaid: 20, catnipTotal: 140, fastestWin: 8000 },
    ]);
  });

  it("the deprecated purchase-intent gets the legacy refusal at once", () => {
    const onPurchaseIntent = jest.fn();
    const h = harness({ onPurchaseIntent });
    h.fromGame(env("ready"));
    h.fromGame(env("purchase-intent", { sku: "pl_founder" }));
    expect(h.posted[h.posted.length - 1].message).toEqual({
      ns: PAWLEGENDS_NS,
      v: 1,
      type: "purchase-result",
      sku: "pl_founder",
      ok: false,
    });
    expect(onPurchaseIntent).toHaveBeenCalledWith("pl_founder");
  });

  it("request-sign-in and notify reach the host with their reason and place", () => {
    const onRequestSignIn = jest.fn();
    const onNotify = jest.fn();
    const h = harness({ onRequestSignIn, onNotify });
    h.fromGame(env("request-sign-in", { reason: "save-progress" }));
    h.fromGame(env("request-sign-in", { reason: "purchase" }));
    h.fromGame(env("notify", { where: "results" }));
    expect(onRequestSignIn.mock.calls).toEqual([["save-progress"]]);
    expect(onNotify).toHaveBeenCalledWith("results");
  });
});

describe("pawlegends host messages", () => {
  it("copies fields by name and never claims a store in an app build", () => {
    expect(hostMessage("app", { isApp: true, store: true, notify: true })).toEqual({
      ns: PAWLEGENDS_NS,
      v: 1,
      type: "app",
      isApp: true,
      store: false,
      notify: true,
    });
    expect(hostMessage("app", { isApp: false, store: true })).toMatchObject({ store: true });
    expect(hostMessage("entitlements", { token: "not a token" })).toMatchObject({ token: null });
    const roster = hostMessage("roster", {
      cats: [{ id: "c1", name: "Mochi", type: "FIRE", tier: "RARE", isStarter: true, owner: "uid-1" } as never],
    }) as unknown as { cats: Record<string, unknown>[] };
    expect(Object.keys(roster.cats[0]).sort()).toEqual(["id", "isStarter", "name", "tier", "type"]);
  });

  it("replayOf enforces the backend DTO bounds", () => {
    expect(replayOf(REPLAY)).toEqual(REPLAY);
    expect(replayOf({ ...REPLAY, difficulty: "hard" })).toBeNull();
    expect(replayOf({ ...REPLAY, ticks: 19801 })).toBeNull();
    expect(replayOf({ ...REPLAY, inputs: "A".repeat(40001) })).toBeNull();
    expect(replayOf({ ...REPLAY, finalHash: "XYZ" })).toBeNull();
    expect(replayOf({ ...REPLAY, outcome: "died" })).toBeNull();
    expect(parsePawlegendsMessage(env("paused", { paused: "yes" }))).toBeNull();
  });

  it("shareUrlOf keeps same-origin /pawlegends links only", () => {
    expect(shareUrlOf("/pawlegends?dare=abc", ORIGIN)).toBe(`${ORIGIN}/pawlegends?dare=abc`);
    expect(shareUrlOf("https://evil.example/pawlegends", ORIGIN)).toBeNull();
    expect(shareUrlOf("/game", ORIGIN)).toBeNull();
    expect(shareUrlOf("javascript:alert(1)", ORIGIN)).toBeNull();
  });
});
