import { ImpactNumbers } from "@/components/impact/ImpactNumbers";
import { useImpact } from "@/hooks/useImpact";
import { cdnFile } from "@/constants/utils";
import Link from "next/link";
import { PixelButton } from "../shared/PixelButton";

/**
 * /stats (plan G11, task 5e): the same public impact snapshot as /impact and the landing, so the
 * numbers agree everywhere. The old in-process counters (`GET /quest/statistics`) and the dead
 * /airdrop link are gone.
 */
export const Stats = () => {
  const { impact, loading } = useImpact();

  return (
    <div className="flex w-full flex-col items-center gap-4 pb-12 lg:mt-8">
      <img className="w-24 md:w-32" src={cdnFile("logo/logo.webp")} alt="" aria-hidden="true" />
      {/* The page art behind /stats is peach daylight (out of the night scope), so the cream and
          gold ink sit on a night panel to keep WCAG contrast (task 3d review). */}
      <div data-testid="stats-header" className="mx-4 flex max-w-xl flex-col items-center gap-2 rounded-xl bg-tt-night-950/70 px-4 py-2">
        <h1 className="text-center font-primary text-h6 uppercase tracking-tight text-tt-cream text-balance md:text-h2">
          Token Tails <span className="text-tt-gold-400">stats</span>
        </h1>
        <p className="text-center font-secondary text-p4 text-tt-cream">
          Read from the hourly impact snapshot. Every number shows its date and how it was checked.
        </p>
      </div>
      {loading && !impact ? (
        <p className="rounded-xl bg-tt-night-950/70 px-4 py-2 font-secondary text-p5 text-tt-cream motion-safe:animate-pulse">Loading the snapshot…</p>
      ) : (
        <ImpactNumbers impact={impact} />
      )}
      <Link href="/impact" className="mt-2">
        <PixelButton as="span" text="SEE THE PROOF" />
      </Link>
    </div>
  );
};

export default Stats;
