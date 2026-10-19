import { Footer } from "@/layouts/Footer";
import { FEED_CATEGORIES } from "@/lib/feed/view";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import s from "./feed.module.scss";
import { ReadingProgress } from "./ReadingProgress";

export interface BlogFrameProps {
  children: ReactNode;
  /** Category slugs that have articles in this build (others are not linked). */
  liveCategories: string[];
  /** Article pages: the reading progress bar under the header. */
  progressTarget?: string;
}

/**
 * The blog's chrome: a slim sticky night header (logo, sections, one Play button), the paper page
 * and the night footer. One `<main>`, a skip link, and no layout shift (the header has a fixed
 * height on every breakpoint).
 */
export const BlogFrame = ({ children, liveCategories, progressTarget }: BlogFrameProps) => {
  const router = useRouter();
  const current = router.asPath.split(/[?#]/)[0];
  const sections = FEED_CATEGORIES.filter((c) => liveCategories.includes(c.slug));
  return (
    <div className={s.page}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.header}>
        <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-3 px-4 md:h-[4.5rem] md:px-8">
          {/* Plain anchor: the landing loads its own heavy scenes, a full load keeps them clean. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400" aria-label="Token Tails home">
            <img src="/logo/logo-text.webp" alt="Token Tails" width={600} height={337} className="h-10 w-auto md:h-12" draggable={false} />
          </a>
          <Link
            href="/feed"
            className={clsx(
              "hidden shrink-0 rounded-full px-3 py-2 font-primary text-p5 uppercase tracking-wide transition-colors sm:inline-flex",
              current === "/feed" ? "bg-tt-cream/15 text-tt-gold-400" : "text-tt-cream/85 hover:text-tt-cream"
            )}
            aria-current={current === "/feed" ? "page" : undefined}
          >
            Blog
          </Link>
          <nav aria-label="Blog sections" className={clsx("min-w-0 flex-1 overflow-x-auto", s.navScroll)}>
            <ul className="flex items-center gap-1 pr-6">
              {sections.map((c) => {
                const href = `/feed/${c.slug}`;
                const active = current === href || current.startsWith(`${href}/`);
                return (
                  <li key={c.slug} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "inline-flex min-h-11 items-center rounded-full px-3 font-sans text-p5 font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400",
                        active ? "bg-tt-cream/15 text-tt-gold-400" : "text-tt-cream/80 hover:bg-tt-cream/10 hover:text-tt-cream"
                      )}
                    >
                      {c.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Link
            href="/heist"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-tt-gold-400 px-4 font-primary text-p5 uppercase tracking-wide text-tt-gold-ink shadow-[0_0_18px_rgb(var(--tt-gold-400)/.35)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream"
          >
            <span className="hidden sm:inline">Play free</span>
            <span className="sm:hidden">Play</span>
          </Link>
        </div>
        {progressTarget && <ReadingProgress targetId={progressTarget} />}
      </header>
      <main id="main" className={clsx(s.enter, "outline-none")} tabIndex={-1}>
        {children}
      </main>
      <div className={s.night}>
        <Footer tone="night" />
      </div>
    </div>
  );
};
