/**
 * Arc week: the rave focuses on the Arc ecosystem (Arc Network, Circle's L1) for a configured window.
 * During it the HUD shows a "LIVE ON Arc" badge with the official Arc logo and the DJ booth's front panel
 * carries the same logo; outside it both hide. Arc-first defaults (USDC tab on Arc, "paid on Arc" cards)
 * do not depend on the window.
 *
 * The logo files in public/brand/ are the official, unmodified Circle Brand Kit files (SOURCE.md there has
 * the URLs and the usage terms). Never redraw, recolor or put effects on them.
 */

/** The window, inclusive of both ends (UTC). Change these two lines to move or extend Arc week. */
export const ARC_WEEK = Object.freeze({
  start: '2026-10-16T00:00:00Z',
  end: '2026-10-23T23:59:00Z',
});

/** Arc mainnet and Arc testnet. */
export const ARC_CHAIN_IDS: readonly number[] = Object.freeze([5042, 5042002]);
export const isArcChain = (chainId: number | null | undefined): boolean => chainId !== null && chainId !== undefined && ARC_CHAIN_IDS.includes(chainId);

/** Official white Arc logo (Circle Brand Kit, Arc_Logo_White), 500 x 171 viewBox / 1000 x 342 PNG. */
export const ARC_LOGO_SVG = 'brand/arc-logo-white.svg';
export const ARC_LOGO_PNG = 'brand/arc-logo-white.png';
/** Width / height of the logo artwork. */
export const ARC_LOGO_ASPECT = 500 / 171;
export const ARC_TRADEMARK = 'Arc is a trademark of Circle Internet Group, Inc. and/or its affiliates.';

/** A public file under the Vite base (`/rave/` on tokentails.com, `./` for a plain build). */
export function brandUrl(path: string, base: string = import.meta.env.BASE_URL ?? './'): string {
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

export interface ArcWindow {
  start: string;
  end: string;
}

/** Is `now` inside the window? A malformed window is never active. */
export function arcWeekActive(now: Date | number, win: ArcWindow = ARC_WEEK): boolean {
  const t = typeof now === 'number' ? now : now.getTime();
  const a = Date.parse(win.start);
  const b = Date.parse(win.end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t) || b < a) return false;
  return t >= a && t <= b;
}

/** `?arc=1` / `?arc=0` forces the Arc week look on or off (previews, screenshots); null otherwise. */
export function arcWeekOverride(search: string): boolean | null {
  const v = new URLSearchParams(search).get('arc');
  if (v === null) return null;
  if (['1', 'true', 'on', 'yes'].includes(v.toLowerCase())) return true;
  if (['0', 'false', 'off', 'no'].includes(v.toLowerCase())) return false;
  return null;
}

/** Milliseconds until the window next opens or closes from `now` (null when it never changes again). */
export function msToNextArcChange(now: number, win: ArcWindow = ARC_WEEK): number | null {
  const a = Date.parse(win.start);
  const b = Date.parse(win.end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (now < a) return a - now;
  if (now <= b) return b - now + 1;
  return null;
}
