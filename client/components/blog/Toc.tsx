import type { TocItem } from "@/lib/feed/engine";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./feed.module.scss";

/** The reading line: a heading counts as "being read" once its top passes this far down the view. */
export const SPY_OFFSET = 140;

/** Fewer entries than this and the article shows no contents list (a short post reads fine without). */
export const MIN_TOC_ITEMS = 4;

/** The id of the section being read: the last heading whose top is above the reading line. */
export function activeHeading(tops: { id: string; top: number }[], offset = SPY_OFFSET): string | null {
  let current: string | null = null;
  for (const h of tops) {
    if (h.top - offset <= 0) current = h.id;
    else break;
  }
  return current ?? tops[0]?.id ?? null;
}

/** Scroll-spy over the article headings: one rAF per scroll frame, reads only. */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const tops = list
        .map((id) => {
          const el = document.getElementById(id);
          return el ? { id, top: el.getBoundingClientRect().top } : null;
        })
        .filter((x): x is { id: string; top: number } => !!x);
      setActive(activeHeading(tops));
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
  }, [key]);
  return active;
}

// useLayoutEffect warns during SSR; the rail is positioned only in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const TocList = ({ items, active, onPick, rail }: { items: TocItem[]; active: string | null; onPick?: () => void; rail?: boolean }) => {
  const list = useRef<HTMLOListElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useIsoLayoutEffect(() => {
    if (!rail || !list.current || !bar.current) return;
    const link = active ? Array.from(list.current.querySelectorAll<HTMLElement>("a")).find((a) => a.getAttribute("href") === `#${active}`) : null;
    if (!link) {
      bar.current.style.opacity = "0";
      return;
    }
    bar.current.style.opacity = "1";
    bar.current.style.height = `${link.offsetHeight}px`;
    bar.current.style.transform = `translateY(${link.offsetTop}px)`;
  }, [active, rail]);
  return (
    <ol ref={list} className="relative space-y-0.5">
      {rail && <span ref={bar} aria-hidden="true" className={s.tocRail} style={{ opacity: 0 }} />}
      {items.map((item) => (
        <li key={item.id} className={item.level === 3 ? "pl-4" : undefined}>
          <a
            href={`#${item.id}`}
            className={clsx(s.tocLink, item.level === 3 ? "text-[0.95rem]" : "text-[1rem]", "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--link))]")}
            aria-current={active === item.id ? "location" : undefined}
            onClick={onPick}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
};

/**
 * "On this page": a sticky list with a sliding rail on wide screens, a collapsible panel on phones.
 * Hidden when the article has fewer than MIN_TOC_ITEMS entries.
 */
export const Toc = ({ items, variant }: { items: TocItem[]; variant: "sidebar" | "inline" }) => {
  const active = useScrollSpy(items.map((i) => i.id));
  const details = useRef<HTMLDetailsElement>(null);
  if (items.length < MIN_TOC_ITEMS) return null;
  if (variant === "sidebar") {
    return (
      <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-6 pr-2" data-testid="toc-sidebar">
        <p className="mb-3 px-3 font-sans text-p6 font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">On this page</p>
        <TocList items={items} active={active} rail />
      </nav>
    );
  }
  return (
    <nav aria-label="On this page" className="mb-8" data-testid="toc-inline">
      <details ref={details} className={clsx(s.details, "rounded-2xl bg-white/70 ring-1 ring-[rgb(var(--line)/0.1)]")}>
        <summary className="flex min-h-12 items-center justify-between gap-3 px-4 font-sans text-p5 font-extrabold text-[rgb(var(--ink))]">
          On this page
          <ChevronDown aria-hidden="true" className={clsx(s.chevron, "h-5 w-5")} />
        </summary>
        <div className="px-2 pb-3">
          <TocList
            items={items}
            active={active}
            onPick={() => {
              if (details.current) details.current.open = false;
            }}
          />
        </div>
      </details>
    </nav>
  );
};
