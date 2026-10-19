import { useEffect, useRef } from "react";
import s from "./feed.module.scss";

/** How far through `el` the reader is, 0..1 (top of the article at the top of the view = 0). */
export function readProgress(rect: { top: number; height: number }, viewport: number): number {
  const total = rect.height - viewport;
  if (total <= 0) return rect.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -rect.top / total));
}

/**
 * A thin gold bar under the header that fills as the article is read. One rAF per scroll frame,
 * transform only (no layout); decorative, so hidden from assistive tech.
 */
export const ReadingProgress = ({ targetId }: { targetId: string }) => {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = document.getElementById(targetId);
      if (!el || !bar.current) return;
      const p = readProgress(el.getBoundingClientRect(), window.innerHeight);
      bar.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId]);
  return <div ref={bar} className={s.progress} aria-hidden="true" data-testid="reading-progress" />;
};
