/**
 * PWA (GDD 8 "return reasons without an app"): service worker registration and Add to Home Screen.
 *
 * - The worker (`public/sw.js`, plain JS) is registered as `sw.js?v=<build id>`, so each build gets its own
 *   cache; skipped in dev (Vite serves modules) and in in-app browsers (TikTok/IG webviews drop it anyway).
 * - A2HS is offered only after the 2nd daily ranked run (day records), never in the first session. Chrome
 *   gives `beforeinstallprompt` (captured early and deferred); iOS Safari has no prompt, so `ios: true` tells
 *   the UI to show the "Share -> Add to Home Screen" tip. Already installed (standalone) = not available.
 * Nothing here touches window/navigator at module top level. Never throws.
 */
import type { AnalyticsEvent, AnalyticsProps, EnvInfo } from '../types';

export const A2HS_MIN_DAILIES = 2;

interface InstallPromptEvent {
  preventDefault(): void;
  prompt(): Promise<unknown> | void;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface WinLike {
  addEventListener?(type: string, fn: (e: unknown) => void): void;
  matchMedia?(q: string): { matches: boolean };
  navigator?: { standalone?: boolean; serviceWorker?: { register(url: string, opts?: { scope?: string }): Promise<unknown> } };
  document?: { readyState?: string };
  location?: { pathname?: string };
}

/**
 * Registration scope: the deploy base, except for a page served under `/badcat/*` (Next rewrites to the
 * `/badcat-game/` build), which registers with scope `/badcat/` so the worker controls those navigations too
 * (the host sends `Service-Worker-Allowed: /badcat/`).
 */
export function swScope(base: string, pathname: string | undefined): string {
  if (base === '/badcat-game/' && typeof pathname === 'string' && /^\/badcat(\/|$)/.test(pathname)) return '/badcat/';
  return base;
}

export function buildId(): string {
  try {
    const v = (import.meta.env as Record<string, unknown>).VITE_BADCAT_BUILD;
    return typeof v === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(v) ? v : 'dev';
  } catch {
    return 'dev';
  }
}

export function baseUrl(): string {
  try {
    const b = import.meta.env.BASE_URL;
    return typeof b === 'string' && b ? b : './';
  } catch {
    return './';
  }
}

/** `sw.js?v=<build>` under the deploy base (scope = the base). */
export function swUrl(base = baseUrl(), build = buildId()): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}sw.js?v=${encodeURIComponent(build)}`;
}

/** Why the worker is (not) registered; pure, for tests. */
export function swSkipReason(env: Pick<EnvInfo, 'dev' | 'inApp'>, hasSw: boolean): 'dev' | 'in-app' | 'unsupported' | null {
  if (env.dev) return 'dev';
  if (env.inApp !== 'none') return 'in-app';
  if (!hasSw) return 'unsupported';
  return null;
}

/** Register the worker after load. Returns false when skipped. */
export function registerServiceWorker(env: Pick<EnvInfo, 'dev' | 'inApp'>, win: WinLike | undefined = globalThis as unknown as WinLike): boolean {
  try {
    const sw = win?.navigator?.serviceWorker;
    if (swSkipReason(env, !!sw && typeof sw.register === 'function')) return false;
    const base = baseUrl();
    const go = () => {
      try {
        void sw!.register(swUrl(base), { scope: swScope(base, win?.location?.pathname) }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    };
    if (win?.document?.readyState === 'complete' || typeof win?.addEventListener !== 'function') go();
    else win.addEventListener('load', go);
    return true;
  } catch {
    return false;
  }
}

export interface A2hsState {
  available: boolean;
  ios: boolean;
  prompt(): Promise<boolean>;
}

export interface A2hsController {
  /** Current state; `dailies` = ranked daily runs recorded on this device. */
  state(dailies: number): A2hsState;
  /** Test hook: hand in a captured beforeinstallprompt. */
  capture(e: unknown): void;
  installed(): boolean;
}

/**
 * Captures `beforeinstallprompt` (call once at boot). `track` receives `bc_a2hs` {shown, accepted}.
 */
export function createA2hs(
  env: Pick<EnvInfo, 'isIOS' | 'inApp'>,
  opts: { win?: WinLike; track?: (e: AnalyticsEvent, p?: AnalyticsProps) => void } = {},
): A2hsController {
  const win = opts.win ?? (globalThis as unknown as WinLike);
  let deferred: InstallPromptEvent | null = null;
  let done = false;
  const standalone = (): boolean => {
    try {
      if (win?.navigator?.standalone === true) return true;
      return !!win?.matchMedia?.('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  };
  const capture = (e: unknown) => {
    try {
      const ev = e as InstallPromptEvent;
      if (!ev || typeof ev.prompt !== 'function') return;
      ev.preventDefault?.();
      deferred = ev;
    } catch {
      /* ignore */
    }
  };
  try {
    win?.addEventListener?.('beforeinstallprompt', capture);
    win?.addEventListener?.('appinstalled', () => {
      done = true;
      deferred = null;
    });
  } catch {
    /* ignore */
  }
  const send = (p: AnalyticsProps) => {
    try {
      opts.track?.('bc_a2hs', p);
    } catch {
      /* ignore */
    }
  };
  return {
    capture,
    installed: () => done || standalone(),
    state(dailies: number): A2hsState {
      const ios = env.isIOS && env.inApp === 'none';
      const eligible = dailies >= A2HS_MIN_DAILIES && !done && !standalone();
      const available = eligible && (ios || deferred !== null);
      return {
        available,
        ios,
        async prompt(): Promise<boolean> {
          if (!available) return false;
          if (ios || !deferred) {
            send({ shown: true, accepted: false, method: 'ios_tip' });
            return false;
          }
          const ev = deferred;
          deferred = null; // a prompt event can be used once
          try {
            await ev.prompt();
            const choice = ev.userChoice ? await ev.userChoice : { outcome: 'dismissed' as const };
            const accepted = choice.outcome === 'accepted';
            if (accepted) done = true;
            send({ shown: true, accepted, method: 'prompt' });
            return accepted;
          } catch {
            send({ shown: true, accepted: false, method: 'prompt' });
            return false;
          }
        },
      };
    },
  };
}
