import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import { trackEvent } from "@/components/GoogleTagManager";
import type { YourcatStatusView, YourcatView } from "@/models/yourcat";
import { forwardRef, useEffect, useState } from "react";
import { S6 } from "./copy";
import { saveRemoteImage } from "./share";
import { BODY, GHOST_BUTTON, GOLD_BUTTON, PixelPaw, ScreenHeading, SUBTITLE } from "./ui";

export const PAID_SEEN_PREFIX = "tt.yourcat.paid.";

/** Records reported on this page when the browser gives no storage at all. */
const seenWithoutStorage = new Set<string>();

/**
 * True the first time this record's paid order is seen in this browser: a `localStorage` dedupe, so
 * a second tab or a reload of the paid return does not report it again (one paid portrait per record;
 * a repeat checkout answers 409). Without `localStorage` (private mode, blocked site data) it falls
 * back to this tab's `sessionStorage`, then to this page.
 */
export function firstPaidSighting(yourcatId: string): boolean {
  const key = `${PAID_SEEN_PREFIX}${yourcatId}`;
  for (const read of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const storage = read();
      if (storage.getItem(key)) return false;
      storage.setItem(key, "1");
      return true;
    } catch {
      // This storage is missing or refuses writes: try the next one.
    }
  }
  if (seenWithoutStorage.has(key)) return false;
  seenWithoutStorage.add(key);
  return true;
}

/** "Download" for the HD portrait: a blob save on this page, else the image in a new tab plus a link. */
function DownloadPortrait({ url, name }: { url: string; name: string }) {
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState(false);
  if (opened) {
    return (
      <a className={GOLD_BUTTON} href={url} target="_blank" rel="noopener" data-testid="yourcat-portrait-link">
        {S6.download}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={GOLD_BUTTON}
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        const outcome = await saveRemoteImage(url, name);
        setSaving(false);
        if (outcome === "opened") setOpened(true);
      }}
    >
      {S6.download}
    </button>
  );
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
          <DownloadPortrait url={record.portrait.url} name={name} />
          {back}
        </div>
      </section>
    );
  }

  if (status === "failed" || late) {
    return (
      <section className="flex w-full flex-col items-center gap-4 text-center" data-testid="yourcat-paid">
        <ScreenHeading ref={ref} className={SUBTITLE}>
          {S6.lateTitle}
        </ScreenHeading>
        <p className={`${BODY} max-w-xl`}>{status === "failed" ? S6.failed : S6.late}</p>
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
