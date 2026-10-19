import type { FeedCategory, FeedSummary } from "@/lib/feed/engine";
import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArticleCard } from "./ArticleCard";
import { Breadcrumbs } from "./Breadcrumbs";
import { CtaCard } from "./CtaCard";
import s from "./feed.module.scss";
import { toneFor } from "./tone";

export interface CategoryViewProps {
  category: FeedCategory;
  articles: FeedSummary[];
  /** The other sections that have articles in this build. */
  others: FeedCategory[];
}

/** /feed/<category>: an indexable landing (h1 and intro), its articles newest first, then the other sections. */
export const CategoryView = ({ category, articles, others }: CategoryViewProps) => {
  const [lead, ...rest] = articles;
  return (
    <>
      <header className={clsx(s.night, "overflow-hidden pb-14 pt-8 md:pb-20 md:pt-14")}>
        <div className={s.stars} aria-hidden="true" />
        <div className={s.dusk} aria-hidden="true" />
        <div className={clsx(s.stagger, "mx-auto max-w-[80rem] px-4 md:px-8")}>
          <Breadcrumbs
            surface="night"
            items={[
              { name: "Blog", path: "/feed" },
              { name: category.name, path: `/feed/${category.slug}` },
            ]}
            style={{ "--i": 0 } as CSSProperties}
          />
          <p className="mt-6 inline-flex items-center gap-2 font-sans text-p6 font-extrabold uppercase tracking-[0.16em] text-tt-gold-400 md:text-p5" style={{ "--i": 1 } as CSSProperties}>
            <span aria-hidden="true" className={clsx("h-2.5 w-2.5 rounded-full", toneFor(category.slug).dot)} />
            {category.name}
          </p>
          <h1 className="mt-3 max-w-[22ch] font-primary text-[2.5rem] leading-[1.02] text-white [text-wrap:balance] md:text-[3.75rem]" style={{ "--i": 2 } as CSSProperties}>
            {category.headline}
          </h1>
          <p className="mt-5 max-w-[62ch] text-[1.1rem] leading-relaxed text-tt-cream/90 md:text-[1.25rem]" style={{ "--i": 3 } as CSSProperties}>
            {category.intro}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[80rem] px-4 pb-16 pt-10 md:px-8 md:pt-14">
        {lead ? (
          <>
            <ArticleCard article={lead} variant="feature" headingLevel={2} priority />
            {rest.length > 0 && (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a, i) => (
                  <ArticleCard key={a.slug} article={a} index={i} headingLevel={2} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-[1.5rem] bg-white/70 p-8 text-center text-[1.15rem] font-bold ring-1 ring-[rgb(var(--line)/0.1)]" data-testid="category-empty">
            New {category.name.toLowerCase()} articles are on their way.
          </p>
        )}

        {others.length > 0 && (
          <nav aria-label="Other sections" className="mt-16 border-t border-[rgb(var(--line)/0.1)] pt-8">
            <p className="mb-4 font-sans text-p6 font-extrabold uppercase tracking-[0.16em] text-[rgb(var(--muted))] md:text-p5">More from the blog</p>
            <ul className="flex flex-wrap gap-2">
              {others.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/feed/${c.slug}`}
                    className={clsx("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[1rem] font-extrabold transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", toneFor(c.slug).chip)}
                  >
                    {c.headline}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <section aria-label="What to do next" className={clsx(s.night, "overflow-hidden py-16 md:py-24")}>
        <div className={s.stars} aria-hidden="true" />
        <div className="mx-auto max-w-[68rem] px-4 md:px-8">
          <CtaCard cta={category.cta} variant="end" />
        </div>
      </section>
    </>
  );
};
