/**
 * Crash overlay: any uncaught error or rejected promise shows a small panel with a Reload button instead of a
 * frozen canvas. The message is shortened; no stack, no token, nothing personal is shown or sent.
 */
let shown = false;

export function crashMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
  const one = raw.split('\n')[0].trim() || 'Unknown error';
  return one.length > 160 ? `${one.slice(0, 157)}...` : one;
}

export function showCrash(err: unknown, doc: Document = document): HTMLElement | null {
  if (shown) return null;
  shown = true;
  const box = doc.createElement('div');
  box.id = 'crash';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-label', 'The game stopped');
  box.innerHTML = '<div class="crash-card"><h2>Oops, the game tripped over its tail.</h2><p class="crash-msg"></p><button type="button">Reload</button></div>';
  (box.querySelector('.crash-msg') as HTMLElement).textContent = crashMessage(err);
  box.querySelector('button')!.addEventListener('click', () => location.reload());
  doc.body.appendChild(box);
  return box;
}

export function installCrashOverlay(win: Window = window): void {
  win.addEventListener('error', (e) => showCrash(e.error ?? e.message));
  win.addEventListener('unhandledrejection', (e) => showCrash(e.reason));
}

/** Tests only. */
export function resetCrashForTests(): void {
  shown = false;
}
