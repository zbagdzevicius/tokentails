/**
 * Night scope gating (plan G6 "Scope gating", task 3d).
 *
 * Only the page background turns night on every route. Cream ink and `color-scheme: dark` apply
 * under `[data-sky]` on `<html>`, which is set for the routes below and nowhere else. Feed, cats,
 * stats, giveaway, 404 and the portrait pages stay out of scope: their light surfaces keep their
 * own ink.
 *
 * `_document.getInitialProps` writes the attribute into the server HTML (so the first paint is
 * already right) and `_app` keeps it in sync on client-side navigation. Both read this module,
 * so the route list lives in one place.
 *
 * Pure data and string helpers only: safe to import from `_document`, `_app` and tests.
 */

export type Sky = "night";

/** Route prefixes that render the night chrome. `/` matches only the landing itself. */
export const NIGHT_ROUTES: readonly string[] = [
  "/",
  "/packs",
  "/shelter-payouts",
  "/impact",
  "/heist",
  "/game",
];

/** Strips query, hash and a trailing slash: `/game/?x=1#y` -> `/game`. */
export function normalizePath(path: string | null | undefined): string {
  const bare = (path || "/").split(/[?#]/)[0] || "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") || "/" : bare;
}

function matches(path: string, prefix: string): boolean {
  if (prefix === "/") return path === "/";
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The sky for a route, or `null` when the route is out of scope. Accepts either the Next page
 * pattern (`/shelter-payouts/give`, `/feed/[category]`) or a visible path.
 */
export function skyForPath(path: string | null | undefined): Sky | null {
  const p = normalizePath(path);
  return NIGHT_ROUTES.some((prefix) => matches(p, prefix)) ? "night" : null;
}

/**
 * Pinch zoom stays on everywhere (WCAG 1.4.4) except in the game shell, where a pinch or a
 * double tap on the canvas would zoom the page instead of playing (plan G6 "Viewport").
 */
export function isZoomLocked(path: string | null | undefined): boolean {
  return matches(normalizePath(path), "/game");
}

const VIEWPORT_BASE = "width=device-width, initial-scale=1, viewport-fit=cover";

/** The `<meta name="viewport">` content for a route. */
export function viewportForPath(path: string | null | undefined): string {
  return isZoomLocked(path)
    ? `${VIEWPORT_BASE}, maximum-scale=1, user-scalable=no`
    : VIEWPORT_BASE;
}

/**
 * Applies the scope to `<html>` (client-side navigation). `data-sky` drives the cream ink and
 * colour scheme; `data-zoom="locked"` drives the game-only `touch-action` in globals.scss.
 */
export function applySkyScope(root: HTMLElement, path: string | null | undefined): void {
  const sky = skyForPath(path);
  if (sky) root.setAttribute("data-sky", sky);
  else root.removeAttribute("data-sky");
  if (isZoomLocked(path)) root.setAttribute("data-zoom", "locked");
  else root.removeAttribute("data-zoom");
}
