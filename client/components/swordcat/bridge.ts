/**
 * The host side of the Swordcat (`SWORDCAT_TITLE` in `./title.ts`) bridge, version 1 (Swordcat plan
 * TOKENTAILS-PLAN.md §5.5).
 *
 * Envelope: `{ ns: 'tt-swordcat', v: 1, type, ...payload }`. Unknown types are ignored.
 * - Host to game: `hello` (until `ready`: every 500 ms for the first 10 s, then every 2 s with no
 *   hard stop, so a slow phone that takes longer to boot the game still connects), `session
 *   {signedIn}`, `audio {muted}`, `pause`, `resume`.
 * - Game to host: `ready {version}`, `level-complete {levelId, time, kittens, catnip, lives, rank}`,
 *   `kitten-rescued {kittenId}`, `paused {paused}`.
 * - Phase TT4 (plan §12.2, additive): game to host `cat-saved {slot, kind, catId?, catName?}` and
 *   `treat-request {requestId, slot, catId?, catName}`; host to game `treat-state {rail, sentToday,
 *   amountLabel?}` and `treat-result {requestId, kind, explorerUrl?, receiptPath?, amountLabel?}`.
 *   Limits: `slot` and `catId` at most 64 characters, `catName` 32, `requestId` 40, `amountLabel` 24.
 *   `explorerUrl` must be https and `receiptPath` must start with `/shelter-payouts/receipt?`. No free
 *   text crosses: both sides drop anything that fails these checks.
 *
 * Unlike the Heist, the game is usually served from another origin, so the checks matter: a message
 * counts only when it comes from our iframe's window and from the game's origin, and every post
 * names that exact origin (never `'*'`). The host never sends the `accesstoken` or a Firebase token:
 * the session carries one boolean, built here field by field.
 *
 * Phase 1 saves nothing: `level-complete` reaches a handler and stops there. Scores, when they come,
 * go only through `POST /user/catbassadors/live` (docs/GAMES.md).
 *
 * The game answers only a `hello` (it never posts before one, since it cannot know our origin), so the
 * host keeps saying hello until it hears `ready`. After 10 s the host reports `onSlow` (the page shows a
 * "still loading" note with Reload), after 2 min `onTimeout` (a fallback panel with Reload and Back),
 * and a `ready` at any time still connects. When the frame reloads after the handshake (the game's own
 * recovery reloads, or the player's Reload), `reconnect()` starts the handshake again.
 *
 * No React, no DOM globals: the window and timers are passed in, so the handshake is unit-tested.
 */

export const SWORDCAT_NS = "tt-swordcat";
export const SWORDCAT_BRIDGE_VERSION = 1;
/** hello interval while the game is expected to boot (the first `SWORDCAT_HELLO_SLOW_MS`). */
export const SWORDCAT_HELLO_RETRY_MS = 500;
/** No `ready` after this long: `onSlow` (a "still loading" note), and hello slows down. */
export const SWORDCAT_HELLO_SLOW_MS = 10_000;
/** hello interval after `SWORDCAT_HELLO_SLOW_MS`. It never stops before `ready` or `dispose`. */
export const SWORDCAT_HELLO_SLOW_RETRY_MS = 2_000;
/** No `ready` after this long: `onTimeout` (the fallback panel). hello keeps going. */
export const SWORDCAT_HELLO_TIMEOUT_MS = 120_000;

export type HostToSwordcatMessage =
  | { ns: typeof SWORDCAT_NS; v: 1; type: "hello" }
  | { ns: typeof SWORDCAT_NS; v: 1; type: "session"; signedIn: boolean }
  | { ns: typeof SWORDCAT_NS; v: 1; type: "audio"; muted: boolean }
  | { ns: typeof SWORDCAT_NS; v: 1; type: "pause" }
  | { ns: typeof SWORDCAT_NS; v: 1; type: "resume" }
  | ({ ns: typeof SWORDCAT_NS; v: 1; type: "treat-state" } & SwordcatTreatState)
  | ({ ns: typeof SWORDCAT_NS; v: 1; type: "treat-result" } & SwordcatTreatResult);

/** The treat rail as the game shows it (plan §12.2). */
export const SWORDCAT_TREAT_RAILS = ["checking", "live", "exhausted", "soon"] as const;
export type SwordcatTreatRail = (typeof SWORDCAT_TREAT_RAILS)[number];

export interface SwordcatTreatState {
  rail: SwordcatTreatRail;
  sentToday: boolean;
  amountLabel?: string;
}

/** One send's outcome: the `TreatSend` kinds of `components/codex/impact/treat.ts`, one to one. */
export const SWORDCAT_TREAT_RESULT_KINDS = [
  "sent",
  "already-today",
  "paused",
  "budget-spent",
  "failed",
  "retry",
  "not-eligible",
  "signed-out",
] as const;
export type SwordcatTreatResultKind = (typeof SWORDCAT_TREAT_RESULT_KINDS)[number];

export interface SwordcatTreatResult {
  requestId: string;
  kind: SwordcatTreatResultKind;
  explorerUrl?: string;
  receiptPath?: string;
  amountLabel?: string;
}

export const SWORDCAT_SLOT_MAX = 64;
export const SWORDCAT_CAT_ID_MAX = 64;
export const SWORDCAT_CAT_NAME_MAX = 32;
export const SWORDCAT_REQUEST_ID_MAX = 40;
export const SWORDCAT_AMOUNT_LABEL_MAX = 24;
export const SWORDCAT_RECEIPT_PREFIX = "/shelter-payouts/receipt?";
export const SWORDCAT_CAT_KINDS = ["lost", "squire", "service"] as const;
export type SwordcatCatKind = (typeof SWORDCAT_CAT_KINDS)[number];

export interface SwordcatReadyMessage {
  type: "ready";
  version: string | null;
}

export interface SwordcatLevelCompleteMessage {
  type: "level-complete";
  levelId: string;
  time: number | null;
  kittens: number | null;
  catnip: number | null;
  lives: number | null;
  rank: string | null;
}

export interface SwordcatKittenRescuedMessage {
  type: "kitten-rescued";
  kittenId: string;
}

export interface SwordcatPausedMessage {
  type: "paused";
  paused: boolean;
}

export interface SwordcatCatSavedMessage {
  type: "cat-saved";
  slot: string;
  kind: SwordcatCatKind;
  catId: string | null;
  catName: string | null;
}

export interface SwordcatTreatRequestMessage {
  type: "treat-request";
  requestId: string;
  slot: string;
  catId: string | null;
  catName: string;
}

export type SwordcatToHostMessage =
  | SwordcatReadyMessage
  | SwordcatLevelCompleteMessage
  | SwordcatKittenRescuedMessage
  | SwordcatPausedMessage
  | SwordcatCatSavedMessage
  | SwordcatTreatRequestMessage;

/** Builds a host message. The only way the host makes one: each payload field is copied by name. */
export function hostMessage(type: "hello" | "pause" | "resume"): HostToSwordcatMessage;
export function hostMessage(type: "session", payload: { signedIn: boolean }): HostToSwordcatMessage;
export function hostMessage(type: "audio", payload: { muted: boolean }): HostToSwordcatMessage;
export function hostMessage(type: "treat-state", payload: SwordcatTreatState): HostToSwordcatMessage;
export function hostMessage(type: "treat-result", payload: SwordcatTreatResult): HostToSwordcatMessage;
export function hostMessage(
  type: HostToSwordcatMessage["type"],
  payload?: { signedIn?: boolean; muted?: boolean } | SwordcatTreatState | SwordcatTreatResult
): HostToSwordcatMessage {
  const base = { ns: SWORDCAT_NS, v: SWORDCAT_BRIDGE_VERSION } as const;
  const p = (payload ?? {}) as Record<string, unknown>;
  if (type === "session") return { ...base, type, signedIn: p.signedIn === true };
  if (type === "audio") return { ...base, type, muted: p.muted === true };
  if (type === "treat-state") {
    const rail = (SWORDCAT_TREAT_RAILS as readonly unknown[]).includes(p.rail) ? (p.rail as SwordcatTreatRail) : "checking";
    const amountLabel = amountLabelOf(p.amountLabel);
    return { ...base, type, rail, sentToday: p.sentToday === true, ...(amountLabel ? { amountLabel } : {}) };
  }
  if (type === "treat-result") {
    const requestId = requestIdOf(p.requestId) ?? "";
    const kind = (SWORDCAT_TREAT_RESULT_KINDS as readonly unknown[]).includes(p.kind)
      ? (p.kind as SwordcatTreatResultKind)
      : "failed";
    const explorerUrl = explorerUrlOf(p.explorerUrl);
    const receiptPath = receiptPathOf(p.receiptPath);
    const amountLabel = amountLabelOf(p.amountLabel);
    return {
      ...base,
      type,
      requestId,
      kind,
      ...(explorerUrl ? { explorerUrl } : {}),
      ...(receiptPath ? { receiptPath } : {}),
      ...(amountLabel ? { amountLabel } : {}),
    };
  }
  return { ...base, type: type as "hello" | "pause" | "resume" };
}

/** A clean single-line string of 1 to `max` characters (no control characters), else null. */
function shortTextOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f<>]/.test(trimmed)) return null;
  return trimmed;
}

/** A request id: 1 to 40 characters of letters, digits, `_`, `-`, `.` or `:`. */
export function requestIdOf(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,40}$/.test(value) ? value : null;
}

/** A short amount such as `0.01 USDC` or `$0.01`. */
export function amountLabelOf(value: unknown): string | null {
  const text = shortTextOf(value, SWORDCAT_AMOUNT_LABEL_MAX);
  return text && /^[$]?[0-9][0-9.,]*( [A-Za-z][A-Za-z0-9.]{0,9})?$/.test(text) ? text : null;
}

/** An https explorer link with no credentials, else null. */
export function explorerUrlOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A same-origin receipt path (`/shelter-payouts/receipt?...`), else null. */
export function receiptPathOf(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 256 &&
    value.startsWith(SWORDCAT_RECEIPT_PREFIX) &&
    /^[A-Za-z0-9/?=&_.:-]+$/.test(value)
    ? value
    : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** A short id: a string or a finite number, as a string of at most `max` (64) characters. */
function idOf(value: unknown, max = 64): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/** An optional field: absent (undefined or null) is fine, present must pass `check`. */
function optionalOf<T>(value: unknown, check: (v: unknown) => T | null): T | null | undefined {
  if (value === undefined || value === null) return null;
  const checked = check(value);
  return checked === null ? undefined : checked;
}

const numberOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const textOf = (value: unknown): string | null => idOf(value);

/**
 * Validates a message from the game. Returns a clean copy (only the known fields), or null for
 * anything else: another namespace or version, an unknown type, or a missing required field.
 */
export function parseSwordcatMessage(data: unknown): SwordcatToHostMessage | null {
  if (!isRecord(data) || data.ns !== SWORDCAT_NS || data.v !== SWORDCAT_BRIDGE_VERSION) return null;
  switch (data.type) {
    case "ready":
      return { type: "ready", version: textOf(data.version) };
    case "level-complete": {
      const levelId = idOf(data.levelId);
      if (!levelId) return null;
      return {
        type: "level-complete",
        levelId,
        time: numberOf(data.time),
        kittens: numberOf(data.kittens),
        catnip: numberOf(data.catnip),
        lives: numberOf(data.lives),
        rank: textOf(data.rank),
      };
    }
    case "kitten-rescued": {
      const kittenId = idOf(data.kittenId);
      return kittenId ? { type: "kitten-rescued", kittenId } : null;
    }
    case "paused":
      return typeof data.paused === "boolean" ? { type: "paused", paused: data.paused } : null;
    case "cat-saved": {
      const slot = idOf(data.slot, SWORDCAT_SLOT_MAX);
      const kind = (SWORDCAT_CAT_KINDS as readonly unknown[]).includes(data.kind) ? (data.kind as SwordcatCatKind) : null;
      const catId = optionalOf(data.catId, (v) => idOf(v, SWORDCAT_CAT_ID_MAX));
      const catName = optionalOf(data.catName, (v) => shortTextOf(v, SWORDCAT_CAT_NAME_MAX));
      if (!slot || !kind || catId === undefined || catName === undefined) return null;
      return { type: "cat-saved", slot, kind, catId, catName };
    }
    case "treat-request": {
      const requestId = requestIdOf(data.requestId);
      const slot = idOf(data.slot, SWORDCAT_SLOT_MAX);
      const catId = optionalOf(data.catId, (v) => idOf(v, SWORDCAT_CAT_ID_MAX));
      const catName = shortTextOf(data.catName, SWORDCAT_CAT_NAME_MAX);
      if (!requestId || !slot || catId === undefined || !catName) return null;
      return { type: "treat-request", requestId, slot, catId, catName };
    }
    default:
      return null;
  }
}

/** True when a message event comes from our iframe's window and from the game's origin. */
export function isFromGame(
  event: Pick<MessageEvent, "source" | "origin">,
  target: unknown,
  origin: string | null
): boolean {
  return !!target && !!origin && event.source === target && event.origin === origin;
}

export interface SwordcatBridgeWindow {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface SwordcatBridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface SwordcatBridgeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  now(): number;
}

export interface SwordcatBridgeHandlers {
  onReady?(version: string | null): void;
  /** No `ready` after `SWORDCAT_HELLO_SLOW_MS` (a slow phone or network). hello keeps going. */
  onSlow?(): void;
  /** No `ready` after `SWORDCAT_HELLO_TIMEOUT_MS` (the game failed to load, or is very slow). hello keeps going. */
  onTimeout?(): void;
  /** Phase 1: not saved anywhere. */
  onLevelComplete?(message: SwordcatLevelCompleteMessage): void;
  onKittenRescued?(message: SwordcatKittenRescuedMessage): void;
  onPaused?(paused: boolean): void;
  /** Phase TT4: a cat was saved (analytics and a dev log only). */
  onCatSaved?(message: SwordcatCatSavedMessage): void;
  /** Phase TT4: the player asked for a treat. The host answers with `sendTreatResult`. */
  onTreatRequest?(message: SwordcatTreatRequestMessage): void;
}

export interface SwordcatBridge {
  readonly ready: boolean;
  /** Sends the sign-in state now if the game is ready, and again on every later `ready`. */
  setSignedIn(signedIn: boolean): void;
  /** Sends the mute state now if the game is ready, and again on every later `ready`. */
  setMuted(muted: boolean): void;
  pause(): void;
  resume(): void;
  /** Sends the treat state now if the game is ready, and again on every later `ready`. */
  setTreatState(state: SwordcatTreatState): void;
  /** Answers one `treat-request` (dropped when the request id is not valid). */
  sendTreatResult(result: SwordcatTreatResult): void;
  /**
   * The frame (re)loaded a new game document: forget `ready` and say hello again (with fresh slow and
   * timeout clocks). The next `ready` re-sends session, audio and a pending pause.
   */
  reconnect(): void;
  dispose(): void;
}

export interface SwordcatBridgeOptions {
  win: SwordcatBridgeWindow;
  /** The iframe's window; null until it exists. Read on every send and every message. */
  target: () => SwordcatBridgeTarget | null;
  /** The game's origin (`swordcatOrigin`). Null: the bridge stays silent. */
  origin: string | null;
  handlers?: SwordcatBridgeHandlers;
  timers?: SwordcatBridgeTimers;
}

const defaultTimers: SwordcatBridgeTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function createSwordcatBridge(options: SwordcatBridgeOptions): SwordcatBridge {
  const { win, origin } = options;
  const handlers = options.handlers ?? {};
  const timers = options.timers ?? defaultTimers;
  let ready = false;
  let disposed = false;
  let signedIn: boolean | null = null;
  let muted: boolean | null = null;
  let paused = false;
  let treatState: SwordcatTreatState | null = null;

  const post = (message: HostToSwordcatMessage) => {
    const target = options.target();
    if (!target || disposed || !origin) return;
    try {
      target.postMessage(message, origin);
    } catch {
      // The frame navigated away or was removed.
    }
  };

  const sendSession = () => {
    if (ready && signedIn !== null) post(hostMessage("session", { signedIn }));
  };
  const sendAudio = () => {
    if (ready && muted !== null) post(hostMessage("audio", { muted }));
  };
  const sendTreatState = () => {
    if (ready && treatState) post(hostMessage("treat-state", treatState));
  };

  // hello until ready: every 500 ms for 10 s, then every 2 s; never a hard stop.
  let started = timers.now();
  let slowSent = false;
  let timeoutSent = false;
  let helloTimer: unknown = null;
  const stopHello = () => {
    if (helloTimer !== null) timers.clearTimeout(helloTimer);
    helloTimer = null;
  };
  const hello = () => {
    helloTimer = null;
    if (ready || disposed) return;
    const elapsed = timers.now() - started;
    if (!slowSent && elapsed >= SWORDCAT_HELLO_SLOW_MS) {
      slowSent = true;
      handlers.onSlow?.();
    }
    if (!timeoutSent && elapsed >= SWORDCAT_HELLO_TIMEOUT_MS) {
      timeoutSent = true;
      handlers.onTimeout?.();
    }
    post(hostMessage("hello"));
    if (ready || disposed) return;
    const delay = elapsed < SWORDCAT_HELLO_SLOW_MS ? SWORDCAT_HELLO_RETRY_MS : SWORDCAT_HELLO_SLOW_RETRY_MS;
    helloTimer = timers.setTimeout(hello, delay);
  };
  const startHello = () => {
    stopHello();
    started = timers.now();
    slowSent = false;
    timeoutSent = false;
    hello();
  };
  startHello();

  const handle = (message: SwordcatToHostMessage) => {
    switch (message.type) {
      case "ready": {
        // A `ready` at any time connects, also after `onSlow` / `onTimeout`; a repeated one re-sends state.
        const first = !ready;
        ready = true;
        stopHello();
        sendSession();
        sendAudio();
        sendTreatState();
        if (paused) post(hostMessage("pause"));
        if (first) handlers.onReady?.(message.version);
        break;
      }
      case "level-complete":
        handlers.onLevelComplete?.(message);
        break;
      case "kitten-rescued":
        handlers.onKittenRescued?.(message);
        break;
      case "paused":
        handlers.onPaused?.(message.paused);
        break;
      case "cat-saved":
        handlers.onCatSaved?.(message);
        break;
      case "treat-request":
        handlers.onTreatRequest?.(message);
        break;
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (disposed) return;
    if (!isFromGame(event, options.target(), origin)) return;
    const message = parseSwordcatMessage(event.data);
    if (message) handle(message);
  };

  win.addEventListener("message", onMessage);

  return {
    get ready() {
      return ready;
    },
    setSignedIn(next) {
      signedIn = next === true;
      sendSession();
    },
    setMuted(next) {
      muted = next === true;
      sendAudio();
    },
    pause() {
      paused = true;
      post(hostMessage("pause"));
    },
    resume() {
      paused = false;
      post(hostMessage("resume"));
    },
    setTreatState(state) {
      treatState = { ...state };
      sendTreatState();
    },
    sendTreatResult(result) {
      if (!ready || !requestIdOf(result.requestId)) return;
      post(hostMessage("treat-result", result));
    },
    reconnect() {
      if (disposed) return;
      ready = false;
      startHello();
    },
    dispose() {
      disposed = true;
      stopHello();
      win.removeEventListener("message", onMessage);
    },
  };
}
