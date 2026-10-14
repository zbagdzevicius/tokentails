/**
 * The /swordcat host side of the bridge, v1 (Swordcat plan §5.5): hello until ready (no hard stop:
 * a slow phone still connects), slow and timeout notices, reconnect after a frame reload, source and
 * origin checks, unknown types ignored, exact target origin, and never a token in any post.
 */
import {
  createSwordcatBridge,
  hostMessage,
  parseSwordcatMessage,
  SWORDCAT_HELLO_RETRY_MS,
  SWORDCAT_HELLO_SLOW_MS,
  SWORDCAT_HELLO_SLOW_RETRY_MS,
  SWORDCAT_HELLO_TIMEOUT_MS,
  SWORDCAT_NS,
  type SwordcatBridgeHandlers,
  type SwordcatBridgeTimers,
} from "@/components/swordcat/bridge";

const ORIGIN = "https://swordcat.tokentails.com";
const env = (type: string, extra: Record<string, unknown> = {}) => ({ ns: SWORDCAT_NS, v: 1, type, ...extra });

function harness(handlers: SwordcatBridgeHandlers = {}, origin: string | null = ORIGIN) {
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
  // A tiny fake clock: one pending timeout at a time (the bridge chains them).
  let now = 0;
  let pending: { fn: () => void; at: number; id: number } | null = null;
  let ids = 0;
  const delays: number[] = [];
  const timers: SwordcatBridgeTimers = {
    setTimeout: (fn, ms) => {
      delays.push(ms);
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
  const bridge = createSwordcatBridge({ win, target: () => frame, origin, handlers, timers });
  const types = () => posted.map((entry) => entry.message.type);
  return { bridge, posted, types, advance, fromGame, listeners, frame, delays, hasPending: () => pending !== null };
}

describe("swordcat bridge handshake", () => {
  it("says hello every 500 ms until ready, then sends session, audio and a pending pause", () => {
    const onReady = jest.fn();
    const h = harness({ onReady });
    h.bridge.setSignedIn(true);
    h.bridge.setMuted(true);
    h.bridge.pause();
    h.advance(1000);
    expect(h.types()).toEqual(["hello", "pause", "hello", "hello"]);
    h.fromGame(env("ready", { version: "1.2.0" }));
    expect(onReady).toHaveBeenCalledWith("1.2.0");
    expect(h.types().slice(-3)).toEqual(["session", "audio", "pause"]);
    expect(h.posted.at(-3)!.message).toEqual({ ns: SWORDCAT_NS, v: 1, type: "session", signedIn: true });
    expect(h.posted.at(-2)!.message).toEqual({ ns: SWORDCAT_NS, v: 1, type: "audio", muted: true });
    const count = h.posted.length;
    h.advance(2000);
    expect(h.posted).toHaveLength(count);
    expect(h.bridge.ready).toBe(true);
  });

  it("keeps saying hello past 10 s on a slow load (every 2 s), reports slow then timeout once, and still connects", () => {
    const onSlow = jest.fn();
    const onTimeout = jest.fn();
    const onReady = jest.fn();
    const h = harness({ onSlow, onTimeout, onReady });
    const hellos = () => h.types().filter((type) => type === "hello").length;
    h.advance(SWORDCAT_HELLO_SLOW_MS - 1);
    expect(onSlow).not.toHaveBeenCalled();
    expect(hellos()).toBe(SWORDCAT_HELLO_SLOW_MS / SWORDCAT_HELLO_RETRY_MS);
    h.advance(1);
    expect(onSlow).toHaveBeenCalledTimes(1);
    // the old bridge stopped here; a game that finished booting at 25 s never heard a hello again
    const atSlow = hellos();
    h.advance(16_000);
    expect(hellos()).toBe(atSlow + 16_000 / SWORDCAT_HELLO_SLOW_RETRY_MS);
    expect(h.delays.at(-1)).toBe(SWORDCAT_HELLO_SLOW_RETRY_MS);
    h.advance(SWORDCAT_HELLO_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onSlow).toHaveBeenCalledTimes(1);
    expect(h.hasPending()).toBe(true);
    h.fromGame(env("ready"));
    expect(onReady).toHaveBeenCalledWith(null);
    const after = hellos();
    h.advance(10_000);
    expect(hellos()).toBe(after);
    expect(h.hasPending()).toBe(false);
  });

  it("reconnects after the frame reloads: hello again, then session, audio and a pending pause on the new ready", () => {
    const onReady = jest.fn();
    const onSlow = jest.fn();
    const h = harness({ onReady, onSlow });
    h.bridge.setSignedIn(true);
    h.bridge.setMuted(false);
    h.fromGame(env("ready"));
    h.advance(SWORDCAT_HELLO_SLOW_MS * 2);
    expect(onSlow).not.toHaveBeenCalled();
    h.bridge.pause();
    h.bridge.reconnect();
    expect(h.bridge.ready).toBe(false);
    expect(h.types().at(-1)).toBe("hello");
    h.advance(SWORDCAT_HELLO_RETRY_MS);
    expect(h.types().at(-1)).toBe("hello");
    h.fromGame(env("ready"));
    expect(h.types().slice(-3)).toEqual(["session", "audio", "pause"]);
    expect(onReady).toHaveBeenCalledTimes(2);
    // fresh clocks: the slow notice counts from the reconnect
    h.bridge.reconnect();
    h.advance(SWORDCAT_HELLO_SLOW_MS - 1);
    expect(onSlow).not.toHaveBeenCalled();
    h.advance(1);
    expect(onSlow).toHaveBeenCalledTimes(1);
  });

  it("stops saying hello after dispose, and reconnect does nothing then", () => {
    const h = harness();
    h.bridge.dispose();
    const count = h.posted.length;
    h.bridge.reconnect();
    h.advance(30_000);
    expect(h.posted).toHaveLength(count);
    expect(h.hasPending()).toBe(false);
  });

  it("posts only to the game's exact origin, never '*'", () => {
    const h = harness();
    h.bridge.setSignedIn(false);
    h.fromGame(env("ready"));
    h.bridge.pause();
    h.bridge.resume();
    expect(h.posted.length).toBeGreaterThan(3);
    for (const entry of h.posted) expect(entry.origin).toBe(ORIGIN);
  });

  it("stays silent without an origin", () => {
    const h = harness({}, null);
    h.advance(1000);
    h.bridge.pause();
    expect(h.posted).toHaveLength(0);
  });

  it("never posts a token, whatever the session object carries", () => {
    const h = harness();
    h.fromGame(env("ready"));
    // A caller that passes more than a boolean: only signedIn may leave.
    (h.bridge.setSignedIn as (value: unknown) => void)({ accesstoken: "fbSECRET", idToken: "x" });
    h.bridge.setSignedIn(true);
    const sent = JSON.stringify(h.posted.map((entry) => entry.message));
    expect(sent).not.toMatch(/accesstoken|idToken|token|fbSECRET/i);
    for (const { message } of h.posted) {
      expect(Object.keys(message).sort()).toEqual(
        expect.arrayContaining(["ns", "type", "v"])
      );
      expect(Object.keys(message).every((key) => ["ns", "v", "type", "signedIn", "muted"].includes(key))).toBe(true);
    }
    expect(hostMessage("session", { signedIn: true, accesstoken: "fb1" } as unknown as { signedIn: boolean })).toEqual({
      ns: SWORDCAT_NS,
      v: 1,
      type: "session",
      signedIn: true,
    });
  });
});

describe("swordcat bridge: incoming messages", () => {
  it("ignores messages from another origin or another window", () => {
    const onReady = jest.fn();
    const onLevelComplete = jest.fn();
    const h = harness({ onReady, onLevelComplete });
    h.fromGame(env("ready"), h.frame, "https://evil.example");
    h.fromGame(env("ready"), {}, ORIGIN);
    h.fromGame(env("ready"), null, ORIGIN);
    h.fromGame(env("level-complete", { levelId: "ch1" }), h.frame, "https://tokentails.com");
    expect(onReady).not.toHaveBeenCalled();
    expect(onLevelComplete).not.toHaveBeenCalled();
    expect(h.bridge.ready).toBe(false);
  });

  it("ignores unknown types, other namespaces and versions", () => {
    const handlers = { onReady: jest.fn(), onLevelComplete: jest.fn(), onKittenRescued: jest.fn(), onPaused: jest.fn() };
    const h = harness(handlers);
    h.fromGame(env("save-score", { score: 1e9 }));
    h.fromGame({ ns: "tt-heist", v: 1, type: "ready" });
    h.fromGame({ ns: SWORDCAT_NS, v: 2, type: "ready" });
    h.fromGame("ready");
    h.fromGame(null);
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
  });

  it("passes level-complete, kitten-rescued and paused to their handlers, cleaned", () => {
    const handlers = { onLevelComplete: jest.fn(), onKittenRescued: jest.fn(), onPaused: jest.fn() };
    const h = harness(handlers);
    h.fromGame(env("level-complete", { levelId: "ch1-meadow", time: 93.5, kittens: 3, catnip: 120, lives: 7, rank: "S", extra: "x" }));
    expect(handlers.onLevelComplete).toHaveBeenCalledWith({
      type: "level-complete",
      levelId: "ch1-meadow",
      time: 93.5,
      kittens: 3,
      catnip: 120,
      lives: 7,
      rank: "S",
    });
    h.fromGame(env("kitten-rescued", { kittenId: "pip" }));
    expect(handlers.onKittenRescued).toHaveBeenCalledWith({ type: "kitten-rescued", kittenId: "pip" });
    h.fromGame(env("paused", { paused: true }));
    expect(handlers.onPaused).toHaveBeenCalledWith(true);
  });

  it("stops listening after dispose", () => {
    const h = harness();
    h.bridge.dispose();
    expect(h.listeners.size).toBe(0);
  });
});

describe("parseSwordcatMessage", () => {
  it("rejects malformed payloads", () => {
    expect(parseSwordcatMessage(env("level-complete"))).toBeNull();
    expect(parseSwordcatMessage(env("level-complete", { levelId: "" }))).toBeNull();
    expect(parseSwordcatMessage(env("kitten-rescued", { kittenId: { id: 1 } }))).toBeNull();
    expect(parseSwordcatMessage(env("paused", { paused: "yes" }))).toBeNull();
    expect(parseSwordcatMessage(env("level-complete", { levelId: 3, time: Infinity, kittens: "3" }))).toEqual({
      type: "level-complete",
      levelId: "3",
      time: null,
      kittens: null,
      catnip: null,
      lives: null,
      rank: null,
    });
  });
});
