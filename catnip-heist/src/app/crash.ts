/**
 * G13-H: the Heist crash fallback and crash report (F9).
 *
 * A crash shows a night overlay with RELOAD instead of a dead screen or a
 * raw stack. A crash is a boot failure, a burst of uncaught same-origin
 * errors (the same frame failing over and over), or the frame heartbeat
 * stopping while the page is visible. A single uncaught error is only
 * reported: App.frame schedules the next frame before running the current
 * one, so the heist keeps going and the run in progress (and its unsent
 * save) must not be thrown away for a one-off error. A scrubbed `app_error`
 * is sent only when the player accepted analytics on tokentails.com (the
 * same-origin `tt-analytics-consent` key), at most 5 per session and one per
 * code, and only when a PostHog key is built in. Replay and verify builds
 * never include this module (see main.ts).
 *
 * The scrub rules, consent key and session budget come from
 * shared/analytics-core.ts, the same copy the core app uses. DOM access goes
 * through narrow `Pick` types so the tests can run under node with a small
 * fake document.
 */
import {
  CONSENT_STORAGE_KEY,
  POSTHOG_EU_HOST,
  consentGrantedIn,
  createSessionBudget,
  scrubStack,
  scrubText,
  storageBudgetStore,
} from '../shared-contracts/analytics-core';
import { sessionDistinctId } from '../analytics';

export const CONSENT_KEY = CONSENT_STORAGE_KEY;
export const CRASH_SESSION_KEY = 'tt-heist-app-error';
export const CRASH_MAX_PER_SESSION = 5;
export const OVERLAY_ID = 'ch-crash';
export { POSTHOG_EU_HOST };

export const CRASH_COPY = {
  title: 'Something went wrong.',
  reassurance: 'Your cats are safe.',
  body: 'The heist stopped. Reload to jump back in.',
  reload: 'RELOAD',
} as const;

// ---------------------------------------------------------------------------
// Minimal DOM and storage shapes

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type DocumentLike = Pick<Document, 'createElement' | 'getElementById' | 'body'> &
  Partial<Pick<Document, 'visibilityState'>>;
export type WindowLike = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  location: Pick<Location, 'protocol' | 'host' | 'href' | 'pathname' | 'reload'>;
};

// ---------------------------------------------------------------------------
// Scrubbing (shared/analytics-core.ts, the same rules as the core app)

/** Scrubs one string (the shared `scrubText`). */
export function scrub(value: unknown, max = 300): string {
  return scrubText(value, max);
}

export { scrubStack };

// ---------------------------------------------------------------------------
// Report

export interface CrashPayload {
  code: string;
  source: 'boot' | 'window' | 'rejection';
  level: 'root';
  error_name: string;
  message: string;
  stack: string | null;
  route: string;
  session_index: number;
  context: Record<string, string | number | boolean | null>;
}

export function buildCrashPayload(
  code: string,
  error: unknown,
  source: CrashPayload['source'],
  meta: { origin?: string; route?: string; sessionIndex?: number } = {},
): CrashPayload {
  const e = error instanceof Error ? error : null;
  return {
    code,
    source,
    level: 'root',
    error_name: scrub(e?.name ?? typeof error, 40) || 'Error',
    message: scrub(e ? e.message : typeof error === 'string' ? error : ''),
    stack: scrubStack(e?.stack, meta.origin),
    route: scrub((meta.route ?? '').split(/[?#]/)[0], 120),
    session_index: meta.sessionIndex ?? 0,
    context: { app: 'heist' },
  };
}

export function consentGranted(storage: StorageLike | null | undefined): boolean {
  return consentGrantedIn(storage);
}

export interface ReporterOptions {
  /** localStorage: where the consent choice lives (same origin as the app). */
  consentStorage: StorageLike | null;
  /** sessionStorage: the per-session budget. */
  sessionStorage: StorageLike | null;
  send: (payload: CrashPayload) => void;
  origin?: string;
  route?: () => string;
}

/** Consent-gated, capped reporter. Returns true when a report was sent. */
export function createCrashReporter(opts: ReporterOptions) {
  const budget = createSessionBudget(CRASH_MAX_PER_SESSION, storageBudgetStore(CRASH_SESSION_KEY, () => opts.sessionStorage));

  return (code: string, error: unknown, source: CrashPayload['source']): boolean => {
    try {
      if (!consentGranted(opts.consentStorage)) return false;
      const index = budget.take(code);
      if (!index) return false;
      opts.send(buildCrashPayload(code, error, source, {
        origin: opts.origin,
        route: opts.route?.(),
        sessionIndex: index,
      }));
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Sends one `app_error` to PostHog's capture endpoint with a beacon, so it
 * survives the RELOAD that usually follows. No key, no send.
 */
export function posthogSender(opts: {
  apiKey?: string;
  host?: string;
  sessionStorage: StorageLike | null;
  beacon?: (url: string, body: string) => boolean;
}): (payload: CrashPayload) => void {
  const apiKey = opts.apiKey?.trim() ?? '';
  const host = (opts.host?.trim() || POSTHOG_EU_HOST).replace(/\/+$/, '');
  return (payload) => {
    if (!apiKey || !opts.beacon) return;
    opts.beacon(`${host}/i/v0/e/`, JSON.stringify({
      api_key: apiKey,
      event: 'app_error',
      distinct_id: sessionDistinctId(opts.sessionStorage),
      properties: { ...payload, app: 'heist', $process_person_profile: false },
    }));
  };
}

// ---------------------------------------------------------------------------
// Overlay

const OVERLAY_CSS = `
#${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:radial-gradient(120% 80% at 50% 0%,#2a1552 0%,#0b0820 62%);color:#fcecbb;
  font-family:'Cat Paw',ui-rounded,system-ui,sans-serif;pointer-events:auto;touch-action:manipulation}
#${OVERLAY_ID} .ch-crash-card{box-sizing:border-box;width:100%;max-width:420px;padding:28px 24px 24px;border-radius:8px;text-align:center;
  background:linear-gradient(180deg,#2b1848 0%,#150b2c 100%);border:4px solid #05030f;
  box-shadow:inset 0 2px 0 rgba(255,255,255,.14),inset 0 0 0 2px rgba(153,102,204,.35),6px 6px 0 0 #05030f;
  animation:ch-crash-in .22s ease-out both}
#${OVERLAY_ID} h2{margin:0;font-weight:400;font-size:30px;line-height:1.05;letter-spacing:.02em;text-shadow:0 3px 0 #05030f}
#${OVERLAY_ID} h2 span{color:#ffc93c}
#${OVERLAY_ID} p{margin:12px 0 20px;font-family:ui-rounded,system-ui,sans-serif;font-size:16px;line-height:1.45;color:#c9b8ec}
#${OVERLAY_ID} button{min-height:48px;min-width:180px;padding:10px 20px;border-radius:6px;border:3px solid #05030f;background:#ffc93c;
  color:#05030f;font:inherit;font-size:22px;letter-spacing:.04em;cursor:pointer;box-shadow:inset 0 -4px 0 #b7791f,0 3px 0 #05030f}
#${OVERLAY_ID} button:hover{filter:brightness(1.08)}
#${OVERLAY_ID} button:focus-visible{outline:3px solid #c4e2fc;outline-offset:3px}
@keyframes ch-crash-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){#${OVERLAY_ID} .ch-crash-card{animation:none}}
`;

function el(doc: DocumentLike, tag: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows the crash overlay once; later calls return the same overlay. */
export function showCrashOverlay(doc: DocumentLike, reload: () => void): HTMLElement | null {
  const existing = doc.getElementById(OVERLAY_ID);
  if (existing) return existing;
  if (!doc.body) return null;

  const overlay = el(doc, 'div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', `${OVERLAY_ID}-title`);
  overlay.setAttribute('aria-describedby', `${OVERLAY_ID}-body`);

  const style = el(doc, 'style', OVERLAY_CSS);
  const card = el(doc, 'div');
  card.setAttribute('class', 'ch-crash-card');
  const title = el(doc, 'h2', `${CRASH_COPY.title} `);
  title.id = `${OVERLAY_ID}-title`;
  title.appendChild(el(doc, 'span', CRASH_COPY.reassurance));
  const body = el(doc, 'p', CRASH_COPY.body);
  body.id = `${OVERLAY_ID}-body`;
  const button = el(doc, 'button', CRASH_COPY.reload);
  button.setAttribute('type', 'button');
  button.setAttribute('data-testid', 'heist-crash-reload');
  button.addEventListener('click', reload);

  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(button);
  overlay.appendChild(style);
  overlay.appendChild(card);
  // aria-modal alone does not stop Tab: make the heist UI behind inert, and
  // keep Tab on RELOAD where `inert` is not supported.
  for (const sibling of Array.from(doc.body.children ?? [])) {
    try {
      sibling.setAttribute('inert', '');
      sibling.setAttribute('aria-hidden', 'true');
    } catch {
      // Not an element.
    }
  }
  overlay.addEventListener('keydown', (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Tab') return;
    event.preventDefault();
    try {
      button.focus({ preventScroll: true });
    } catch {
      // Focus is a nicety.
    }
  });
  doc.body.appendChild(overlay);
  try {
    button.focus({ preventScroll: true });
  } catch {
    // Focus is a nicety.
  }
  return overlay;
}

// ---------------------------------------------------------------------------
// Wiring

export interface CrashGuardOptions {
  win: WindowLike;
  doc: DocumentLike;
  localStorage: StorageLike | null;
  sessionStorage: StorageLike | null;
  send: (payload: CrashPayload) => void;
  /** False while watching a replay: the overlay still shows, nothing is sent. */
  reporting?: boolean;
  /**
   * The time of the last rendered frame (performance.now()), 0 before the
   * first. When it stops moving for HEARTBEAT_STALL_MS on a visible page the
   * heist is frozen and the overlay shows.
   */
  heartbeat?: () => number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

/** A burst: this many same-origin errors within BURST_WINDOW_MS. */
export const BURST_ERRORS = 3;
export const BURST_WINDOW_MS = 2000;
export const HEARTBEAT_STALL_MS = 5000;
export const HEARTBEAT_CHECK_MS = 1000;

/** Scheme and host, not URL.origin, which is the opaque "null" for custom schemes. */
export const sameOrigin = (url: unknown, loc: Pick<Location, 'protocol' | 'host' | 'href'>): boolean => {
  if (typeof url !== 'string' || !url || !loc.host) return false;
  try {
    const u = new URL(url, loc.href);
    return u.protocol === loc.protocol && u.host === loc.host;
  } catch {
    return false;
  }
};

const firstStackUrl = (stack: unknown): string | null => {
  if (typeof stack !== 'string') return null;
  const m = stack.match(/(https?:\/\/[^\s)]+?)(?::\d+){0,2}(?:\)|\s|$)/m);
  return m ? m[1] : null;
};

export interface CrashGuard {
  /** Boot failed: overlay plus report. */
  crash(error: unknown, code?: string): void;
  /** Starts watching the frame heartbeat (call once the app is running). */
  watch(heartbeat: () => number): void;
  dispose(): void;
}

/**
 * Installs the fallback. A single uncaught same-origin error only reports;
 * BURST_ERRORS of them within BURST_WINDOW_MS, or a stopped frame heartbeat,
 * show the overlay. Unhandled same-origin rejections only report (an asset
 * promise failing is often recoverable). Cross-origin and extension errors
 * are ignored.
 */
export function installCrashGuard(opts: CrashGuardOptions): CrashGuard {
  const { win, doc } = opts;
  const loc = win.location;
  const origin = loc.host ? `${loc.protocol}//${loc.host}` : undefined;
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const schedule = opts.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const cancel = opts.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));
  const report = createCrashReporter({
    consentStorage: opts.localStorage,
    sessionStorage: opts.sessionStorage,
    send: opts.send,
    origin,
    route: () => win.location.pathname,
  });
  const reporting = opts.reporting !== false;
  const reload = () => win.location.reload();

  const crash = (error: unknown, code = 'heist_boot_error', source: CrashPayload['source'] = 'boot') => {
    showCrashOverlay(doc, reload);
    if (reporting) report(code, error, source);
  };

  let recent: number[] = [];
  const onError = (event: Event) => {
    const e = event as ErrorEvent;
    if (!sameOrigin(e.filename, loc)) return;
    const error = e.error ?? e.message;
    if (reporting) report('heist_window_error', error, 'window');
    const t = now();
    recent = [...recent.filter((at) => t - at < BURST_WINDOW_MS), t];
    if (recent.length >= BURST_ERRORS) crash(error, 'heist_error_burst', 'window');
  };
  const onRejection = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason as { stack?: unknown } | undefined;
    if (!sameOrigin(firstStackUrl(reason?.stack), loc)) return;
    if (reporting) report('heist_unhandled_rejection', reason, 'rejection');
  };

  // Frame heartbeat: frames stop in a hidden tab, and our own timer is
  // throttled there, so a hidden page or a long gap between checks restarts
  // the count instead of counting as a freeze.
  let timer: unknown = null;
  const stopWatching = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const watch = (heartbeat: () => number) => {
    stopWatching();
    let lastBeat = 0;
    let lastMoved = now();
    let lastCheck = lastMoved;
    timer = schedule(() => {
      const t = now();
      const gap = t - lastCheck;
      lastCheck = t;
      let beat = 0;
      try {
        beat = Number(heartbeat()) || 0;
      } catch {
        beat = 0;
      }
      if (beat !== lastBeat || beat === 0 || doc.visibilityState === 'hidden' || gap > HEARTBEAT_CHECK_MS * 3) {
        lastBeat = beat;
        lastMoved = t;
        return;
      }
      if (t - lastMoved >= HEARTBEAT_STALL_MS) {
        stopWatching();
        const stall = new Error('Heist stopped rendering');
        stall.name = 'HeistStall';
        crash(stall, 'heist_frame_stall', 'window');
      }
    }, HEARTBEAT_CHECK_MS);
  };

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  if (opts.heartbeat) watch(opts.heartbeat);

  return {
    crash: (error, code) => crash(error, code),
    watch,
    dispose() {
      stopWatching();
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
    },
  };
}
