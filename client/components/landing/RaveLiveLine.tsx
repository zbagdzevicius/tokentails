// copy-lint: web-only the line renders only in the Moon Rave callouts, which never show in the app build
import { formatRaveUsd, type RaveLive } from "./raveLive";
import clsx from "clsx";

/** "25 cats dancing" / "1 cat dancing". */
export const catsDancing = (cats: number) => `${cats.toLocaleString("en-US")} ${cats === 1 ? "cat" : "cats"} dancing`;

/**
 * The live line: "Token Tails has paid out $25.75 for Pink Paw on-chain · 25 cats dancing". A skeleton while
 * the read is in flight; nothing at all when the payouts could not be read (never a made-up number).
 *
 * claim: live rave total (no facts.json id yet: the registry is private; to add as L-rave). The total
 *   is every ShelterSplit payout on the 7 mainnets, read live from GET /shelter/payouts (the rave's
 *   own source); cats = floor(total USD), the rave's $1 = 1 cat rule. "for Pink Paw", not "to": before
 *   16 Oct 2026 the splits paid a wallet Token Tails held for the shelter (disclosed on /shelter-payouts).
 */
export const RaveLiveLine = ({ live, className }: { live: RaveLive; className?: string }) => {
  if (live.state === "loading") {
    return (
      <span
        aria-hidden
        data-testid="rave-live-skeleton"
        className={clsx("inline-block h-[1.1em] w-56 max-w-full animate-pulse rounded-full bg-tt-mint/20", className)}
      />
    );
  }
  if (!live.total) return null;
  return (
    <span data-testid="rave-live-line" className={className}>
      {/* claim: live rave total, read live (see above) */}
      Token Tails has paid out <strong className="font-bold text-tt-mint">{formatRaveUsd(live.total.usdMicro)}</strong>{" "}
      for Pink Paw on-chain · <strong className="font-bold text-tt-pink">{catsDancing(live.total.cats)}</strong>
    </span>
  );
};
