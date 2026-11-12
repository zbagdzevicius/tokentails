import { useEffect, useState } from "react";

/**
 * A bottom fade for a scroll box while more content sits below the fold, so a clipped card reads
 * as "scroll for more" instead of as cut off (short landscape phones). Returns a callback ref for
 * the scroller and whether to fade; apply `SCROLL_FADE_CLASS` when it is true. A callback ref, so
 * a scroller that mounts later than the hook's component (inside a dialog's portal) is still seen.
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    if (!el) return;
    const update = () => setFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    Array.from(el.children).forEach((child) => observer?.observe(child));
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [el]);
  return [setEl, !!el && fade] as const;
}

/** The last 28 px of the box fade out (a mask, so it works over any background). Lives under
 * components/ so Tailwind (which scans components/, not hooks/) generates the classes. */
export const SCROLL_FADE_CLASS =
  "[-webkit-mask-image:linear-gradient(180deg,#000_calc(100%_-_28px),transparent)] [mask-image:linear-gradient(180deg,#000_calc(100%_-_28px),transparent)]";
