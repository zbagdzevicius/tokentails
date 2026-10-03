/**
 * The /heist host side of the bridge (plan G2 layer 1): the hello retry, origin and source
 * hygiene, and what is sent after `ready`.
 */
import { createHostBridge, type HostBridgeTimers } from "@/components/heist/hostBridge";
import {
  HEIST_BRIDGE_CHANNEL,
  HEIST_BRIDGE_VERSION,
  HEIST_HELLO_RETRY_MS,
  HEIST_HELLO_TIMEOUT_MS,
  isHostToHeistMessage,
} from "@/shared-contracts/heist-bridge";

const ORIGIN = "https://tokentails.com";
const env = (type: string, extra: Record<string, unknown> = {}) => ({
  channel: HEIST_BRIDGE_CHANNEL,
  v: HEIST_BRIDGE_VERSION,
  type,
  ...extra,
});
const LOG = { levelId: "heist-01", simVersion: 3, seed: 1, catIds: ["bob", "oreo"], ticks: 2, runs: [[0, 0, 0, 2]] };
const SESSION = { signedIn: true, progress: { levels: {} }, insets: { top: 47, right: 0, bottom: 34, left: 0 } };

function harness() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const win = {
    addEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.add(fn),
    removeEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.delete(fn),
  };
  const posted: Array<{ type: string; origin: string; message: unknown }> = [];
  const frame = {
    postMessage: (message: unknown, origin: string) =>
      void posted.push({ type: (message as { type: string }).type, origin, message }),
  };
  let now = 0;
  let tick: (() => void) | null = null;
  const timers: HostBridgeTimers = {
    setInterval: (fn, ms) => {
      expect(ms).toBe(HEIST_HELLO_RETRY_MS);
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    now: () => now,
  };
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += HEIST_HELLO_RETRY_MS) {
      now += HEIST_HELLO_RETRY_MS;
      tick?.();
    }
  };
  const fromHeist = (data: unknown, source: unknown = frame, origin = ORIGIN) =>
    listeners.forEach((fn) => fn({ data, source, origin } as MessageEvent));
  return { win, frame, posted, advance, fromHeist, listeners, timers };
}

describe("host bridge handshake", () => {
  it("retries hello every 500 ms, stops on ready, and then sends the session and a pending pause", () => {
    const h = harness();
    const onReady = jest.fn();
    const bridge = createHostBridge({ win: h.win, target: () => h.frame, origin: ORIGIN, handlers: { onReady }, timers: h.timers });
    bridge.setSession(SESSION);
    bridge.pause(); // a sheet opened before the Heist was ready
    expect(h.posted.map((p) => p.type)).toEqual(["hello", "pause"]); // no session before ready
    h.advance(2_000);
    const hellos = h.posted.filter((p) => p.type === "hello").length;
    expect(hellos).toBe(1 + 4);
    h.fromHeist(env("ready"));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(h.posted.slice(-2).map((p) => p.type)).toEqual(["session", "pause"]);
    expect(h.posted.every((p) => p.origin === ORIGIN && isHostToHeistMessage(p.message))).toBe(true);
    h.advance(2_000);
    expect(h.posted.filter((p) => p.type === "hello").length).toBe(hellos); // stopped
    // A later ready (the Heist reloaded) gets the session again; onReady fires once.
    h.fromHeist(env("ready"));
    expect(h.posted.at(-2)?.type).toBe("session");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("gives up after 10 s, and still connects when a late ready arrives", () => {
    const h = harness();
    const onTimeout = jest.fn();
    const onReady = jest.fn();
    createHostBridge({ win: h.win, target: () => h.frame, origin: ORIGIN, handlers: { onTimeout, onReady }, timers: h.timers });
    h.advance(HEIST_HELLO_TIMEOUT_MS + 1_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    const hellos = h.posted.length;
    expect(hellos).toBe(1 + HEIST_HELLO_TIMEOUT_MS / HEIST_HELLO_RETRY_MS);
    h.advance(5_000);
    expect(h.posted.length).toBe(hellos);
    h.fromHeist(env("ready"));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("posts nothing without a frame or an origin", () => {
    const h = harness();
    createHostBridge({ win: h.win, target: () => null, origin: ORIGIN, timers: h.timers });
    createHostBridge({ win: h.win, target: () => h.frame, origin: "", timers: h.timers });
    h.advance(1_000);
    expect(h.posted).toHaveLength(0);
  });
});

describe("host bridge messages", () => {
  function connected() {
    const h = harness();
    const handlers = { onRunComplete: jest.fn(), onRequestSignIn: jest.fn(), onExit: jest.fn() };
    const bridge = createHostBridge({
      win: h.win,
      target: () => h.frame,
      origin: ORIGIN,
      handlers,
      timers: h.timers,
    });
    h.fromHeist(env("ready"));
    return { h, handlers, bridge };
  }

  it("routes run-complete, request-sign-in and exit from the iframe only", () => {
    const { h, handlers } = connected();
    const run = env("run-complete", { runId: "run-1", won: true, levelId: "heist-01", log: LOG });
    h.fromHeist(run, {}); // another window
    h.fromHeist(run, h.frame, "https://evil.example"); // another origin
    h.fromHeist({ ...run, log: { ...LOG, ticks: 99 } }); // malformed log
    expect(handlers.onRunComplete).not.toHaveBeenCalled();
    h.fromHeist(run);
    h.fromHeist(env("request-sign-in"));
    h.fromHeist(env("exit"));
    expect(handlers.onRunComplete).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", won: true }));
    expect(handlers.onRequestSignIn).toHaveBeenCalledTimes(1);
    expect(handlers.onExit).toHaveBeenCalledTimes(1);
  });

  it("sends save results, pause and resume, and nothing after dispose", () => {
    const { h, bridge } = connected();
    bridge.saveResult("run-1", "saved");
    bridge.saveResult("run-2", "rejected", "HEIST_REPLAY_INVALID");
    bridge.pause();
    bridge.resume();
    const sent = h.posted.filter((p) => p.type !== "hello").map((p) => p.message);
    expect(sent).toEqual([
      env("save-result", { runId: "run-1", status: "saved" }),
      env("save-result", { runId: "run-2", status: "rejected", code: "HEIST_REPLAY_INVALID" }),
      env("pause"),
      env("resume"),
    ]);
    bridge.dispose();
    bridge.pause();
    expect(h.listeners.size).toBe(0);
    expect(h.posted.filter((p) => p.type !== "hello")).toHaveLength(4);
  });

  it("sends the sound settings after ready, on every change, and again on a later ready", () => {
    const h = harness();
    const bridge = createHostBridge({ win: h.win, target: () => h.frame, origin: ORIGIN, timers: h.timers });
    bridge.setAudio({ muted: true, musicVolume: 0.4, effectsVolume: 0.6 });
    expect(h.posted.some((p) => p.type === "audio")).toBe(false); // not before ready
    h.fromHeist(env("ready"));
    bridge.setAudio({ muted: false, musicVolume: 0.25, effectsVolume: 1 });
    h.fromHeist(env("ready")); // the Heist reloaded
    const audio = h.posted.filter((p) => p.type === "audio");
    expect(audio.map((p) => p.message)).toEqual([
      env("audio", { muted: true, musicVolume: 0.4, effectsVolume: 0.6 }),
      env("audio", { muted: false, musicVolume: 0.25, effectsVolume: 1 }),
      env("audio", { muted: false, musicVolume: 0.25, effectsVolume: 1 }),
    ]);
    expect(audio.every((p) => isHostToHeistMessage(p.message))).toBe(true);
  });
});
