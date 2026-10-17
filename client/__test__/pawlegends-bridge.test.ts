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
    h.bridge.setApp(false, true);
    h.bridge.setSignedIn(true);
    h.bridge.setMuted(false);
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
    h.bridge.setSignedIn(true);
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
    expect(onMatchResult).toHaveBeenCalledWith(REPLAY, { won: true, ticks: 9000, hero: "clem", difficulty: "easy", takedowns: 4 });
  });

  it("purchase-result goes out only after ready, and nothing carries a token or accesstoken field", () => {
    const h = harness();
    h.bridge.purchaseResult("pl_starter", true);
    expect(h.types()).not.toContain("purchase-result");
    h.fromGame(env("ready"));
    h.bridge.purchaseResult("pl_starter", true);
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

describe("pawlegends host messages", () => {
  it("copies fields by name and never claims a store in an app build", () => {
    expect(hostMessage("app", { isApp: true, store: true })).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "app", isApp: true, store: false });
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
