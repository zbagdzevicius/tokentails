/**
 * The host side of the Catnip Heist bridge (plan G2 layer 1, `shared/heist-bridge.ts`).
 *
 * The host sends `hello` every `HEIST_HELLO_RETRY_MS` (500 ms) until the Heist answers `ready`, for
 * at most `HEIST_HELLO_TIMEOUT_MS` (10 s). A `ready` that arrives later (a slow boot announces it
 * unasked) still connects. After `ready` the host sends `session` and `audio`, and `save-result`,
 * `pause`, `resume` and `audio` as they happen.
 *
 * Origin and source checks are hygiene, not security: `/heist-game/` is served from the same
 * origin as the host, so any script on either page can read and post anything. The backend replays
 * every run before it counts, which is what makes saves trustworthy.
 *
 * No React, no DOM globals: the window and timers are passed in, so the handshake is unit-tested.
 */
import {
  HEIST_HELLO_RETRY_MS,
  HEIST_HELLO_TIMEOUT_MS,
  heistMessage,
  isHeistToHostMessage,
  type HeistInsets,
  type HeistProgress,
  type HeistRunCompleteMessage,
  type HeistSaveStatus,
  type HeistToHostMessage,
  type HostToHeistMessage,
} from "@/shared-contracts/heist-bridge";

export interface HostBridgeWindow {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface HostBridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface HostBridgeTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  now(): number;
}

export interface HostBridgeHandlers {
  onReady?(): void;
  /** No `ready` within the hello window (the Heist failed to boot, or is very slow). */
  onTimeout?(): void;
  onRunComplete?(message: HeistRunCompleteMessage): void;
  onRequestSignIn?(): void;
  onExit?(): void;
}

export interface HeistSessionPayload {
  signedIn: boolean;
  progress: HeistProgress | null;
  insets: HeistInsets;
}

/** The shell's sound settings, forwarded so the lobby's one mute also covers the Heist (G14). */
export interface HeistAudioPayload {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
}

export interface HostBridge {
  readonly ready: boolean;
  /** Sends the sound settings now if the Heist is ready, and again on every later `ready`. */
  setAudio(audio: HeistAudioPayload): void;
  /** Sends the session now if the Heist is ready, and again on every later `ready`. */
  setSession(session: HeistSessionPayload): void;
  saveResult(runId: string, status: HeistSaveStatus, code?: string | null): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export interface HostBridgeOptions {
  win: HostBridgeWindow;
  /** The iframe's window; null until it exists. Read on every send. */
  target: () => HostBridgeTarget | null;
  /** The Heist's origin (same as the host's). */
  origin: string;
  handlers?: HostBridgeHandlers;
  timers?: HostBridgeTimers;
}

const defaultTimers: HostBridgeTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

export function createHostBridge(options: HostBridgeOptions): HostBridge {
  const { win, origin } = options;
  const handlers = options.handlers ?? {};
  const timers = options.timers ?? defaultTimers;
  let ready = false;
  let disposed = false;
  let session: HeistSessionPayload | null = null;
  let audio: HeistAudioPayload | null = null;
  let paused = false;

  const post = (message: HostToHeistMessage) => {
    const target = options.target();
    if (!target || disposed || !origin) return;
    try {
      target.postMessage(message, origin);
    } catch {
      // The frame navigated away or was removed.
    }
  };

  const sendSession = () => {
    if (!ready || !session) return;
    post(heistMessage<HostToHeistMessage>({ type: "session", ...session }));
  };

  const sendAudio = () => {
    if (!ready || !audio) return;
    post(heistMessage<HostToHeistMessage>({ type: "audio", ...audio }));
  };

  // hello, every 500 ms for up to 10 s.
  const started = timers.now();
  let helloTimer: unknown = null;
  const stopHello = () => {
    if (helloTimer !== null) timers.clearInterval(helloTimer);
    helloTimer = null;
  };
  const hello = () => {
    if (ready || disposed) {
      stopHello();
      return;
    }
    if (timers.now() - started > HEIST_HELLO_TIMEOUT_MS) {
      stopHello();
      handlers.onTimeout?.();
      return;
    }
    post(heistMessage<HostToHeistMessage>({ type: "hello" }));
  };
  helloTimer = timers.setInterval(hello, HEIST_HELLO_RETRY_MS);
  hello();

  const onMessage = (event: MessageEvent) => {
    if (disposed) return;
    const target = options.target();
    // Hygiene (see the file comment): only our iframe, only our origin.
    if (!target || event.source !== (target as unknown) || event.origin !== origin) return;
    const data: unknown = event.data;
    if (!isHeistToHostMessage(data)) return;
    handle(data);
  };

  const handle = (message: HeistToHostMessage) => {
    switch (message.type) {
      case "ready": {
        const first = !ready;
        ready = true;
        stopHello();
        sendSession();
        sendAudio();
        if (paused) post(heistMessage<HostToHeistMessage>({ type: "pause" }));
        if (first) handlers.onReady?.();
        break;
      }
      case "run-complete":
        handlers.onRunComplete?.(message);
        break;
      case "request-sign-in":
        handlers.onRequestSignIn?.();
        break;
      case "exit":
        handlers.onExit?.();
        break;
    }
  };

  win.addEventListener("message", onMessage);

  return {
    get ready() {
      return ready;
    },
    setSession(next) {
      session = next;
      sendSession();
    },
    setAudio(next) {
      audio = { muted: next.muted, musicVolume: next.musicVolume, effectsVolume: next.effectsVolume };
      sendAudio();
    },
    saveResult(runId, status, code) {
      post(heistMessage<HostToHeistMessage>(code ? { type: "save-result", runId, status, code } : { type: "save-result", runId, status }));
    },
    pause() {
      paused = true;
      post(heistMessage<HostToHeistMessage>({ type: "pause" }));
    },
    resume() {
      paused = false;
      post(heistMessage<HostToHeistMessage>({ type: "resume" }));
    },
    dispose() {
      disposed = true;
      stopHello();
      win.removeEventListener("message", onMessage);
    },
  };
}
