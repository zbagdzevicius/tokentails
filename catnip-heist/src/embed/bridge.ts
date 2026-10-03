/**
 * The Heist side of the `/heist` host bridge (plan G2 layer 1, `shared/heist-bridge.ts`).
 *
 * The host page (`client/components/heist/HeistHost.tsx`) sends `hello` every 500 ms until the Heist
 * answers `ready`; every `hello` is answered, so a host that reloads or missed the first answer still
 * connects, and the Heist also announces `ready` once when it installs (for a boot slower than the
 * host's 10 s window). Then the host sends `session` (signed in, server progress, safe-area insets),
 * `save-result`, `pause`, `resume` and `audio` (the shell's mute and volumes). The Heist sends
 * `run-complete`, `request-sign-in` and `exit`.
 *
 * The source and origin checks are hygiene only: the iframe is same-origin, so any script on the
 * page could post the same messages, and the backend replays every run before it counts. Nothing
 * here is a security boundary.
 *
 * DOM access goes through the narrow `BridgeWindow` shape so the tests run under node.
 */
import {
  heistMessage,
  isHostToHeistMessage,
  type HeistInsets,
  type HeistProgress,
  type HeistRunLog,
  type HeistSaveStatus,
  type HeistToHostMessage,
  type HostToHeistMessage,
} from '../shared-contracts/heist-bridge';

export interface BridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeWindow {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  location: { origin: string };
}

export interface HeistSession {
  signedIn: boolean;
  progress: HeistProgress | null;
  insets: HeistInsets;
}

export interface HeistBridgeHandlers {
  /** The host connected (first `hello`). */
  onConnect?(): void;
  onSession?(session: HeistSession): void;
  onSaveResult?(result: { runId: string; status: HeistSaveStatus; code?: string }): void;
  onPause?(): void;
  onResume?(): void;
  onAudio?(audio: HostAudioSettings): void;
}

/** The shell's sound settings, 0..1 on the shell's scale (`HeistAudioMessage`). */
export interface HostAudioSettings {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
}

export interface HeistBridgeClient {
  /** True once a `hello` from the host arrived. */
  readonly connected: boolean;
  /** The last session the host sent, if any. */
  readonly session: HeistSession | null;
  runComplete(run: { runId: string; won: boolean; levelId: string; log: HeistRunLog }): void;
  requestSignIn(): void;
  exit(): void;
  dispose(): void;
}

/**
 * The origin the host page lives on. Same-origin embeds (tokentails.com/heist and the local client)
 * use the Heist's own origin; a host on another origin is not supported, so nothing is sent there.
 */
export function hostOrigin(win: Pick<BridgeWindow, 'location'>): string {
  const origin = win.location.origin;
  // `null` for opaque origins (file:, sandboxed frames): post to nobody rather than to "*".
  return origin && origin !== 'null' ? origin : '';
}

export function createHeistBridgeClient(win: BridgeWindow, parent: BridgeTarget | null, handlers: HeistBridgeHandlers = {}): HeistBridgeClient {
  const origin = hostOrigin(win);
  let connected = false;
  let session: HeistSession | null = null;
  let disposed = false;

  const post = (message: HeistToHostMessage) => {
    if (!parent || !origin || disposed) return;
    try {
      parent.postMessage(message, origin);
    } catch {
      // A detached parent: nothing to tell.
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (disposed) return;
    // Hygiene only (see the file comment): only our parent, only our origin.
    if (!parent || event.source !== (parent as unknown) || event.origin !== origin) return;
    const data: unknown = event.data;
    if (!isHostToHeistMessage(data)) return;
    handle(data);
  };

  const handle = (message: HostToHeistMessage) => {
    switch (message.type) {
      case 'hello':
        if (!connected) {
          connected = true;
          handlers.onConnect?.();
        }
        post(heistMessage<HeistToHostMessage>({ type: 'ready' }));
        break;
      case 'session':
        session = { signedIn: message.signedIn, progress: message.progress, insets: message.insets };
        handlers.onSession?.(session);
        break;
      case 'save-result':
        handlers.onSaveResult?.({ runId: message.runId, status: message.status, code: message.code });
        break;
      case 'pause':
        handlers.onPause?.();
        break;
      case 'resume':
        handlers.onResume?.();
        break;
      case 'audio':
        handlers.onAudio?.({ muted: message.muted, musicVolume: message.musicVolume, effectsVolume: message.effectsVolume });
        break;
    }
  };

  win.addEventListener('message', onMessage);
  // Announce once, unasked: a host whose 10 s `hello` window ran out (a slow boot) still connects.
  post(heistMessage<HeistToHostMessage>({ type: 'ready' }));

  return {
    get connected() {
      return connected;
    },
    get session() {
      return session;
    },
    runComplete(run) {
      post(heistMessage<HeistToHostMessage>({ type: 'run-complete', runId: run.runId, won: run.won, levelId: run.levelId, log: run.log }));
    },
    requestSignIn() {
      post(heistMessage<HeistToHostMessage>({ type: 'request-sign-in' }));
    },
    exit() {
      post(heistMessage<HeistToHostMessage>({ type: 'exit' }));
    },
    dispose() {
      disposed = true;
      win.removeEventListener('message', onMessage);
    },
  };
}
