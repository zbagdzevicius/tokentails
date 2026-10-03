import { isApp } from "@/models/app";

/**
 * RELOAD from a crash fallback (F9). App builds do a full navigation to
 * "/", the route Capacitor boots index.html on, and leave routing to
 * AppRouteRestore from there. A plain reload of a deep path would boot
 * index.html and restore the same crashing route, which can loop. The web
 * reloads the current page.
 */
export function reloadApp(
  location: Pick<Location, "assign" | "reload"> = window.location,
  app: boolean = isApp,
): void {
  try {
    if (app) location.assign("/");
    else location.reload();
  } catch {
    // Nothing else to try from a fallback.
  }
}
