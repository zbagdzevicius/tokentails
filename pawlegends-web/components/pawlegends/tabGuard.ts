/**
 * `/play` Tab guard (founder, Nov 19: no focus ring and no Tab walk over the buttons). The game cancels Tab inside its
 * own iframe (pawlegends/src/input/tabGuard.ts); this does the same on the host page, so Tab from the top page does
 * not walk the consent banner and then land on the game's first button. Tab still moves between text fields (the
 * sign-in sheet's email field). Removed on unmount, other routes keep Tab.
 */
const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"]);

/** A field that takes typed text (or a select): Tab keeps its browser meaning there. Pure. */
export function tabKeepsFocusMove(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.tagName === "INPUT") return !NOT_TEXT.has((el.type ?? "text").toLowerCase());
  return el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

export function installTabGuard(win: Window = window): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Tab" && !tabKeepsFocusMove(e.target)) e.preventDefault();
  };
  win.addEventListener("keydown", onKey, true);
  return () => win.removeEventListener("keydown", onKey, true);
}
