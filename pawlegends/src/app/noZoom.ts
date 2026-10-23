/**
 * No page zoom on touch screens. iOS Safari ignores `maximum-scale` / `user-scalable=no` (since iOS 10) and, inside
 * the Token Tails iframe, does not reliably honour `touch-action` either, so a quick second tap on a button or the
 * canvas zoomed the page and a pinch zoomed it too. Document-level guards, installed once at boot:
 *  - `gesturestart/change/end` (WebKit pinch) and `touchmove` with two or more fingers: preventDefault.
 *  - two `touchend`s within DOUBLE_TAP_MS: the second is preventDefault-ed (no double-tap zoom). That also drops the
 *    browser's click, so a tap that did not move gets a synthetic click on its target instead: a fast second tap
 *    on a button still clicks. In-match controls use pointer events, which fire before touchend and are untouched.
 *  - `dblclick`: preventDefault.
 * Input only: the sim never sees any of this.
 */
export const DOUBLE_TAP_MS = 300;
/** A touch that moved further than this (CSS px) is a drag, not a tap: no synthetic click. */
export const TAP_SLOP_PX = 10;

export function installNoZoom(doc: Document = document, now: () => number = () => performance.now()): () => void {
  const off: Array<() => void> = [];
  const on = (type: string, fn: (e: Event) => void): void => {
    doc.addEventListener(type, fn, { passive: false, capture: true });
    off.push(() => doc.removeEventListener(type, fn, { capture: true }));
  };
  const block = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };
  for (const g of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) on(g, block);
  on('touchmove', (e) => {
    if (((e as TouchEvent).touches?.length ?? 0) > 1) block(e);
  });

  const starts = new Map<number, { x: number; y: number }>();
  on('touchstart', (e) => {
    for (const t of Array.from((e as TouchEvent).changedTouches ?? [])) starts.set(t.identifier, { x: t.clientX, y: t.clientY });
  });
  let lastEnd = -Infinity;
  on('touchend', (e) => {
    const te = e as TouchEvent;
    const t = now();
    const quick = t - lastEnd < DOUBLE_TAP_MS;
    lastEnd = t;
    const ended = Array.from(te.changedTouches ?? []);
    const first = ended[0];
    const start = first ? starts.get(first.identifier) : undefined;
    for (const c of ended) starts.delete(c.identifier);
    if (!quick || !e.cancelable) return;
    e.preventDefault();
    if (ended.length !== 1 || !first || !start) return;
    if (Math.hypot(first.clientX - start.x, first.clientY - start.y) > TAP_SLOP_PX) return;
    const target = first.target instanceof Element ? first.target : (e.target as Element | null);
    if (!target?.isConnected) return;
    const view = doc.defaultView;
    const MouseEv = view?.MouseEvent ?? MouseEvent;
    target.dispatchEvent(new MouseEv('click', { bubbles: true, cancelable: true, composed: true, view, clientX: first.clientX, clientY: first.clientY, detail: 1 }));
  });
  on('touchcancel', (e) => {
    for (const c of Array.from((e as TouchEvent).changedTouches ?? [])) starts.delete(c.identifier);
  });

  return () => {
    for (const f of off) f();
    starts.clear();
  };
}
