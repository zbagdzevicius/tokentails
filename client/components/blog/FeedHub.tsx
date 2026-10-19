import type { FeedCategory, FeedSummary } from "@/lib/feed/engine";
import { isApp } from "@/models/app";
import clsx from "clsx";
import { ArrowRight, Code2, Gamepad2, HeartHandshake, Search, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArticleCard } from "./ArticleCard";
import { CtaCard } from "./CtaCard";
import s from "./feed.module.scss";
import { toneFor } from "./tone";
import { TrustBand } from "./TrustBand";

export interface FeedHubProps {
  articles: FeedSummary[];
  categories: FeedCategory[];
  featuredSlug: string | null;
}

/** Lower-case words of everything a reader might search for. */
const haystack = (a: FeedSummary, cats: FeedCategory[]) =>
  [a.title, a.excerpt, a.description, a.keywords.join(" "), cats.find((c) => c.slug === a.category)?.name ?? ""].join(" ").toLowerCase();

/** Articles matching every word of `query` within `category` (null = all). */
export function filterArticles(articles: FeedSummary[], cats: FeedCategory[], query: string, category: string | null): FeedSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return articles.filter((a) => (!category || a.category === category) && words.every((w) => haystack(a, cats).includes(w)));
}

interface StartPath {
  key: string;
  icon: ReactNode;
  title: string;
  body: string;
  links: { label: string; href: string; hard?: boolean }[];
  category: string;
}

const START_PATHS: StartPath[] = [
  {
    key: "play",
    icon: <Gamepad2 aria-hidden="true" className="h-6 w-6" />,
    title: "I want to play",
    body: "Free cat games in your browser, no sign-up needed to start.",
    links: [
      { label: "Play Catnip Heist", href: "/heist" },
      { label: "Game guides", href: "/feed/games" },
    ],
    category: "games",
  },
  {
    key: "give",
    icon: <HeartHandshake aria-hidden="true" className="h-6 w-6" />,
    title: "I want to help",
    body: "How giving reaches Pink Paw in Kaunas, and how to check every payout yourself.",
    links: [
      { label: "How giving works", href: "/feed/giving" },
      { label: "See every payout", href: "/shelter-payouts" },
    ],
    category: "giving",
  },
  {
    key: "build",
    icon: <Code2 aria-hidden="true" className="h-6 w-6" />,
    title: "I build things",
    body: "The open-source (MIT) contracts and SDK behind every shelter payout.",
    links: [
      { label: "Developer guides", href: "/feed/build" },
      { label: "Code on GitHub", href: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split", hard: true },
    ],
    category: "build",
  },
];

/**
 * /feed: the hub. Night hero with search and section filters, "Start here" paths for players, givers
 * and builders, the featured article, one rail per section, and why the facts can be trusted.
 * Search and filters run in the browser over the build's article list (no API).
 */
export const FeedHub = ({ articles, categories, featuredSlug }: FeedHubProps) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const filtering = !!deferred.trim() || !!category;
  const results = useMemo(() => filterArticles(articles, categories, deferred, category), [articles, categories, deferred, category]);
  const featured = articles.find((a) => a.slug === featuredSlug) ?? articles[0] ?? null;
  const live = categories.filter((c) => articles.some((a) => a.category === c.slug));
  const paths = START_PATHS.filter((p) => live.some((c) => c.slug === p.category));

  return (
    <>
      <header className={clsx(s.night, "overflow-hidden pb-14 pt-10 md:pb-20 md:pt-16")}>
        <div className={s.stars} aria-hidden="true" />
        <div className={s.dusk} aria-hidden="true" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[7%] top-1/2 hidden -translate-y-1/2 lg:block">
          <div className="relative h-[20rem] w-[20rem] xl:h-[24rem] xl:w-[24rem]">
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_32%,rgb(var(--tt-cream)/.95)_0%,rgb(var(--tt-gold-400)/.55)_42%,rgb(var(--tt-dusk-horizon)/.18)_66%,transparent_72%)] opacity-80" />
            <div className="absolute inset-x-0 bottom-[8%] flex justify-center">
              <img
                src="/cats/pinkie/pink-respirando-ropa.gif"
                alt=""
                width={68}
                height={68}
                className="pixelated h-56 w-56 drop-shadow-[0_14px_22px_rgb(var(--tt-night-950)/.55)] motion-safe:animate-float xl:h-64 xl:w-64"
              />
            </div>
          </div>
        </div>
        <div className={clsx(s.stagger, "relative mx-auto max-w-[80rem] px-4 md:px-8")}>
          <p className="font-sans text-p6 font-extrabold uppercase tracking-[0.16em] text-tt-gold-400 md:text-p5" style={{ "--i": 0 } as CSSProperties}>
            The Token Tails blog
          </p>
          <h1 className="mt-3 max-w-[18ch] font-primary text-[2.6rem] leading-[1.02] text-white [text-wrap:balance] md:text-[4rem] lg:text-[4.75rem]" style={{ "--i": 1 } as CSSProperties}>
            Cat games, honest giving, and the proof
          </h1>
          <p className="mt-5 max-w-[58ch] text-[1.1rem] leading-relaxed text-tt-cream/90 md:text-[1.3rem]" style={{ "--i": 2 } as CSSProperties}>
            Guides to our free cat games, how giving reaches Pink Paw in Kaunas, Lithuania, and the open-source code that lets anyone check every payout.
          </p>

          <div role="search" className="mt-8 max-w-[44rem]" style={{ "--i": 3 } as CSSProperties}>
            <label htmlFor="feed-search" className="sr-only">
              Search the blog
            </label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-tt-cream/60" />
              <input
                id="feed-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guides, games, giving…"
                autoComplete="off"
                className="h-14 w-full rounded-2xl border-2 border-tt-cream/20 bg-tt-night-950/60 pl-12 pr-12 text-[1.05rem] text-tt-cream placeholder:text-tt-cream/55 focus:border-tt-gold-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-tt-cream/80 hover:bg-tt-cream/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
                  aria-label="Clear search"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              )}
            </div>
            {live.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by section">
                <FilterChip active={!category} onClick={() => setCategory(null)}>
                  All
                </FilterChip>
                {live.map((c) => (
                  <FilterChip key={c.slug} active={category === c.slug} onClick={() => setCategory(category === c.slug ? null : c.slug)} dot={toneFor(c.slug).dot}>
                    {c.name}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[80rem] px-4 pb-20 pt-10 md:px-8 md:pt-14">
        {!articles.length && <EmptyState />}

        {filtering ? (
          <section aria-labelledby="results-title">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="results-title" className="text-[1.6rem] font-extrabold tracking-[-0.01em] md:text-[2rem]">
                {category ? live.find((c) => c.slug === category)?.name : "Search results"}
              </h2>
              <p className="text-p5 font-bold text-[rgb(var(--muted))] md:text-[1rem]" aria-live="polite">
                {results.length === 1 ? "1 article" : `${results.length} articles`}
              </p>
            </div>
            {results.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((a, i) => (
                  <ArticleCard key={a.slug} article={a} index={i} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/70 p-6 text-[1.05rem] text-[rgb(var(--ink-2))] ring-1 ring-[rgb(var(--line)/0.1)]">
                Nothing matches that yet. Try another word, or{" "}
                <button
                  type="button"
                  className="font-bold text-[rgb(var(--link))] underline underline-offset-4"
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                  }}
                >
                  show every article
                </button>
                .
              </p>
            )}
          </section>
        ) : (
          articles.length > 0 && (
            <>
              {paths.length > 1 && (
                <section aria-labelledby="start-here" className="mb-14">
                  <h2 id="start-here" className="mb-5 font-sans text-p6 font-extrabold uppercase tracking-[0.16em] text-[rgb(var(--muted))] md:text-p5">
                    Start here
                  </h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {paths.map((p, i) => (
                      <StartCard key={p.key} path={p} index={i} />
                    ))}
                  </div>
                </section>
              )}

              {featured && (
                <section aria-label="Featured article" className="mb-16">
                  <ArticleCard article={featured} variant="feature" headingLevel={2} priority />
                </section>
              )}

              {live.map((c) => {
                const list = articles.filter((a) => a.category === c.slug && a.slug !== featured?.slug).slice(0, 3);
                if (!list.length) return null;
                const total = articles.filter((a) => a.category === c.slug).length;
                return (
                  <section key={c.slug} aria-labelledby={`rail-${c.slug}`} className="mb-16">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[rgb(var(--line)/0.1)] pb-4">
                      <div className="max-w-[60ch]">
                        <h2 id={`rail-${c.slug}`} className="flex items-center gap-3 text-[1.6rem] font-extrabold tracking-[-0.01em] md:text-[2rem]">
                          <span aria-hidden="true" className={clsx("h-3 w-3 rounded-full", toneFor(c.slug).dot)} />
                          {c.name}
                        </h2>
                        <p className="mt-1 text-[1rem] leading-relaxed text-[rgb(var(--ink-2))]">{c.headline}</p>
                      </div>
                      <Link
                        href={`/feed/${c.slug}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-p5 font-extrabold text-[rgb(var(--link))] hover:bg-[rgb(var(--line)/0.05)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--link))] md:text-[1rem]"
                      >
                        All {total} in {c.name}
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((a, i) => (
                        <ArticleCard key={a.slug} article={a} index={i} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )
        )}
      </div>

      {!isApp && <TrustBand />}

      <section aria-label="Play now" className="mx-auto max-w-[68rem] px-4 py-16 md:px-8 md:py-20">
        <CtaCard cta="heist" variant="end" />
      </section>
    </>
  );
};

const FilterChip = ({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: ReactNode; dot?: string }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={clsx(
      "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-p5 font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 md:text-[0.95rem]",
      active ? "bg-tt-gold-400 text-tt-gold-ink" : "bg-tt-cream/10 text-tt-cream ring-1 ring-inset ring-tt-cream/20 hover:bg-tt-cream/15"
    )}
  >
    {dot && <span aria-hidden="true" className={clsx("h-2 w-2 rounded-full", dot)} />}
    {children}
  </button>
);

const StartCard = ({ path, index }: { path: StartPath; index: number }) => (
  <div className={clsx(s.card, s.reveal, "flex flex-col gap-3 rounded-[1.25rem] bg-white/75 p-6 ring-1 ring-[rgb(var(--line)/0.08)]")} style={{ "--i": index } as CSSProperties}>
    <span className={clsx("inline-flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--ink))]", toneFor(path.category).dot)}>{path.icon}</span>
    <h3 className="text-[1.3rem] font-extrabold tracking-[-0.01em]">{path.title}</h3>
    <p className="text-[1rem] leading-relaxed text-[rgb(var(--ink-2))]">{path.body}</p>
    <ul className="mt-auto flex flex-wrap gap-2 pt-1">
      {path.links.map((l) =>
        <li key={l.href}>
          {l.hard ? (
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[rgb(var(--ink))] px-4 text-p5 font-extrabold text-tt-cream hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--link))]">
              {l.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link href={l.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[rgb(var(--ink))] px-4 text-p5 font-extrabold text-tt-cream hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--link))]">
              {l.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          )}
        </li>
      )}
    </ul>
  </div>
);

const EmptyState = () => (
  <div className="rounded-[1.5rem] bg-white/70 p-8 text-center ring-1 ring-[rgb(var(--line)/0.1)]" data-testid="feed-empty">
    <p className="text-[1.4rem] font-extrabold">New guides are on their way.</p>
    <p className="mt-2 text-[1.05rem] text-[rgb(var(--ink-2))]">In the meantime, the games are open.</p>
  </div>
);
