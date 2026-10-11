import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import { trackEvent } from "@/components/GoogleTagManager";
import type { YourcatStatusView, YourcatView } from "@/models/yourcat";
import { forwardRef, useEffect } from "react";
import { S6 } from "./copy";
import { BODY, GHOST_BUTTON, GOLD_BUTTON, PixelPaw, ScreenHeading, SUBTITLE } from "./ui";

export const PAID_SEEN_PREFIX = "tt.yourcat.paid.";

/** True the first time this record's paid order is seen in this tab (sessionStorage dedupe). */
export function firstPaidSighting(yourcatId: string): boolean {
  try {
    const key = `${PAID_SEEN_PREFIX}${yourcatId}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    // No storage: report it (a reload may report it again, which the dedupe cannot prevent then).
    return true;
  }
}

export interface PaidStateProps {
  record: YourcatView;
  name: string;
  portrait: YourcatStatusView["portrait"] | null;
  /** Still painting after 10 minutes of polling. */
  late: boolean;
  onBack: () => void;
  /** Only the paid return (S6) reports `portrait_paid`; the same state shown on a later S3 does not. */
  reportPaid?: boolean;
}

/**
 * S6 "Paid return" (`/yourcat?yc=<id>&paid=1`), also shown on S3 while a paid portrait is painted.
 * `portrait_paid` (and GTM `purchase`) fires the first time `painting` or `ready` is seen.
 */
export const PaidState = forwardRef<HTMLHeadingElement, PaidStateProps>(({ record, name, portrait, late, onBack, reportPaid = false }, ref) => {
  const status = record.portrait.status;

  useEffect(() => {
    if (!reportPaid || (status !== "painting" && status !== "ready")) return;
    if (!portrait || !firstPaidSighting(record.id)) return;
    analytics.track(
      buildGrowthEvent("portrait_paid", {
        surface: "yourcat",
        priceCents: portrait.priceCents,
        currency: portrait.currency,
        status,
      }),
    );
    trackEvent("purchase", {
      currency: portrait.currency,
      value: portrait.priceCents / 100,
      item_name: "HD portrait",
    });
  }, [reportPaid, status, portrait, record.id]);

  const back = (
    <button type="button" className={GHOST_BUTTON} onClick={onBack}>
      {S6.back(name)}
    </button>
  );

  if (status === "ready" && record.portrait.url) {
    return (
      <section className="flex w-full flex-col items-center gap-4 text-center" data-testid="yourcat-paid">
        <ScreenHeading ref={ref} className={SUBTITLE}>
          {S6.readyTitle(name)}
        </ScreenHeading>
        <img src={record.portrait.url} alt={S6.portraitAlt(name)} className="w-full max-w-md rounded-xl border-4 border-tt-gold-500" />
        <div className="flex flex-wrap justify-center gap-3">
          <a className={GOLD_BUTTON} href={record.portrait.url} download>
            {S6.download}
          </a>
          {back}
        </div>
      </section>
    );
  }

  if (status === "failed" || late) {
    return (
      <section className="flex w-full flex-col items-center gap-4 text-center" data-testid="yourcat-paid">
        <ScreenHeading ref={ref} className={SUBTITLE}>
          {S6.late}
        </ScreenHeading>
        {back}
      </section>
    );
  }

  if (status === "painting") {
    return (
      <section className="flex w-full flex-col items-center gap-4 text-center" data-testid="yourcat-paid">
        <PixelPaw className="yc-pulse h-16 w-16 text-tt-gold-400" />
        <ScreenHeading ref={ref} className={SUBTITLE}>
          {S6.paintingTitle(name)}
        </ScreenHeading>
        <p className={BODY} aria-live="polite">
          {S6.paintingBody}
        </p>
        {back}
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col items-center gap-4 text-center" data-testid="yourcat-paid">
      <ScreenHeading ref={ref} className={SUBTITLE}>
        {S6.confirming}
      </ScreenHeading>
      {back}
    </section>
  );
});
