import { PixelIcon } from "@/components/shared/PixelIcon";
import { GameModal } from "@/components/ui/GameModal";
import type { PublicFact } from "@/lib/facts.generated";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { openWebImpact } from "./build";
import { EvidenceChip } from "./EvidenceChip";
import { formatFactDate, isStale, parseFactDate, publicSourceUrl } from "./facts";
import { labelSet } from "./labels";
import type { MoneyTier } from "./tiers";

export interface ProofDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fact: PublicFact;
  /** The words the surface showed. */
  text: string;
  tier?: MoneyTier;
  /** Snapshot date for live entries. */
  liveAsOf?: string | null;
  isApp: boolean;
  now?: Date;
}

/**
 * Closes the drawer on the Android hardware back button (plan G11). Esc and the backdrop are
 * handled by GameModal (Radix). No-op outside the native app.
 *
 * Today `Claim` never opens the drawer in app builds (it opens web /impact, plan F7.2), so this
 * hook and the `isApp` branches below are not reached yet. They are kept on purpose for an in-app
 * drawer, which the plan's G11 spec asks to close on Android back.
 */
export function useAndroidBackClose(open: boolean, close: () => void) {
  // The listener reads the latest `close` through a ref, so it is added once per open, not on
  // every render with a new callback.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!open || !Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => closeRef.current()).then((handle) => {
          if (cancelled) handle.remove();
          else remove = () => handle.remove();
        })
      )
      .catch(() => {});
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [open]);
}

function checkBy(fact: PublicFact): string | null {
  if (fact.maxAgeDays === null) return null;
  const checked = parseFactDate(fact.checkedAt);
  if (!checked) return null;
  return formatFactDate(
    new Date(checked.getTime() + fact.maxAgeDays * 86_400_000).toISOString()
  );
}

/** The bottom sheet a claim opens: what the number is, how sure we are, and where to check it. */
export const ProofDrawer = ({
  open,
  onOpenChange,
  fact,
  text,
  tier,
  liveAsOf,
  isApp,
  now = new Date(),
}: ProofDrawerProps) => {
  const labels = labelSet(isApp);
  const stale = isStale(fact, now, liveAsOf);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useAndroidBackClose(open, close);
  const figureDate = fact.status === "live" ? liveAsOf : fact.asOf;
  const due = checkBy(fact);

  const rows: { term: string; detail: React.ReactNode }[] = [
    { term: "Status", detail: labels.explain[fact.status] },
    ...(tier ? [{ term: "Evidence", detail: labels.explain[tier] }] : []),
    {
      term: fact.status === "live" ? "Snapshot" : "Figure date",
      detail: formatFactDate(figureDate) ?? "Not measured yet",
    },
    {
      term: "Last checked",
      detail: formatFactDate(fact.checkedAt) ?? "Unknown",
    },
    {
      term: "Check by",
      detail: due
        ? `${due}${stale ? " (overdue)" : ""}`
        : "History: it does not go stale",
    },
  ];
  const sourceLink = isApp ? null : publicSourceUrl(fact.sourceUrl);
  if (sourceLink) {
    rows.push({
      term: "Source",
      detail: (
        <a
          href={sourceLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-tt-gold-400 underline underline-offset-2"
        >
          {sourceLink.href}
        </a>
      ),
    });
  }
  rows.push({
    term: "Claim id",
    detail: <code>{fact.id}</code>,
  });

  return (
    <GameModal
      open={open}
      onOpenChange={onOpenChange}
      title="About this number"
      surface="sheet"
      size="md"
      name="proof-drawer"
      suspendGame
    >
      <div className="flex flex-col gap-4" data-proof-drawer={fact.id}>
        <p className="font-primary text-p4 uppercase leading-tight text-tt-cream md:text-p3">
          {text}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {tier && <EvidenceChip kind={tier} isApp={isApp} />}
          <EvidenceChip kind={fact.status} isApp={isApp} />
          {stale && <EvidenceChip kind="stale" isApp={isApp} />}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-sans text-p5 text-tt-cream/90">
          {rows.map((row) => (
            <div key={row.term} className="contents">
              <dt className="font-primary uppercase tracking-wide text-tt-muted">
                {row.term}
              </dt>
              <dd>{row.detail}</dd>
            </div>
          ))}
        </dl>
        {isApp ? (
          <button
            type="button"
            onClick={() => void openWebImpact(fact.id)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-tt-gold-400 px-4 font-primary uppercase text-tt-gold-400"
          >
            Every number on tokentails.com/impact
            <PixelIcon name="external-link" />
          </button>
        ) : (
          <Link
            href={`/impact#${fact.id}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-tt-gold-400 px-4 font-primary uppercase text-tt-gold-400"
          >
            Every number, with its source
            <PixelIcon name="chevron-right" />
          </Link>
        )}
      </div>
    </GameModal>
  );
};

export default ProofDrawer;
