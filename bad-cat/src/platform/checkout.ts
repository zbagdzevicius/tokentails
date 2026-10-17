/**
 * Pre-sale checkout (GDD 9): opens the Stripe Payment Link from VITE_BADCAT_PRESALE_URL. No server in this
 * build; when the flag is unset the button is hidden (`presaleUrl()` is null) and `openPresale` is a no-op.
 */
import type { AnalyticsEvent, AnalyticsProps } from '../types';
import { sanitizePresaleUrl } from './env';

export interface OpenTarget {
  open?(url: string, target?: string, features?: string): unknown;
  location?: { assign?(url: string): void; href?: string };
}

/**
 * Opens the Payment Link in a new tab (falls back to same-tab navigation when popups are blocked, e.g.
 * in-app browsers). Returns true when a navigation was started.
 */
export function openPresale(
  rawUrl: string | null | undefined,
  opts: { source?: string; track?: (e: AnalyticsEvent, p?: AnalyticsProps) => void; win?: OpenTarget } = {},
): boolean {
  const url = sanitizePresaleUrl(rawUrl ?? undefined);
  if (!url) return false;
  try {
    opts.track?.('bc_checkout_start', { source: opts.source ?? 'unknown' });
  } catch {
    /* ignore */
  }
  const win = opts.win ?? (globalThis as unknown as OpenTarget);
  try {
    // No 'noopener' feature: with it window.open always returns null, so the fallback below would also
    // navigate this tab away. Cut the opener by hand instead.
    const w = typeof win.open === 'function' ? (win.open(url, '_blank') as { opener?: unknown } | null) : null;
    if (w) {
      try {
        w.opener = null;
      } catch {
        /* cross-origin already */
      }
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (win.location?.assign) {
      win.location.assign(url);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
