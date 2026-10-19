import { Footer } from "@/layouts/Footer";
import { FEED_CATEGORIES } from "@/lib/feed/view";
import clsx from "clsx";
import Head from "next/head";
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
 * and the night footer. The page's `<main>` is MainLayout's; the blog content sits in a focusable
 * `#main` div (the skip link's target). No layout shift: the header has a fixed height on every
 * breakpoint (phones get a second row for the sections, so none hides under the Play button).
 */
export const BlogFrame = ({ children, liveCategories, progressTarget }: BlogFrameProps) => {
  const router = useRouter();
  const current = router.asPath.split(/[?#]/)[0];
  const sections = FEED_CATEGORIES.filter((c) => liveCategories.includes(c.slug));
  const pill = (active: boolean) =>
    clsx(
      "inline-flex min-h-11 items-center rounded-full px-3 font-sans text-p5 font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400",
      active ? "bg-tt-cream/15 text-tt-gold-400" : "text-tt-cream/80 hover:bg-tt-cream/10 hover:text-tt-cream"
    );
  const sectionLinks = (withBlog: boolean) => (
    <ul className="flex items-center gap-1 pr-6">
      {withBlog && (
        <li className="shrink-0">
          <Link href="/feed" aria-current={current === "/feed" ? "page" : undefined} className={pill(current === "/feed")}>
            Blog
          </Link>
        </li>
      )}
      {sections.map((c) => {
        const href = `/feed/${c.slug}`;
        const active = current === href || current.startsWith(`${href}/`);
        return (
          <li key={c.slug} className="shrink-0">
            <Link href={href} aria-current={active ? "page" : undefined} className={pill(active)}>
              {c.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className={s.page}>
      <Head>
        {/* The night sky behind every blog hero is a CSS background: preload it so it paints with the first frame. */}
        <link rel="preload" as="image" href="/landing/card-bg.webp" type="image/webp" key="feed-stars" />
      </Head>
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
          <nav aria-label="Blog sections" className={clsx("hidden min-w-0 flex-1 overflow-x-auto sm:block", s.navScroll)}>
            {sectionLinks(false)}
          </nav>
          <span className="flex-1 sm:hidden" aria-hidden="true" />
          <Link
            href="/heist"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-tt-gold-400 px-4 font-primary text-p5 uppercase tracking-wide text-tt-gold-ink shadow-[0_0_18px_rgb(var(--tt-gold-400)/.35)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream"
          >
            <span className="hidden sm:inline">Play free</span>
            <span className="sm:hidden">Play</span>
          </Link>
        </div>
        <nav aria-label="Blog sections" className={clsx("-mt-1 h-12 overflow-x-auto px-2 sm:hidden", s.navScroll)}>
          {sectionLinks(true)}
        </nav>
        {progressTarget && <ReadingProgress targetId={progressTarget} />}
      </header>
      <div id="main" className="outline-none" tabIndex={-1}>
        {children}
      </div>
      <div className={s.night}>
        <Footer tone="night" />
      </div>
    </div>
  );
};
