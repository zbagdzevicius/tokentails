/**
 * The same-window channel between the game and the app's in-page host (sign-in). On the web the game runs in an
 * iframe and the Token Tails page talks to it with postMessage; in the app there is no frame, so the shell installs
 * this channel as `window.__PL_HOST__` before the game loads (pawlegends/src/embed/bridge.ts `nativeChannel`), and
 * the host runs the very same bridge as the web host (pawlegends-web/components/pawlegends/bridge.ts
 * `createPawlegendsBridge`) on top of it.
 *
 * Like postMessage, every message is copied (structuredClone) and delivered on a later task, so neither side ever
 * holds the other's objects or runs inside the other's call stack. Host messages go only to the one game receiver;
 * game messages reach the host's listeners with `source` = this channel's target and a fixed origin, which is what
 * the host bridge's `isFromGame` check compares.
 */
import type { PawlegendsBridgeTarget, PawlegendsBridgeWindow } from "@/components/pawlegends/bridge";

/** The origin the host bridge expects for game messages (no real page has it). */
export const NATIVE_HOST_ORIGIN = "app://pawlegends";

/** The game's side (`window.__PL_HOST__`). */
export interface GameChannel {
  post(message: unknown): void;
  listen(receiver: (message: unknown) => void): void;
}

export interface HostChannel {
  game: GameChannel;
  /** The host bridge's window (`createPawlegendsBridge({ win })`). */
  win: PawlegendsBridgeWindow;
  /** The host bridge's target (`createPawlegendsBridge({ target })`). */
  target: () => PawlegendsBridgeTarget;
  origin: string;
}

type Defer = (fn: () => void) => void;

function copy(value: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createChannel(defer: Defer = (fn) => void setTimeout(fn, 0)): HostChannel {
  const listeners = new Set<(event: MessageEvent) => void>();
  let receiver: ((message: unknown) => void) | null = null;
  const target: PawlegendsBridgeTarget = {
    postMessage(message, origin) {
      if (origin !== NATIVE_HOST_ORIGIN) return;
      let data: unknown;
      try {
        data = copy(message);
      } catch {
        return;
      }
      defer(() => receiver?.(data));
    },
  };
  const game: GameChannel = Object.freeze({
    post(message: unknown) {
      let data: unknown;
      try {
        data = copy(message);
      } catch {
        return;
      }
      defer(() => {
        const event = { data, source: target, origin: NATIVE_HOST_ORIGIN } as unknown as MessageEvent;
        for (const listener of [...listeners]) listener(event);
      });
    },
    listen(next: (message: unknown) => void) {
      receiver = next;
    },
  });
  return {
    game,
    win: {
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    },
    target: () => target,
    origin: NATIVE_HOST_ORIGIN,
  };
}

/** The global the shell hands the channel over with (shell.js installs it; host.js picks it up). */
export const CHANNEL_GLOBAL = "__PL_HOST_CHANNEL__";
