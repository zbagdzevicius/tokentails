/**
 * The notifications card (docs/plans/moba/SHARE-PUSH.md §2): after a win, never on the first launch, at most twice a
 * week apart (social/push.ts `shouldAsk`). The game's own question first; the browser's prompt only after "Turn on".
 * Same corner and look as the offer card (one card at a time), so the results screen layout never changes.
 */
export interface PushAskOpts {
  /** Straight from the tap (the browser's permission prompt needs the gesture): the note to show, or null when on. */
  onYes(): Promise<string | null>;
  onNo(): void;
  onClose?(): void;
}

export function pushAskCard(parent: HTMLElement, o: PushAskOpts): { el: HTMLElement; close(): void } {
  const root = document.createElement('div');
  root.className = 'pl-offer pl-pushask';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Notifications');
  root.dataset.testid = 'push-ask';
  root.innerHTML = `<button class="x" data-a="close" aria-label="Close">✕</button>
    <b class="head">Never miss a match</b>
    <p>A ping when a friend invites you, your club chest fills, ranked opens or a new event starts. Quiet at night; turn any of them off in Settings.</p>
    <div class="acts"><button class="pl-btn ghost small" data-a="no">Not now</button><button class="pl-btn small" data-a="yes" data-testid="push-yes">Turn on</button></div>
    <small class="note" aria-live="polite"></small>`;
  const note = root.querySelector<HTMLElement>('.note')!;
  const close = (): void => {
    if (!root.isConnected) return;
    root.remove();
    o.onClose?.();
  };
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'close' || a === 'no') {
      o.onNo();
      close();
    } else if (a === 'yes') {
      root.querySelectorAll('button').forEach((b) => (b.disabled = true));
      void o.onYes().then((msg) => {
        if (!msg) return close();
        note.textContent = msg;
        setTimeout(close, 2600);
      });
    }
  });
  parent.appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));
  return { el: root, close };
}
