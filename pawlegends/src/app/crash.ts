/**
 * Crash overlay and crash reports. Any uncaught error or rejected promise shows a small panel with a Reload button
 * instead of a frozen canvas. The message is shortened; no stack, no token, nothing personal is shown.
 *
 * Reports (launch finding R1): each crash also goes to the `onError` hook (App sends it as `app_error`, to the host
 * when embedded, else through the game's consent-gated analytics). The hook gets only `crashCode(err)`: the first
 * line of the message, lower-case, letters, digits, `_` and spaces, at most 80 characters, and `stackHash(err)`: 8 hex
 * of a hash of where it broke (the stack's function names and file names, no URLs, paths or queries), so one PostHog
 * breakdown groups a crash across players without sending a stack. At most CRASH_REPORT_MAX reports a page; crashes
 * before the hook is set wait (inside that cap) and go out when it is.
 */
let shown = false;

export type CrashSource = 'window' | 'rejection' | 'worker' | 'boot';
export const CRASH_SOURCES: readonly CrashSource[] = Object.freeze(['window', 'rejection', 'worker', 'boot']);
export type CrashHook = (source: CrashSource, msg: string, stackHash?: string) => void;

/** Most crash reports one page sends (a crash loop cannot flood analytics). */
export const CRASH_REPORT_MAX = 5;
export const CRASH_CODE_MAX = 80;

let hook: CrashHook | null = null;
let reported = 0;
const waiting: [CrashSource, string, string][] = [];
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

/** One stack line as a stable key: `fn@file.js:line:col` with the file's name only (no scheme, host, path or query). */
function frameKey(line: string): string {
  const t = line.trim();
  if (!/:\d+:\d+\)?$/.test(t)) return '';
  return t
    .replace(/^at\s+/, '')
    .replace(/[a-z][\w+.-]*:\/\/[^\s()]*\/([^\s()/?#]+)(?:[?#][^\s():]*)?/gi, '$1')
    .replace(/[^\w.$<>:@() -]/g, '')
    .slice(0, 120);
}

/**
 * 8 hex (FNV-1a 32) of the crash's top stack frames; with no usable stack, of its crash code. Same crash, same build:
 * same hash on every device. Nothing readable leaves: only the hash. Pure.
 */
export function stackHash(err: unknown): string {
  let stack = '';
  try {
    stack = err instanceof Error && typeof err.stack === 'string' ? err.stack : '';
  } catch {
    stack = '';
  }
  const frames = stack.split('\n').map(frameKey).filter(Boolean).slice(0, 8);
  const basis = frames.length ? frames.join('|') : crashCode(err);
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function send(source: CrashSource, msg: string, hash: string): void {
  try {
    hook?.(source, msg, hash);
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
  const hash = stackHash(err);
  if (hook) send(source, msg, hash);
  else waiting.push([source, msg, hash]);
  return true;
}

/** Set (or clear) the report hook; crashes that came before it go out now. */
export function setCrashHook(fn: CrashHook | null): void {
  hook = fn;
  if (!fn) return;
  for (const [source, msg, hash] of waiting.splice(0)) send(source, msg, hash);
}

export interface CrashProps {
  source: CrashSource;
  msg: string;
  screen: string;
  tier: string;
  sim: number;
  /** `stackHash`: where it broke, as 8 hex. */
  stack_hash?: string;
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
  return (source, msg, hash) => {
    if (sink.consent() === 'denied') return;
    const props: CrashProps = { source, msg, ...sink.context(), ...(hash && /^[0-9a-f]{8}$/.test(hash) ? { stack_hash: hash } : {}) };
    if (sink.post(props)) return;
    sink.track(props);
    sink.flush();
  };
}

/**
 * UX pass 2: embedded, the host has no close button any more (the lobby's Games button posts bridge `exit`), so the
 * crash panel carries its own way out: "Back to games" next to Reload whenever an exit is set (main.ts sets it from
 * the bridge, before the App boots). A crash that comes back on every reload no longer traps the player in the app.
 */
let exitFn: (() => boolean) | null = null;
let shownBox: HTMLElement | null = null;

/** Set (or clear) the crash panel's way out; an open panel gets (or loses) its button at once. */
export function setCrashExit(fn: (() => boolean) | null): void {
  exitFn = fn;
  if (shownBox) addExit(shownBox);
}

function addExit(box: HTMLElement): void {
  box.querySelector('.crash-exit')?.remove();
  if (!exitFn) return;
  const b = box.ownerDocument.createElement('button');
  b.type = 'button';
  b.className = 'crash-exit';
  b.textContent = 'Back to games';
  b.addEventListener('click', () => {
    // no host answer yet (no hello): the host page shows its own Back link while it waits
    if (!exitFn?.()) b.disabled = true;
  });
  box.querySelector('.crash-actions')?.appendChild(b);
}

export function showCrash(err: unknown, doc: Document = document): HTMLElement | null {
  if (shown) return null;
  shown = true;
  const box = doc.createElement('div');
  box.id = 'crash';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-label', 'The game stopped');
  box.innerHTML =
    '<div class="crash-card"><h2>Oops, the game tripped over its tail.</h2><p class="crash-msg"></p><div class="crash-actions"><button type="button" class="crash-reload">Reload</button></div></div>';
  (box.querySelector('.crash-msg') as HTMLElement).textContent = crashMessage(err);
  box.querySelector('.crash-reload')!.addEventListener('click', () => location.reload());
  addExit(box);
  doc.body.appendChild(box);
  shownBox = box;
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
  shownBox = null;
  exitFn = null;
  hook = null;
  reported = 0;
  waiting.length = 0;
}
