import type { FaqItem, FeedSegment, SourceLink } from "@/lib/feed/engine";
import { formatFeedDate, machineDate } from "@/lib/feed/view";
import { isApp } from "@/models/app";
import clsx from "clsx";
import { Check, ChevronDown, ExternalLink, Link2, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CtaCard } from "./CtaCard";
import s from "./feed.module.scss";
import { PayoutsLive } from "./PayoutsLive";

/** The rendered body: Markdown HTML (built at build time from repo files) between the directive components. */
export const ArticleBody = ({ segments }: { segments: FeedSegment[] }) => (
  <div data-testid="article-body">
    {segments.map((seg, i) => {
      if (seg.type === "html") {
        return <div key={i} className={clsx(s.prose, i === 0 && s.lede)} dangerouslySetInnerHTML={{ __html: seg.html }} />;
      }
      if (seg.type === "cta") return <CtaCard key={i} cta={seg.cta} />;
      if (seg.type === "payouts-live") return <PayoutsLive key={i} />;
      return <KeyTakeaways key={i} html={seg.html} />;
    })}
  </div>
);

export const KeyTakeaways = ({ html }: { html: string }) => (
  <section aria-label="Key takeaways" className={clsx(s.takeaways, "my-8 max-w-[46rem] p-5 md:p-6")} data-testid="key-takeaways">
    <p className="mb-2 font-sans text-p6 font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--ink-2))] md:text-p5">Key takeaways</p>
    <div className="text-[1.05rem] text-[rgb(var(--ink))]" dangerouslySetInnerHTML={{ __html: html }} />
  </section>
);

/** Questions people search, answered short. Native `<details>`: works without JS, crawlable. */
export const Faq = ({ items }: { items: FaqItem[] }) => {
  if (!items.length) return null;
  return (
    <section aria-labelledby="faq" className="mt-14 max-w-[46rem]" data-testid="article-faq">
      <h2 id="faq" className="mb-4 scroll-mt-28 text-[1.6rem] font-extrabold leading-tight tracking-[-0.01em] text-[rgb(var(--ink))] md:text-[1.8rem]">
        Frequently asked questions
      </h2>
      <div className="divide-y divide-[rgb(var(--line)/0.1)] rounded-2xl bg-white/70 ring-1 ring-[rgb(var(--line)/0.1)]">
        {items.map((f, i) => (
          <details key={i} className={clsx(s.details, "group px-5")} open={i === 0}>
            <summary className="flex min-h-14 items-center justify-between gap-4 py-3 text-[1.05rem] font-extrabold leading-snug text-[rgb(var(--ink))]">
              <h3 className="font-extrabold">{f.q}</h3>
              <ChevronDown aria-hidden="true" className={clsx(s.chevron, "h-5 w-5 shrink-0 text-[rgb(var(--muted))]")} />
            </summary>
            <p className={clsx(s.answer, "pb-5 text-[1.02rem] leading-relaxed text-[rgb(var(--ink-2))]")}>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
};

const isExternal = (url: string) => /^https?:\/\//.test(url) && !/^https:\/\/(www\.)?tokentails\.com(\/|$)/.test(url);

/**
 * "Check it yourself": the article's sources plus the standing proof links, and when the facts were
 * last checked. The ledger and contract links are web only (app builds name no coins or chains).
 */
export const Sources = ({ sources, updatedAt, appBuild = isApp }: { sources: SourceLink[]; updatedAt: string; appBuild?: boolean }) => {
  const standing: SourceLink[] = appBuild
    ? [{ label: "Impact: every figure with its date and source", url: "/impact" }]
    : [
        { label: "Every payout for Pink Paw, with its transaction", url: "/shelter-payouts" },
        { label: "Impact: totals with dates and sources", url: "/impact" },
        { label: "The open-source payout contracts (MIT)", url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split" },
      ];
  // The article's own labels win; a standing link it already lists (absolute or root-relative) is not repeated.
  const key = (url: string) => url.replace(/^https:\/\/(www\.)?tokentails\.com(?=\/)/, "").replace(/\/+$/, "");
  const list = [...sources, ...standing.filter((x) => !sources.some((src) => key(src.url) === key(x.url)))];
  return (
    <section aria-labelledby="check-it-yourself" className="mt-14 max-w-[46rem] rounded-[1.25rem] border-2 border-dashed border-[rgb(var(--line)/0.18)] p-5 md:p-7" data-testid="article-sources">
      <h2 id="check-it-yourself" className="text-[1.35rem] font-extrabold tracking-[-0.01em] text-[rgb(var(--ink))]">
        Check it yourself
      </h2>
      <p className="mt-1 text-p5 text-[rgb(var(--muted))] md:text-[1rem]">
        Facts checked against live data on <time dateTime={machineDate(updatedAt)}>{formatFeedDate(updatedAt)}</time>. Live figures change: the links below always show the current ones.
      </p>
      <ul className="mt-4 space-y-2">
        {list.map((src) => (
          <li key={src.url}>
            {isExternal(src.url) ? (
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="group inline-flex min-h-11 items-center gap-2 text-[1rem] font-bold text-[rgb(var(--link))] underline decoration-2 underline-offset-4 decoration-[rgb(var(--link)/0.3)] hover:decoration-current">
                {src.label}
                <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <Link href={src.url} className="inline-flex min-h-11 items-center gap-2 text-[1rem] font-bold text-[rgb(var(--link))] underline decoration-2 underline-offset-4 decoration-[rgb(var(--link)/0.3)] hover:decoration-current">
                {src.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Share: native share sheet where the device has one, copy link everywhere, and X. */
export const ShareBar = ({ url, title }: { url: string; title: string }) => {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // Read after mount: the server HTML and the first client render match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  const btn =
    "inline-flex min-h-11 items-center gap-2 rounded-full bg-white/80 px-4 text-p5 font-extrabold text-[rgb(var(--ink))] ring-1 ring-[rgb(var(--line)/0.14)] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--link))]";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="share-bar">
      <span className="mr-1 font-sans text-p6 font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Share</span>
      {canShare && (
        <button type="button" className={btn} onClick={() => navigator.share({ url, title }).catch(() => undefined)}>
          <Share2 aria-hidden="true" className="h-4 w-4" /> Share
        </button>
      )}
      <button type="button" className={btn} onClick={copy} aria-live="polite">
        {copied ? <Check aria-hidden="true" className="h-4 w-4 text-[#245a19]" /> : <Link2 aria-hidden="true" className="h-4 w-4" />}
        {copied ? "Link copied" : "Copy link"}
      </button>
      <a
        className={btn}
        href={`https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Post on X<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
};
