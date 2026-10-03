import { FactId } from "@/lib/facts.generated";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { isAppBuild, openWebImpact } from "./build";
import { EvidenceChip } from "./EvidenceChip";
import { labelSet } from "./labels";
import {
  factText,
  FactValues,
  formatFactDate,
  isStale,
  publicFact,
  splitFigure,
  textHasDate,
} from "./facts";
import type { MoneyTier } from "./tiers";
import { useNow } from "./useNow";

// The drawer is only needed after a tap; keep GameModal and Radix out of the landing's first load.
const ProofDrawer = dynamic(
  () => import("./ProofDrawer").then((m) => m.ProofDrawer),
  {
    ssr: false,
  }
);

/** A trailing "(Oct 2026, company-reported)" on registry words. */
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/;

export type ClaimVariant = "inline" | "chip" | "stat" | "hero";

export interface ClaimProps {
  id: FactId;
  /** Live placeholder values (`{n}`, `{amount}`, `{state}`) from the impact snapshot. */
  values?: FactValues;
  /** Snapshot date for live entries (the inline as-of date and the STALE check). */
  liveAsOf?: string | null;
  /** Evidence tier, for money figures (plan F7.2). */
  tier?: MoneyTier;
  variant?: ClaimVariant;
  /** Replaces the registry words, for example a formatted money amount. Keep the meaning. */
  text?: string;
  /** Extra content after the words (stat cards). */
  children?: ReactNode;
  /** Plain words right after the claim text and before its date and chips (inline variant). */
  suffix?: ReactNode;
  /** `false` for rows that already are the proof (/impact). */
  interactive?: boolean;
  /** Overrides the build flag (tests and previews). */
  isApp?: boolean;
  now?: Date;
  className?: string;
}

/**
 * One public claim (plan F7.2, G11). Renders the registry words (or the live value), the inline
 * as-of date, the status chip, the money tier when given and a STALE chip past `maxAgeDays`. It
 * carries `data-claim` with the registry id. On the web a tap opens the ProofDrawer; in app builds
 * it opens web /impact in `@capacitor/browser`. An id that is not public renders nothing.
 */
export const Claim = ({
  id,
  values,
  liveAsOf,
  tier,
  variant = "inline",
  text: override,
  children,
  suffix,
  interactive = true,
  isApp = isAppBuild(),
  now,
  className,
}: ClaimProps) => {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const mountedNow = useNow();
  const fact = publicFact(id);
  if (!fact) return null;
  const text = override ?? factText(fact, values, isApp);
  if (!text) return null;

  // Without a `now` prop the STALE check waits for mount (useNow), so built HTML hydrates cleanly.
  const at = now ?? mountedNow;
  const stale = at ? isStale(fact, at, liveAsOf) : false;
  const labels = labelSet(isApp).chip;
  // "(Apr 2026, company-reported)" already says the status; the chip would repeat it.
  const statusInText = text
    .toLowerCase()
    .includes(labels[fact.status].toLowerCase());
  const dateSource = fact.status === "live" ? liveAsOf : fact.asOf;
  const date = textHasDate(text) ? null : formatFactDate(dateSource);

  const chips = (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tier && <EvidenceChip kind={tier} isApp={isApp} />}
      {!statusInText && <EvidenceChip kind={fact.status} isApp={isApp} />}
      {stale && <EvidenceChip kind="stale" isApp={isApp} />}
    </span>
  );

  const dateNode = date ? (
    <span className="claim-date whitespace-nowrap opacity-80">
      {variant === "stat" || variant === "hero"
        ? `As of ${date}`
        : variant === "chip"
        ? // In a chip "· as of" reads like a second item after "Now:" (review 3f #7).
          `(${date})`
        : `· as of ${date}`}
    </span>
  ) : null;

  let body: ReactNode;
  if (variant === "stat") {
    const { figure, rest } = splitFigure(text);
    body = (
      <>
        {figure && (
          <span className="claim-figure block font-primary text-p2 uppercase leading-none md:text-h5">
            {figure}
          </span>
        )}
        <span className="claim-text mt-1 block text-p6 uppercase md:text-p5">
          {rest}
        </span>
        {dateNode && <span className="mt-1 block text-p6">{dateNode}</span>}
        <span className="mt-2 flex justify-center">{chips}</span>
        {children}
      </>
    );
  } else if (variant === "hero") {
    // One headline number per page (/impact): the figure large, its words, then its date and chips.
    // The "(Oct 2026, company-reported)" tail moves into the full date and the status chip, which
    // say the same thing and stay next to the number (R12).
    const { figure, rest } = splitFigure(text);
    const words = rest.replace(TRAILING_PAREN, "");
    const heroDate = formatFactDate(dateSource);
    body = (
      <>
        {figure && (
          <span className="claim-figure block font-paws text-[4rem] leading-[0.9] text-tt-gold-400 [text-shadow:0_4px_0_rgb(var(--tt-night-950)),0_0_22px_rgb(var(--tt-gold-400)/0.35)] md:text-[6.5rem]">
            {figure}
          </span>
        )}
        <span className="claim-text mt-2 block font-primary text-p4 uppercase leading-tight text-tt-cream md:text-p2">
          {words}
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-2 font-primary text-p6 uppercase tracking-wide text-tt-cream/80 md:text-p5">
          <span className="inline-flex flex-wrap items-center gap-1">
            {tier && <EvidenceChip kind={tier} isApp={isApp} />}
            <EvidenceChip kind={fact.status} isApp={isApp} />
            {stale && <EvidenceChip kind="stale" isApp={isApp} />}
          </span>
          {heroDate && (
            <span className="claim-date whitespace-nowrap">
              As of {heroDate}
            </span>
          )}
        </span>
        {children}
      </>
    );
  } else {
    body = (
      <>
        <span className="claim-text">{text}</span>
        {suffix ? <> {suffix}</> : null} {dateNode} {chips}
        {children}
      </>
    );
  }

  const classes = clsx(
    "claim",
    variant === "chip" &&
      "inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 border-tt-cream/70 bg-tt-night-900/60 px-3 py-1.5 text-left font-primary text-p6 uppercase tracking-wide text-tt-cream md:text-p5",
    variant === "stat" && "block w-full text-center",
    variant === "hero" && "block w-full text-left",
    variant === "inline" && "inline",
    className
  );

  if (!interactive) {
    return (
      <span data-claim={id} className={classes}>
        {body}
      </span>
    );
  }

  const accessibleName = [
    `${text}${date ? `, as of ${date}` : ""}`,
    [tier && labels[tier], labels[fact.status], stale && labels.stale]
      .filter(Boolean)
      .join(", "),
    isApp
      ? "Opens the impact page"
      : fact.sourceUrl || fact.status !== "company-reported"
      ? "Show the source"
      : "Show how we know",
  ].join(". ");

  const onActivate = () => {
    if (isApp) {
      void openWebImpact(id);
      return;
    }
    setOpened(true);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        data-claim={id}
        onClick={onActivate}
        aria-haspopup={isApp ? undefined : "dialog"}
        aria-label={accessibleName}
        className={clsx(
          classes,
          "cursor-pointer rounded-xl outline-none transition-transform focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 motion-safe:hover:scale-[1.02]"
        )}
      >
        {body}
      </button>
      {opened && !isApp && (
        <ProofDrawer
          open={open}
          onOpenChange={setOpen}
          fact={fact}
          text={text}
          tier={tier}
          liveAsOf={liveAsOf}
          isApp={isApp}
          now={at ?? undefined}
        />
      )}
    </>
  );
};

export default Claim;
