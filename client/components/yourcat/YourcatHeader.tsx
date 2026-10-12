/**
 * The `/yourcat` header (docs/plans/yourcat-polish.md §2.1): the canonical Token Tails lockup (the
 * one painted into the landing hero), no live "TOKEN TAILS" text, the socials on md+. Transparent at
 * the top of the page; once scrolled it takes the night glass with a gold hairline. It hides on
 * scroll down and returns on scroll up with `translate-y` only (200 ms std; no transition under
 * reduced motion). 72 px tall on phones and 96 px on md+, so the page pads `pt-[76px] md:pt-[104px]`.
 * The shared `layouts/Header.tsx` is not used here.
 *
 * `aside` sits right of the logo (left of the socials on md+): the page puts the compact analytics
 * consent chip there (polish §15), so it is part of the header and never covers the page. While the
 * chip is shown the header never hides, so the question (and a reopened settings chip) stays on screen.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Socials } from "@/layouts/Socials";

/** Past this scroll offset the header takes its night background. */
export const HEADER_SCROLLED_AT = 8;
/** Below this offset the header never hides (its own height on phones). */
const HIDE_AFTER = 72;

export function YourcatHeader({ aside }: { aside?: ReactNode } = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      frameRef.current = null;
      const y = Math.max(0, window.scrollY || 0);
      const delta = y - lastYRef.current;
      lastYRef.current = y;
      setScrolled(y > HEADER_SCROLLED_AT);
      if (y <= HIDE_AFTER) setHidden(false);
      else if (delta > 2) setHidden(true);
      else if (delta < -2) setHidden(false);
    };
    const onScroll = () => {
      if (frameRef.current !== null) return;
      if (typeof requestAnimationFrame !== "function") return read();
      frameRef.current = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 py-2 transition-transform duration-200 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } [&:has([data-variant=compact])]:!translate-y-0 ${
        scrolled
          ? "border-b border-tt-gold-400/30 bg-tt-night-900/85 shadow-[0_4px_0_rgb(var(--tt-night-950))] backdrop-blur-sm"
          : "border-b border-transparent"
      }`}
      data-testid="yourcat-header"
      data-scrolled={scrolled ? "true" : "false"}
      data-hidden={hidden ? "true" : "false"}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 md:px-12">
        {/* Plain anchor on purpose: the landing is a full page load, as from the shared Header. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="block shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream"
          data-testid="yourcat-header-home"
        >
          <img
            src="/logo/logo-text.webp"
            srcSet="/yourcat/logo-text-320.webp 320w, /logo/logo-text.webp 600w"
            sizes="(min-width: 768px) 142px, 100px"
            width={600}
            height={337}
            alt="Token Tails"
            decoding="async"
            draggable={false}
            className="h-14 w-auto md:h-20"
          />
        </a>
        <div className="flex min-w-0 items-center justify-end gap-6">
          {aside}
          <div className="hidden md:block shrink-0" data-testid="yourcat-header-socials">
            <Socials />
          </div>
        </div>
      </div>
    </header>
  );
}
