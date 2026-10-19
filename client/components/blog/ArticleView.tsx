import type { FeedArticle, FeedCategory, FeedSummary } from "@/lib/feed/engine";
import { formatFeedDate, machineDate, sameDay } from "@/lib/feed/view";
import { siteOrigin } from "@/components/seo/site";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Clock, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArticleCard } from "./ArticleCard";
import { ArticleBody, Faq, ShareBar, Sources } from "./ArticleParts";
import { Breadcrumbs } from "./Breadcrumbs";
import { CategoryChip } from "./CategoryChip";
import { CtaCard } from "./CtaCard";
import s from "./feed.module.scss";
import { Toc } from "./Toc";

export interface ArticleViewProps {
  article: FeedArticle;
  category: FeedCategory;
  related: FeedSummary[];
  prev: FeedSummary | null;
  next: FeedSummary | null;
}

export const ARTICLE_BODY_ID = "article-content";

/**
 * One article: the night hero (category, title, answer-first description, byline, dates, reading
 * time), the hero image, a 68ch reading column with a sticky "On this page" beside it on wide
 * screens, the FAQ, "Check it yourself", the conversion block for the article's `cta`, share, and
 * the next reads.
 */
export const ArticleView = ({ article, category, related, prev, next }: ArticleViewProps) => {
  const url = `${siteOrigin()}${article.path}`;
  const updated = !sameDay(article.publishedAt, article.updatedAt);
  return (
    <article data-testid="feed-article">
      <header className={clsx(s.night, "overflow-hidden pb-28 pt-8 md:pb-40 md:pt-14")}>
        <div className={s.stars} aria-hidden="true" />
        <div className={s.dusk} aria-hidden="true" />
        <div className={clsx(s.stagger, "mx-auto max-w-[52rem] px-4 md:px-8")}>
          <Breadcrumbs
            surface="night"
            items={[
              { name: "Blog", path: "/feed" },
              { name: category.name, path: `/feed/${category.slug}` },
              { name: article.title, path: article.path },
            ]}
            style={{ "--i": 0 } as CSSProperties}
          />
          <div className="mt-6" style={{ "--i": 1 } as CSSProperties}>
            <CategoryChip slug={article.category} surface="night" link />
          </div>
          <h1
           
            className="mt-4 font-primary text-[2.4rem] leading-[1.02] tracking-[-0.005em] text-white [text-wrap:balance] md:text-[3.6rem] lg:text-[4rem]"
            style={{ "--i": 2 } as CSSProperties}
          >
            {article.title}
          </h1>
          <p className="mt-5 max-w-[60ch] text-[1.15rem] leading-relaxed text-tt-cream/90 md:text-[1.3rem]" style={{ "--i": 3 } as CSSProperties}>
            {article.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-p5 font-bold text-tt-cream/80 md:text-[1rem]" style={{ "--i": 4 } as CSSProperties}>
            <span className="inline-flex items-center gap-2">
              <img src="/logo/logo.webp" alt="" aria-hidden="true" width={28} height={28} className="h-7 w-7 rounded-full bg-tt-cream/10 object-contain p-0.5" />
              <span>{article.author}</span>
            </span>
            <span aria-hidden="true" className="text-tt-cream/40">
              ·
            </span>
            <span>
              Published <time dateTime={machineDate(article.publishedAt)}>{formatFeedDate(article.publishedAt)}</time>
            </span>
            {updated && (
              <>
                <span aria-hidden="true" className="text-tt-cream/40">
                  ·
                </span>
                <span className="text-tt-gold-400">
                  Updated <time dateTime={machineDate(article.updatedAt)}>{formatFeedDate(article.updatedAt)}</time>
                </span>
              </>
            )}
            <span aria-hidden="true" className="text-tt-cream/40">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden="true" className="h-4 w-4" /> {article.readingMinutes} min read
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto -mt-20 max-w-[64rem] px-4 md:-mt-28 md:px-8">
        <figure className="relative overflow-hidden rounded-[1.5rem] bg-[rgb(var(--paper-2))] shadow-[0_30px_60px_-30px_rgb(var(--tt-night-950)/.8)] ring-1 ring-black/5">
          <Image
            src={article.heroImage.src}
            alt={article.heroImage.alt}
            width={article.heroImage.width}
            height={article.heroImage.height}
            priority
            sizes="(min-width: 1024px) 960px, 100vw"
            className="h-auto max-h-[34rem] w-full object-cover"
           
          />
        </figure>
      </div>

      <div className="mx-auto grid max-w-[80rem] gap-10 px-4 pb-20 pt-10 md:px-8 md:pt-14 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_4rem]">
        <aside className="hidden lg:block">
          <Toc items={article.toc} variant="sidebar" />
        </aside>
        <div id={ARTICLE_BODY_ID} className="min-w-0">
          <div className="lg:hidden">
            <Toc items={article.toc} variant="inline" />
          </div>
          <TrustLine updatedAt={article.updatedAt} />
          <ArticleBody segments={article.segments} />
          <Faq items={article.faq} />
          <Sources sources={article.sources} updatedAt={article.updatedAt} />
          <div className="mt-10 max-w-[46rem]">
            <ShareBar url={url} title={article.title} />
          </div>
        </div>
      </div>

      <section aria-label="What to do next" className={clsx(s.night, "overflow-hidden py-16 md:py-24")}>
        <div className={s.stars} aria-hidden="true" />
        <div className="mx-auto max-w-[68rem] px-4 md:px-8">
          <CtaCard cta={article.cta} variant="end" />
          {(prev || next) && (
            <nav aria-label={`More in ${category.name}`} className="mt-12 grid gap-3 md:grid-cols-2">
              {prev ? <NeighbourLink article={prev} dir="prev" /> : <span className="hidden md:block" />}
              {next && <NeighbourLink article={next} dir="next" />}
            </nav>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="keep-reading" className="mx-auto max-w-[80rem] px-4 py-16 md:px-8 md:py-20">
          <h2 id="keep-reading" className="mb-6 text-[1.6rem] font-extrabold tracking-[-0.01em] md:text-[2rem]">
            Keep reading
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r, i) => (
              <ArticleCard key={r.slug} article={r} index={i} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
};

const TrustLine = ({ updatedAt }: { updatedAt: string }) => (
  <p className="mb-8 flex max-w-[46rem] items-start gap-2 rounded-xl bg-tt-mint/15 px-4 py-3 text-p5 font-bold leading-snug text-[#245a19] md:text-[0.98rem]" data-testid="trust-line">
    <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
    <span>
      Written by the Token Tails team. Facts checked against live data on <time dateTime={machineDate(updatedAt)}>{formatFeedDate(updatedAt)}</time>; sources are listed at the end.
    </span>
  </p>
);

const NeighbourLink = ({ article, dir }: { article: FeedSummary; dir: "prev" | "next" }) => (
  <Link
    href={article.path}
    rel={dir}
    className={clsx(
      "group flex min-h-[5.5rem] flex-col justify-center gap-1 rounded-2xl bg-tt-night-700/80 px-5 py-4 ring-1 ring-tt-cream/15 transition hover:bg-tt-night-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400",
      dir === "next" && "md:items-end md:text-right"
    )}
  >
    <span className="inline-flex items-center gap-1.5 font-sans text-p6 font-extrabold uppercase tracking-[0.12em] text-tt-gold-400">
      {dir === "prev" ? <ArrowLeft aria-hidden="true" className="h-4 w-4" /> : null}
      {dir === "prev" ? "Older" : "Newer"}
      {dir === "next" ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null}
    </span>
    <span className="text-[1.05rem] font-extrabold leading-snug text-tt-cream">{article.title}</span>
  </Link>
);
