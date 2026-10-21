/**
 * Crash overlay and crash reports. Any uncaught error or rejected promise shows a small panel with a Reload button
 * instead of a frozen canvas. The message is shortened; no stack, no token, nothing personal is shown.
 *
 * Reports (launch finding R1): each crash also goes to the `onError` hook (App sends it as `app_error`, to the host
 * when embedded, else through the game's consent-gated analytics). The hook gets only `crashCode(err)`: the first
 * line of the message, lower-case, letters, digits, `_` and spaces, at most 80 characters. At most
 * CRASH_REPORT_MAX reports a page; crashes before the hook is set wait (inside that cap) and go out when it is.
 */
let shown = false;

export type CrashSource = 'window' | 'rejection' | 'worker' | 'boot';
export const CRASH_SOURCES: readonly CrashSource[] = Object.freeze(['window', 'rejection', 'worker', 'boot']);
export type CrashHook = (source: CrashSource, msg: string) => void;

/** Most crash reports one page sends (a crash loop cannot flood analytics). */
export const CRASH_REPORT_MAX = 5;
export const CRASH_CODE_MAX = 80;

let hook: CrashHook | null = null;
let reported = 0;
const waiting: [CrashSource, string][] = [];
/** Errors a caller already reported with its own source (the worker), so the window listener skips them. */
const tagged = new WeakSet<object>();

export function crashMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
  const one = raw.split('\n')[0].trim() || 'Unknown error';
  return one.length > 160 ? `${one.slice(0, 157)}...` : one;
}

/** The report form of a crash message: `[a-z0-9_ ]` only, single spaces, at most 80 characters. Pure. */
export function crashCode(err: unknown): string {
  const s = crashMessage(err)
    .toLowerCase()
    .replace(/[^a-z0-9_ ]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, CRASH_CODE_MAX)
    .trim();
  return s || 'unknown error';
}

function send(source: CrashSource, msg: string): void {
  try {
    hook?.(source, msg);
  } catch {
    // Reporting must never become the next crash.
  }
}

/** Report one crash (rate-limited). Returns true when it counted against the page's budget. */
export function reportCrash(source: CrashSource, err: unknown): boolean {
  if (err && typeof err === 'object') {
    if (tagged.has(err)) return false;
    tagged.add(err);
  }
  if (reported >= CRASH_REPORT_MAX) return false;
  reported++;
  const msg = crashCode(err);
  if (hook) send(source, msg);
  else waiting.push([source, msg]);
  return true;
}

/** Set (or clear) the report hook; crashes that came before it go out now. */
export function setCrashHook(fn: CrashHook | null): void {
  hook = fn;
  if (!fn) return;
  for (const [source, msg] of waiting.splice(0)) send(source, msg);
}

export interface CrashProps {
  source: CrashSource;
  msg: string;
  screen: string;
  tier: string;
  sim: number;
}

/** What `crashSender` needs (App passes its bridge and analytics). */
export interface CrashSink {
  /** The player's analytics answer; nothing is sent after a no. */
  consent(): 'granted' | 'denied' | 'unset';
  /** Post `client-error` to the host; false when not embedded or no hello yet. */
  post(props: CrashProps): boolean;
  /** The game's own consent-gated analytics (`app_error`), flushed at once. */
  track(props: CrashProps): void;
  flush(): void;
  context(): { screen: string; tier: string; sim: number };
}

/**
 * The App's crash hook: to the host when embedded (it reports a scrubbed `app_error` with its own per-session
 * budget), else the game's consent-gated analytics. Never after the player said no.
 */
export function crashSender(sink: CrashSink): CrashHook {
  return (source, msg) => {
    if (sink.consent() === 'denied') return;
    const props: CrashProps = { source, msg, ...sink.context() };
    if (sink.post(props)) return;
    sink.track(props);
    sink.flush();
  };
}

export function showCrash(err: unknown, doc: Document = document): HTMLElement | null {
  if (shown) return null;
  shown = true;
  const box = doc.createElement('div');
  box.id = 'crash';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-label', 'The game stopped');
  box.innerHTML = '<div class="crash-card"><h2>Oops, the game tripped over its tail.</h2><p class="crash-msg"></p><button type="button">Reload</button></div>';
  (box.querySelector('.crash-msg') as HTMLElement).textContent = crashMessage(err);
  box.querySelector('button')!.addEventListener('click', () => location.reload());
  doc.body.appendChild(box);
  return box;
}

export function installCrashOverlay(win: Window = window, onError?: CrashHook): void {
  if (onError) setCrashHook(onError);
  win.addEventListener('error', (e) => {
    const err = e.error ?? e.message;
    reportCrash('window', err);
    showCrash(err);
  });
  win.addEventListener('unhandledrejection', (e) => {
    reportCrash('rejection', e.reason);
    showCrash(e.reason);
  });
}

/** Tests only. */
export function resetCrashForTests(): void {
  shown = false;
  hook = null;
  reported = 0;
  waiting.length = 0;
}
