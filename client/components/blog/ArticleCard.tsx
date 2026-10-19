import type { FeedSummary } from "@/lib/feed/engine";
import { formatFeedDate, machineDate } from "@/lib/feed/view";
import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryChip } from "./CategoryChip";
import s from "./feed.module.scss";

export type CardVariant = "feature" | "card" | "row";

interface Props {
  article: FeedSummary;
  variant?: CardVariant;
  /** Position in its list, for the staggered reveal. */
  index?: number;
  /** Heading level of the title in the page outline. */
  headingLevel?: 2 | 3;
  /** The feature card on the hub is the LCP image: load it first. */
  priority?: boolean;
}

/**
 * An article card. The whole card is one link (the title carries the accessible name), the image
 * reserves its box (no layout shift) and the meta row says when it was published and how long it reads
 * (the article page shows the "Updated" date).
 */
export const ArticleCard = ({ article, variant = "card", index = 0, headingLevel = 3, priority = false }: Props) => {
  const H = headingLevel === 2 ? "h2" : "h3";
  const feature = variant === "feature";
  const row = variant === "row";
  return (
    <article
      className={clsx(
        s.card,
        s.reveal,
        "group overflow-hidden rounded-[1.25rem] bg-white/70 ring-1 ring-[rgb(var(--line)/0.08)]",
        feature && "grid md:grid-cols-[1.25fr_1fr]",
        row && "grid grid-cols-[7rem_1fr] gap-0 sm:grid-cols-[10rem_1fr]"
      )}
      style={{ "--i": index } as CSSProperties}
    >
      <div className={clsx("relative overflow-hidden bg-[rgb(var(--paper-2))]", feature ? "aspect-[16/9] md:aspect-auto md:min-h-[22rem]" : row ? "h-full min-h-[6.5rem]" : "aspect-[16/9]")}>
        <Image
          src={article.heroImage.src}
          alt=""
          fill
          priority={priority}
          sizes={feature ? "(min-width: 1280px) 720px, (min-width: 768px) 56vw, 100vw" : row ? "160px" : "(min-width: 1280px) 400px, (min-width: 768px) 45vw, 100vw"}
          className={clsx(s.cardImg, "object-cover")}
        />
      </div>
      <div className={clsx("flex flex-col", feature ? "gap-3 p-6 md:p-8 lg:p-10" : row ? "gap-1.5 p-4" : "gap-2.5 p-5")}>
        {!row && <CategoryChip slug={article.category} className="self-start" />}
        <H
          className={clsx(
            "tracking-[-0.01em] text-[rgb(var(--ink))] [text-wrap:balance]",
            // Passion One ships one weight (400): never let the browser fake a bold.
            feature ? "font-primary font-normal [font-synthesis:none] text-[1.75rem] leading-[1.08] md:text-[2.25rem] lg:text-[2.5rem]" : row ? "font-extrabold text-[1rem] leading-snug" : "font-extrabold text-[1.25rem] leading-snug"
          )}
        >
          <Link
            href={article.path}
            className="outline-none after:absolute after:inset-0 after:z-[1] after:content-['']"
          >
            {article.title}
          </Link>
        </H>
        {!row && (
          <p className={clsx("text-[rgb(var(--ink-2))]", feature ? "text-p4 leading-relaxed" : "line-clamp-3 text-p5 leading-relaxed")}>{article.excerpt}</p>
        )}
        <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-p6 font-bold text-[rgb(var(--muted))] md:text-p5">
          <time dateTime={machineDate(article.publishedAt)}>{formatFeedDate(article.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{article.readingMinutes} min read</span>
        </p>
      </div>
    </article>
  );
};
