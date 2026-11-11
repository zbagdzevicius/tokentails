/**
 * The release watermark on the title screen (never in a match): a small, low-contrast line in the bottom-right corner,
 * e.g. "v0.1.0 · build 20261111-1530 · a1b2c3d · sim 20 · web", so a screenshot or a bug report names the release.
 * In the native app it also names the shell ("iOS 1.1.0 (42)") and the over-the-air bundle the updater runs
 * ("ota builtin" or "ota 20261111153000-a1b2c3d").
 *
 * Everything is baked at build time (vite.config.ts `__PL_BUILD__`: package version, git short sha, UTC build time;
 * SIM_VERSION from the sim) except the native part, which the app shell publishes as `window.__PL_APP_INFO__` and
 * announces with a `pl:appinfo` event (pawlegends-app/src/shell/main.ts). Nothing is fetched.
 *
 * A tap or click copies the full line to the clipboard for a bug report; when the clipboard is not allowed, nothing
 * happens. Cosmetic only.
 */
import { SIM_VERSION } from '../sim/version';
import { shellPlatform, type ShellPlatform } from '../app/platform';

/** What vite.config.ts bakes in (`__PL_BUILD__`). */
export interface BuildInfo {
  /** pawlegends/package.json version. */
  version: string;
  /** git short sha of the built commit ("local" outside a checkout). */
  sha: string;
  /** UTC build time, ISO 8601. */
  builtAt: string;
}

/** What the app shell publishes (`window.__PL_APP_INFO__`). */
export interface AppInfo {
  /** Native app version (App.getInfo().version), "1.1.0". */
  native?: string;
  /** Native build number (App.getInfo().build), "42". */
  nativeBuild?: string;
  /** The updater's active bundle: "builtin", or the OTA bundle version "20261111153000-a1b2c3d". */
  ota?: string;
}

export interface VersionParts extends BuildInfo {
  sim: number;
  platform: ShellPlatform | null;
  app?: AppInfo | null;
}

export const APP_INFO_EVENT = 'pl:appinfo';

const PLATFORM_NAME: Readonly<Record<ShellPlatform, string>> = Object.freeze({ ios: 'iOS', android: 'Android', mac: 'macOS' });

/** Keep host and shell strings short and printable (they are shown and copied, never parsed). */
const clean = (s: unknown, max = 40): string =>
  typeof s === 'string' || typeof s === 'number' ? String(s).replace(/[^0-9A-Za-z._+-]/g, '').slice(0, max) : '';

/** "2026-11-11T15:30:12.000Z" → "20261111-1530" (UTC). An unreadable time → "". */
export function buildStamp(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/**
 * The full watermark line. Web: "v0.1.0 · build 20261111-1530 · a1b2c3d · sim 20 · web". App: "… · sim 20 · iOS 1.1.0
 * (42) · ota builtin". Missing parts are left out, never shown as "undefined".
 */
export function formatVersion(v: VersionParts): string {
  const out: string[] = [];
  const version = clean(v.version, 20);
  out.push(version ? `v${version}` : 'v?');
  const stamp = buildStamp(v.builtAt);
  if (stamp) out.push(`build ${stamp}`);
  const sha = clean(v.sha, 12).toLowerCase();
  if (sha) out.push(sha);
  if (Number.isInteger(v.sim)) out.push(`sim ${v.sim}`);
  if (!v.platform) {
    out.push('web');
    return out.join(' · ');
  }
  const native = clean(v.app?.native, 20);
  const nb = clean(v.app?.nativeBuild, 12);
  out.push(`${PLATFORM_NAME[v.platform]}${native ? ` ${native}` : ''}${native && nb ? ` (${nb})` : ''}`);
  const ota = clean(v.app?.ota);
  if (ota) out.push(`ota ${ota}`);
  return out.join(' · ');
}

/** The baked build info (falls back when the define is absent: unit tests, the soak harness). */
export function buildInfo(): BuildInfo {
  const b = typeof __PL_BUILD__ !== 'undefined' ? __PL_BUILD__ : null;
  return { version: b?.version ?? '0.0.0', sha: b?.sha ?? 'dev', builtAt: b?.builtAt ?? '' };
}

/** The shell's native info, if it has published it yet. Never throws. */
export function appInfo(w: unknown = typeof window !== 'undefined' ? window : undefined): AppInfo | null {
  try {
    const i = (w as { __PL_APP_INFO__?: unknown } | undefined)?.__PL_APP_INFO__;
    return i && typeof i === 'object' ? (i as AppInfo) : null;
  } catch {
    return null;
  }
}

/** The line for this page now. */
export function versionLine(): string {
  return formatVersion({ ...buildInfo(), sim: SIM_VERSION, platform: shellPlatform(), app: appInfo() });
}

const escAttr = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The watermark button (lobby.css `.lb-ver`). */
export function versionMarkHtml(line: string = versionLine()): string {
  const s = escAttr(line);
  return `<button type="button" class="lb-ver" data-testid="version-mark" aria-label="Version ${s}. Copy" title="${s} (tap to copy)"><span>${s}</span></button>`;
}

/**
 * Wire the watermark in `root`: a click copies the line (fails silently), and the native info updates it when the
 * shell publishes it after the title is up. `signal` removes the listener with the screen.
 */
export function bindVersionMark(root: HTMLElement, signal?: AbortSignal): void {
  const el = root.querySelector<HTMLButtonElement>('.lb-ver');
  if (!el) return;
  const text = el.querySelector('span');
  let line = versionLine();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const show = (): void => {
    if (text) text.textContent = line;
    el.title = `${line} (tap to copy)`;
    el.setAttribute('aria-label', `Version ${line}. Copy`);
  };
  el.addEventListener(
    'click',
    (e) => {
      e.stopPropagation();
      try {
        const clip = navigator.clipboard;
        if (!clip?.writeText) return;
        void clip.writeText(line).then(
          () => {
            if (!text) return;
            text.textContent = 'Copied';
            el.dataset.copied = '1';
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              delete el.dataset.copied;
              show();
            }, 1200);
          },
          () => undefined,
        );
      } catch {
        /* no clipboard here: nothing to do */
      }
    },
    signal ? { signal } : undefined,
  );
  if (typeof window !== 'undefined')
    window.addEventListener(
      APP_INFO_EVENT,
      () => {
        if (!el.isConnected) return;
        line = versionLine();
        if (!el.dataset.copied) show();
      },
      signal ? { signal } : undefined,
    );
}
