/** RELOAD from a crash fallback (F9): reloads the current page. */
export function reloadApp(location: Pick<Location, "reload"> = window.location): void {
  try {
    location.reload();
  } catch {
    // Nothing else to try from a fallback.
  }
}
