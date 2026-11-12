/**
 * `/pawlegends` page zoom lock. The game guards its own iframe document (pawlegends/src/app/noZoom.ts); this keeps
 * the host page from zooming too: a pinch whose gesture reaches the top page, or a double tap on the safe-area
 * margins around the iframe. iOS Safari ignores `user-scalable=no`, so the viewport meta (PAWLEGENDS_VIEWPORT on the
 * page) is backed by `touch-action` on `<html>`/`<body>` and WebKit gesture guards. Scoped to this page: everything
 * is restored on unmount, other routes keep pinch zoom (WCAG 1.4.4). No double-tap touchend guard here, so the
 * sheets' buttons and the email field keep native taps.
 */
export const PAWLEGENDS_VIEWPORT =
  "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no";

const GESTURES = ["gesturestart", "gesturechange", "gestureend"] as const;
/** Pan only (no pinch, no double-tap zoom) and no rubber-band, on `<html>` and `<body>`. */
const LOCK = [
  ["touch-action", "pan-x pan-y"],
  ["overscroll-behavior", "none"],
] as const;

export function lockPageZoom(doc: Document = document): () => void {
  const els = [doc.documentElement, doc.body].filter(Boolean) as HTMLElement[];
  const saved = els.map((el) => LOCK.map(([prop]) => el.style.getPropertyValue(prop)));
  for (const el of els) for (const [prop, value] of LOCK) el.style.setProperty(prop, value);
  const block = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  const pinch = (e: Event) => {
    if (((e as TouchEvent).touches?.length ?? 0) > 1) block(e);
  };
  const opts = { passive: false, capture: true } as const;
  for (const g of GESTURES) doc.addEventListener(g, block, opts);
  doc.addEventListener("touchmove", pinch, opts);
  return () => {
    for (const g of GESTURES) doc.removeEventListener(g, block, { capture: true });
    doc.removeEventListener("touchmove", pinch, { capture: true });
    els.forEach((el, i) =>
      LOCK.forEach(([prop], j) => (saved[i][j] ? el.style.setProperty(prop, saved[i][j]) : el.style.removeProperty(prop)))
    );
  };
}
