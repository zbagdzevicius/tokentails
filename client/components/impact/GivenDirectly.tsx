import { Claim } from "@/components/claims/Claim";
import { isAppBuild } from "@/components/claims/build";
import { publicFact } from "@/components/claims/facts";
import { offersRecords, recordsMailto } from "@/components/claims/records";
import { PixelIcon } from "@/components/shared/PixelIcon";
import type { FactId } from "@/lib/facts.generated";
import clsx from "clsx";
import type { ReactNode } from "react";

/** The registry entry for what Token Tails reports giving directly, outside the treat rail. */
export const GIVEN_DIRECTLY_ID: FactId = "F-026";

interface GivenDirectlyProps {
  /** What the treat rail has paid so far (a <Claim>), or null while it has paid nothing. */
  railLine?: ReactNode;
  isApp?: boolean;
  className?: string;
}

/**
 * The /impact headline: the direct donations Token Tails reports (F-026), with what it is, how
 * sure we are and, once the entry opts in (`recordsOnRequest`), how to ask for the receipts. It is
 * a company-reported figure, so it is never added to the indexed payouts below it; the rail line
 * under it keeps the two apart.
 * Renders nothing when the entry is not public.
 */
export const GivenDirectly = ({
  railLine,
  isApp = isAppBuild(),
  className,
}: GivenDirectlyProps) => {
  const fact = publicFact(GIVEN_DIRECTLY_ID);
  if (!fact) return null;
  return (
    <section
      id="given"
      aria-labelledby="given-title"
      data-testid="given-directly"
      className={clsx(
        "relative scroll-mt-6 overflow-hidden rounded-2xl border-4 border-tt-gold-400/80 bg-tt-night-900/85 p-5 shadow-[0_6px_0_rgb(var(--tt-night-950)),0_0_48px_rgb(var(--tt-gold-400)/0.14)] md:p-8 lg:p-10",
        className
      )}
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-10">
        <div>
          <h2
            id="given-title"
            className="inline-flex items-center gap-2 font-primary text-p5 uppercase tracking-wide text-tt-pink md:text-p4"
          >
            <PixelIcon name="heart" size={18} />
            Our track record
          </h2>
          <div className="mt-3">
            <Claim id={fact.id} variant="hero" isApp={isApp} />
          </div>
        </div>

        <div className="rounded-xl border-2 border-tt-cream/25 bg-black/30 p-4 md:p-5">
          <p className="font-primary text-p6 uppercase tracking-wide text-tt-muted md:text-p5">
            How we know
          </p>
          {/* claim: F-026 (what the headline figure covers and how sure it is) */}
          <p className="mt-2 font-sans text-p5 text-tt-cream/90 md:text-p4">
            This is Token Tails&apos; own figure, reported by its founders. It
            counts {isApp ? "money" : "crypto transfers"} and goods Token Tails
            gave directly, outside the treat rail.
          </p>
          {/* claim: F-026 */}
          <p className="mt-2 font-sans text-p5 text-tt-cream/80">
            It is not part of the payout totals below and is never added to
            them. No outside source confirms it yet.
          </p>
          {offersRecords(fact) && (
            <a
              href={recordsMailto(fact.id)}
              data-testid="given-records"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-tt-gold-400 px-4 font-primary text-p6 uppercase text-tt-gold-400 hover:bg-tt-gold-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream md:text-p5"
            >
              Ask for the receipts
              <PixelIcon name="mail" size={14} />
            </a>
          )}
        </div>
      </div>

      <div
        className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-dashed border-tt-cream/20 pt-4 font-sans text-p5 text-tt-cream/85"
        data-testid="given-rail-line"
      >
        <span className="font-primary text-p6 uppercase tracking-wide text-tt-muted md:text-p5">
          Separately, on the treat rail
        </span>
        {railLine ?? <span>No payouts yet.</span>}
        <a
          href="#money"
          className="inline-flex min-h-[44px] items-center gap-1 font-primary text-p6 uppercase text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400 md:text-p5"
        >
          See the payouts
          <PixelIcon name="chevron-right" size={12} className="rotate-90" />
        </a>
      </div>
    </section>
  );
};

export default GivenDirectly;
