import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ModalTabs, type ModalTabsProps } from "./ModalTabs";

/**
 * ModalTabs with a visible "more this way" hint: when the row scrolls sideways (six tabs on a
 * 390 px phone), a chevron on a fade sits on the side that has more tabs, so half the tabs never
 * hide without a sign. The hint is decorative; the tabs stay reachable by swipe and arrow keys.
 *
 * `fadeFrom` is the background the fade blends into (the strip the tabs sit on).
 */
export function HintedTabs<T extends string>({
  fadeFrom = "from-tt-night-800",
  ...props
}: ModalTabsProps<T> & { fadeFrom?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const list = wrapRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) return;
    const update = () => {
      const left = list.scrollLeft > 4;
      const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 4;
      setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [props.tabs.length]);

  const edge =
    "pointer-events-none absolute bottom-1 top-1 flex w-10 items-center text-tt-gold-400 motion-safe:transition-opacity";
  return (
    <div ref={wrapRef} className="relative" data-more-left={more.left || undefined} data-more-right={more.right || undefined}>
      {/* Scroll padding keeps the selected tab clear of the hint when it scrolls into view. */}
      <ModalTabs {...props} className={clsx("scroll-px-10", props.className)} />
      <span
        aria-hidden="true"
        className={clsx(edge, "left-0 justify-start bg-gradient-to-r to-transparent", fadeFrom, more.left ? "opacity-100" : "opacity-0")}
      >
        <PixelIcon name="chevron-left" size={20} />
      </span>
      <span
        aria-hidden="true"
        className={clsx(edge, "right-0 justify-end bg-gradient-to-l to-transparent", fadeFrom, more.right ? "opacity-100" : "opacity-0")}
      >
        <PixelIcon name="chevron-right" size={20} />
      </span>
    </div>
  );
}

export default HintedTabs;
