/**
 * Tab is a game key (the scoreboard in a match), never focus traversal (founder, Nov 19: no focus ring and no Tab
 * walk over the buttons). One window capture listener, installed at boot, cancels the browser's Tab unless a text
 * field has focus: Tab still moves between the fields of a form (the chat composer, the nickname, the add-friend
 * code). It never stops propagation, so the scoreboard and the dialogs' own handlers still see the key; a dialog's
 * Tab trap returns when `defaultPrevented` is set (it must not move focus either).
 */
const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

/** A field that takes typed text (or a select): Tab keeps its browser meaning there. Pure. */
export function tabKeepsFocusMove(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.tagName === 'INPUT') return !NOT_TEXT.has((el.type ?? 'text').toLowerCase());
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
}

export function installTabGuard(win: Window = window): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab' && !tabKeepsFocusMove(e.target)) e.preventDefault();
  };
  win.addEventListener('keydown', onKey, true);
  return () => win.removeEventListener('keydown', onKey, true);
}
