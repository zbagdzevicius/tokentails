/**
 * The host side of the Pawlegends bridge, version 1 (POC.md §11.1). The game side is
 * `pawlegends/src/embed/bridge.ts`; the handshake is the `/swordcat` one (`components/swordcat/bridge.ts`).
 *
 * Envelope: `{ ns: 'tt-pawlegends', v: 1, type, ...payload }`. Unknown types are ignored.
 * - Host to game: `hello` (until `ready`), `session {signedIn}`, `roster {cats[]}`, `entitlements {token}`,
 *   `audio {muted}`, `pause`, `resume`, `purchase-result {sku, ok}`, `app {isApp, store}`.
 *   `app.store` is additive: false when the backend store is not ready (a missing secret answers 503), so the
 *   game hides its store button; the game still plays.
 * - Game to host: `ready {version}`, `match-result {replay, summary}`, `purchase-intent {sku}`,
 *   `share {kind, url}`, `paused {paused}`.
 *
 * A message counts only when it comes from our iframe's window and the game's origin; every post names that
 * exact origin, never `'*'`. No `accesstoken` or Firebase token ever crosses: each payload is built here field by
 * field. The entitlement token is not an account credential: it only lists Pawlegends items (signed by the
 * backend) and the game reads its `items`.
 *
 * No React, no DOM globals: the window and timers are passed in, so the handshake is unit-tested.
 */
import { PAWLEGENDS_LEVELS, PAWLEGENDS_MAX_INPUT_CHARS, PAWLEGENDS_MAX_TICKS } from "@/shared-contracts/caps";

export const PAWLEGENDS_NS = "tt-pawlegends";
export const PAWLEGENDS_BRIDGE_VERSION = 1;
export const PAWLEGENDS_HELLO_RETRY_MS = 500;
export const PAWLEGENDS_HELLO_SLOW_MS = 10_000;
export const PAWLEGENDS_HELLO_SLOW_RETRY_MS = 2_000;
export const PAWLEGENDS_HELLO_TIMEOUT_MS = 120_000;

/** Mirror of `PAWLEGENDS_SKU_IDS` in `backend/src/pawlegends/pawlegends.contracts.ts`. */
export const PAWLEGENDS_SKUS = ["pl_starter", "pl_founder", "pl_founder_legend", "pl_founder_legend_upgrade"] as const;
export type PawlegendsSku = (typeof PAWLEGENDS_SKUS)[number];
export const isPawlegendsSku = (value: unknown): value is PawlegendsSku =>
  typeof value === "string" && (PAWLEGENDS_SKUS as readonly string[]).includes(value);

/** Mirrors of `HeroId` and `TrickId` in `pawlegends/src/data/`. */
export const PAWLEGENDS_HEROES = ["clem", "sage", "brutus", "cacklejaw"] as const;
export const PAWLEGENDS_TRICKS = ["pounce", "snack", "hiss"] as const;

/** `ReplayRecord` of `pawlegends/src/sim/api.ts` (POC.md §11.3), checked here for shape only. */
export interface PawlegendsReplay {
  v: 1;
  simVersion: number;
  seed: number;
  difficulty: string;
  hero: string;
  trick: string;
  ticks: number;
  inputs: string;
  outcome: "won" | "lost";
  finalHash: string;
}

/** What the game says about the match for display and analytics; never trusted for a save. */
export interface PawlegendsSummary {
  won: boolean;
  ticks: number | null;
  hero: string | null;
  difficulty: string | null;
  takedowns: number | null;
}

export interface PawlegendsRosterCat {
  id: string;
  name: string;
  type: string;
  tier: string;
  isStarter: boolean;
  starterBreed?: string;
  origin?: string;
}

export type HostToPawlegendsMessage =
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "hello" | "pause" | "resume" }
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "session"; signedIn: boolean }
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "roster"; cats: PawlegendsRosterCat[] }
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "entitlements"; token: string | null }
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "audio"; muted: boolean }
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "purchase-result"; sku: PawlegendsSku; ok: boolean }
  | { ns: typeof PAWLEGENDS_NS; v: 1; type: "app"; isApp: boolean; store: boolean };

export type PawlegendsToHostMessage =
  | { type: "ready"; version: string | null }
  | { type: "match-result"; replay: PawlegendsReplay; summary: PawlegendsSummary }
  | { type: "purchase-intent"; sku: PawlegendsSku }
  | { type: "share"; kind: string; url: string }
  | { type: "paused"; paused: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const intIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ENTITLEMENT_TOKEN = /^[A-Za-z0-9_-]{1,8000}\.[A-Za-z0-9_-]{16,128}$/;

/** A replay with the backend DTO's shape (`pawlegends-replay.dto.ts`), as a clean copy; else null. */
export function replayOf(value: unknown): PawlegendsReplay | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const { simVersion, seed, difficulty, hero, trick, ticks, inputs, outcome, finalHash } = value;
  if (!intIn(simVersion, 1, 1_000_000) || !intIn(seed, 0, 0xffffffff) || !intIn(ticks, 1, PAWLEGENDS_MAX_TICKS)) return null;
  if (typeof difficulty !== "string" || !PAWLEGENDS_LEVELS.includes(difficulty)) return null;
  if (typeof hero !== "string" || !/^[a-z]{1,16}$/.test(hero)) return null;
  if (typeof trick !== "string" || !/^[a-z]{1,16}$/.test(trick)) return null;
  if (typeof inputs !== "string" || inputs.length > PAWLEGENDS_MAX_INPUT_CHARS || !BASE64.test(inputs)) return null;
  if (outcome !== "won" && outcome !== "lost") return null;
  if (typeof finalHash !== "string" || !/^[0-9a-f]{8}$/.test(finalHash)) return null;
  return { v: 1, simVersion, seed, difficulty, hero, trick, ticks, inputs, outcome, finalHash };
}

const shortId = (value: unknown, max = 16): string | null =>
  typeof value === "string" && /^[a-z0-9_-]+$/i.test(value) && value.length <= max ? value : null;

const countOf = (value: unknown, max: number): number | null => (intIn(value, 0, max) ? value : null);

/** A display summary (the replay decides `won` when the game leaves it out). */
export function summaryOf(value: unknown, replay: PawlegendsReplay): PawlegendsSummary {
  const s = isRecord(value) ? value : {};
  return {
    won: replay.outcome === "won",
    ticks: countOf(s.ticks, PAWLEGENDS_MAX_TICKS) ?? replay.ticks,
    hero: shortId(s.hero) ?? replay.hero,
    difficulty: shortId(s.difficulty) ?? replay.difficulty,
    takedowns: countOf(s.takedowns, 999),
  };
}

/**
 * A share link the host may hand to the system share sheet: a same-origin `/pawlegends` path, or an https URL
 * on `origin` (the dare link carries seed, picks and difficulty in the query). Anything else is null.
 */
export function shareUrlOf(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length > 512 || /[\s\\<>"']/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (!url.pathname.startsWith("/pawlegends")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Validates a message from the game. A clean copy (known fields only), or null. */
export function parsePawlegendsMessage(data: unknown): PawlegendsToHostMessage | null {
  if (!isRecord(data) || data.ns !== PAWLEGENDS_NS || data.v !== PAWLEGENDS_BRIDGE_VERSION) return null;
  switch (data.type) {
    case "ready":
      return { type: "ready", version: typeof data.version === "string" && data.version.length <= 64 ? data.version : null };
    case "match-result": {
      const replay = replayOf(data.replay);
      return replay ? { type: "match-result", replay, summary: summaryOf(data.summary, replay) } : null;
    }
    case "purchase-intent":
      return isPawlegendsSku(data.sku) ? { type: "purchase-intent", sku: data.sku } : null;
    case "share": {
      const kind = shortId(data.kind, 24);
      // The url is checked against the page origin by the host (`shareUrlOf`).
      return kind && typeof data.url === "string" && data.url.length <= 512 ? { type: "share", kind, url: data.url } : null;
    }
    case "paused":
      return typeof data.paused === "boolean" ? { type: "paused", paused: data.paused } : null;
    default:
      return null;
  }
}

/** Builds a host message. The only way the host makes one: each payload field is copied by name. */
export function hostMessage(type: "hello" | "pause" | "resume"): HostToPawlegendsMessage;
export function hostMessage(type: "session", payload: { signedIn: boolean }): HostToPawlegendsMessage;
export function hostMessage(type: "roster", payload: { cats: PawlegendsRosterCat[] }): HostToPawlegendsMessage;
export function hostMessage(type: "entitlements", payload: { token: string | null }): HostToPawlegendsMessage;
export function hostMessage(type: "audio", payload: { muted: boolean }): HostToPawlegendsMessage;
export function hostMessage(type: "purchase-result", payload: { sku: PawlegendsSku; ok: boolean }): HostToPawlegendsMessage;
export function hostMessage(type: "app", payload: { isApp: boolean; store: boolean }): HostToPawlegendsMessage;
export function hostMessage(type: HostToPawlegendsMessage["type"], payload?: Record<string, unknown>): HostToPawlegendsMessage {
  const base = { ns: PAWLEGENDS_NS, v: PAWLEGENDS_BRIDGE_VERSION } as const;
  const p = payload ?? {};
  switch (type) {
    case "session":
      return { ...base, type, signedIn: p.signedIn === true };
    case "audio":
      return { ...base, type, muted: p.muted === true };
    case "roster":
      return {
        ...base,
        type,
        cats: Array.isArray(p.cats)
          ? (p.cats as PawlegendsRosterCat[]).map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              tier: c.tier,
              isStarter: c.isStarter === true,
              ...(c.starterBreed ? { starterBreed: c.starterBreed } : {}),
              ...(c.origin ? { origin: c.origin } : {}),
            }))
          : [],
      };
    case "entitlements":
      return { ...base, type, token: typeof p.token === "string" && ENTITLEMENT_TOKEN.test(p.token) ? p.token : null };
    case "purchase-result":
      return { ...base, type, sku: isPawlegendsSku(p.sku) ? p.sku : "pl_starter", ok: p.ok === true };
    case "app":
      return { ...base, type, isApp: p.isApp === true, store: p.store === true && p.isApp !== true };
    default:
      return { ...base, type: type as "hello" | "pause" | "resume" };
  }
}

export function isFromGame(event: Pick<MessageEvent, "source" | "origin">, target: unknown, origin: string | null): boolean {
  return !!target && !!origin && event.source === target && event.origin === origin;
}

export interface PawlegendsBridgeWindow {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface PawlegendsBridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface PawlegendsBridgeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  now(): number;
}

export interface PawlegendsBridgeHandlers {
  onReady?(version: string | null): void;
  onSlow?(): void;
  onTimeout?(): void;
  onMatchResult?(replay: PawlegendsReplay, summary: PawlegendsSummary): void;
  onPurchaseIntent?(sku: PawlegendsSku): void;
  onShare?(kind: string, url: string): void;
  onPaused?(paused: boolean): void;
}

/** The state the host keeps; every `ready` re-sends whatever is set. */
export interface PawlegendsBridge {
  readonly ready: boolean;
  setSignedIn(signedIn: boolean): void;
  setRoster(cats: PawlegendsRosterCat[]): void;
  setEntitlements(token: string | null): void;
  setMuted(muted: boolean): void;
  setApp(isApp: boolean, store: boolean): void;
  purchaseResult(sku: PawlegendsSku, ok: boolean): void;
  pause(): void;
  resume(): void;
  reconnect(): void;
  dispose(): void;
}

export interface PawlegendsBridgeOptions {
  win: PawlegendsBridgeWindow;
  target: () => PawlegendsBridgeTarget | null;
  origin: string | null;
  handlers?: PawlegendsBridgeHandlers;
  timers?: PawlegendsBridgeTimers;
}

const defaultTimers: PawlegendsBridgeTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function createPawlegendsBridge(options: PawlegendsBridgeOptions): PawlegendsBridge {
  const { win, origin } = options;
  const handlers = options.handlers ?? {};
  const timers = options.timers ?? defaultTimers;
  let ready = false;
  let disposed = false;
  let paused = false;
  // Sticky state, re-sent in this order on every `ready` (app first, so the game knows about the store).
  const state: {
    app?: HostToPawlegendsMessage;
    session?: HostToPawlegendsMessage;
    audio?: HostToPawlegendsMessage;
    roster?: HostToPawlegendsMessage;
    entitlements?: HostToPawlegendsMessage;
  } = {};

  const post = (message: HostToPawlegendsMessage) => {
    const target = options.target();
    if (!target || disposed || !origin) return;
    try {
      target.postMessage(message, origin);
    } catch {
      // The frame navigated away or was removed.
    }
  };
  const keep = (key: keyof typeof state, message: HostToPawlegendsMessage) => {
    state[key] = message;
    if (ready) post(message);
  };
  const resendAll = () => {
    for (const key of ["app", "session", "audio", "roster", "entitlements"] as const) {
      const message = state[key];
      if (message) post(message);
    }
    if (paused) post(hostMessage("pause"));
  };

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
    if (!slowSent && elapsed >= PAWLEGENDS_HELLO_SLOW_MS) {
      slowSent = true;
      handlers.onSlow?.();
    }
    if (!timeoutSent && elapsed >= PAWLEGENDS_HELLO_TIMEOUT_MS) {
      timeoutSent = true;
      handlers.onTimeout?.();
    }
    post(hostMessage("hello"));
    if (ready || disposed) return;
    helloTimer = timers.setTimeout(hello, elapsed < PAWLEGENDS_HELLO_SLOW_MS ? PAWLEGENDS_HELLO_RETRY_MS : PAWLEGENDS_HELLO_SLOW_RETRY_MS);
  };
  const startHello = () => {
    stopHello();
    started = timers.now();
    slowSent = false;
    timeoutSent = false;
    hello();
  };
  startHello();

  const onMessage = (event: MessageEvent) => {
    if (disposed || !isFromGame(event, options.target(), origin)) return;
    const message = parsePawlegendsMessage(event.data);
    if (!message) return;
    switch (message.type) {
      case "ready": {
        const first = !ready;
        ready = true;
        stopHello();
        resendAll();
        if (first) handlers.onReady?.(message.version);
        break;
      }
      case "match-result":
        handlers.onMatchResult?.(message.replay, message.summary);
        break;
      case "purchase-intent":
        handlers.onPurchaseIntent?.(message.sku);
        break;
      case "share":
        handlers.onShare?.(message.kind, message.url);
        break;
      case "paused":
        handlers.onPaused?.(message.paused);
        break;
    }
  };
  win.addEventListener("message", onMessage);

  return {
    get ready() {
      return ready;
    },
    setSignedIn: (signedIn) => keep("session", hostMessage("session", { signedIn })),
    setRoster: (cats) => keep("roster", hostMessage("roster", { cats })),
    setEntitlements: (token) => keep("entitlements", hostMessage("entitlements", { token })),
    setMuted: (muted) => keep("audio", hostMessage("audio", { muted })),
    setApp: (isApp, store) => keep("app", hostMessage("app", { isApp, store })),
    purchaseResult(sku, ok) {
      if (ready) post(hostMessage("purchase-result", { sku, ok }));
    },
    pause() {
      paused = true;
      post(hostMessage("pause"));
    },
    resume() {
      paused = false;
      post(hostMessage("resume"));
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
