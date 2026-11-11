/**
 * The Android back button and back gesture (docs/plans/moba/PLAY-STORE.md "Back"). Without a listener Capacitor
 * goes back in the WebView history or closes the app, and the game only uses history.replaceState: one back swipe
 * in a match would quit the app. With @capacitor/app's `backButton` listener registered, the default is off and the
 * shell maps back to what the game already does with Escape:
 *
 * - any open dialog, sheet or menu (settings, cards, champion browser, party, store, quests) closes: Escape;
 * - in a match Escape opens the pause menu (config.js `pause`), on the pick screen it goes back, on results it
 *   leaves the scoreboard view;
 * - on the bare title screen the app goes to the background (App.minimizeApp, never exitApp: a quick return keeps
 *   the WebView and the party seat).
 */

export type BackAction = 'escape' | 'minimize';

/** Open overlays on the title (the lobby's own overlayOpen list in pawlegends/src/ui/lobby/lobbyScreen.ts, plus the party panel and the open quests list). */
export const OVERLAY_SELECTOR = '.pl-menu, [aria-modal="true"], .pl-store, .plc-meet, .pl-offer, .pl-party, .lb-quests[open]';

export function backAction(o: { screen: string | undefined; overlayOpen: boolean }): BackAction {
  if (o.screen && o.screen !== 'title') return 'escape';
  return o.overlayOpen ? 'escape' : 'minimize';
}

/** A synthetic Escape press (keydown then keyup, so the game's Input never sees a held key) on the focused element. */
export function pressEscape(doc: Document): void {
  const target: EventTarget = (doc.activeElement as HTMLElement | null) ?? doc.body ?? doc;
  const init: KeyboardEventInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true } as KeyboardEventInit;
  const View = doc.defaultView?.KeyboardEvent ?? KeyboardEvent;
  target.dispatchEvent(new View('keydown', init));
  target.dispatchEvent(new View('keyup', init));
}

/** Handle one back press: Escape into the game, or `minimize` on the bare title. Returns what it did. */
export function handleBack(doc: Document, minimize: () => unknown): BackAction {
  const action = backAction({ screen: doc.documentElement.dataset.screen, overlayOpen: !!doc.querySelector(OVERLAY_SELECTOR) });
  if (action === 'escape') pressEscape(doc);
  else void Promise.resolve(minimize()).catch(() => undefined);
  return action;
}
