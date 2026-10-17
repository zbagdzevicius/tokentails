// copy-lint: web-only the line renders only in the Moon Rave callouts, which never show in the app build
import { formatRaveUsd, type RaveLive } from "./raveLive";
import clsx from "clsx";

/** "25 cats dancing" / "1 cat dancing", with no-break spaces so the phrase never splits. */
export const catsDancing = (cats: number) =>
  `${cats.toLocaleString("en-US")}\u00A0${cats === 1 ? "cat" : "cats"}\u00A0dancing`;

/**
 * The live line: "$25.75 paid out for Pink Paw on-chain · 25 cats dancing" (the rave's own wording,
 * no payer named: the total mixes Token Tails' and givers' payouts; RaveSection's rule names both).
 * A skeleton while the read is in flight; nothing at all when the payouts could not be read (never a
 * made-up number). Callers reserve the line's height, so neither the number arriving nor it
 * staying hidden moves the layout.
 *
 * claim: live rave total (no facts.json id yet: the registry is private; to add as L-rave). The total
 *   is every ShelterSplit payout on the 7 mainnets, read live from GET /shelter/payouts (the rave's
 *   own source): Token Tails' treats and shelter-cat shares, and givers' wallet gifts, matches and
 *   rave cats. Cats = floor(total USD), the rave's $1 = 1 cat rule. "for Pink Paw", not "to": before
 *   16 Oct 2026 the splits paid a wallet Token Tails held for the shelter (disclosed on /shelter-payouts).
 */
export const RaveLiveLine = ({
  live,
  className,
  skeletonClassName,
  stackOnPhone = false,
}: {
  live: RaveLive;
  className?: string;
  skeletonClassName?: string;
  /** Phones: the two halves on their own lines, no dangling "·" (the hero pill). */
  stackOnPhone?: boolean;
}) => {
  if (live.state === "loading") {
    return (
      <span
        aria-hidden
        data-testid="rave-live-skeleton"
        className={clsx(
          "inline-block h-5 md:h-6 w-56 max-w-full animate-pulse rounded-full bg-tt-cream/25 ring-1 ring-tt-mint/40",
          skeletonClassName
        )}
      />
    );
  }
  if (!live.total) return null;
  return (
    <span data-testid="rave-live-line" className={className}>
      {/* claim: live rave total, read live (see above) */}
      <strong className="whitespace-nowrap font-bold text-tt-mint">{formatRaveUsd(live.total.usdMicro)}</strong> paid out
      for Pink Paw on-chain
      {stackOnPhone ? (
        <>
          <span className="hidden sm:inline"> · </span>
          <br className="sm:hidden" />
        </>
      ) : (
        " · "
      )}
      <strong className="whitespace-nowrap font-bold text-tt-pink">{catsDancing(live.total.cats)}</strong>
    </span>
  );
};
