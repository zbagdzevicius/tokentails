// copy-lint: web-only rendered only by the web ShelterPayouts (app builds show AppProofNotice)
import { Campaign, CampaignProgress, claimsDateLabel } from "./campaign";
import { formatUnits } from "./logs";
import { CARD, FIGURE } from "./ui";

// Two decimals is plenty for a progress line: 12.345678 -> 12.34.
const usdc = (v18: bigint) => {
  const s = formatUnits(v18, 18);
  const [w, f] = s.split(".");
  return f ? `${w}.${f.slice(0, 2)}` : w;
};

export const CampaignMeter = ({
  campaign,
  progress,
  loading,
}: {
  campaign: Campaign;
  progress: CampaignProgress;
  loading?: boolean;
}) => (
  <section className={`${CARD} flex flex-col gap-3 text-p5`} data-testid="campaign-meter">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-primary uppercase text-p3 md:text-p2 leading-none text-tt-cream">{campaign.name}</h3>
      {claimsDateLabel(campaign.startDate) && (
        <span className="text-p6 md:text-p5 text-tt-cream/75">since {claimsDateLabel(campaign.startDate)}</span>
      )}
    </div>
    {/* One value line and the bar; the count line below adds only what the bar cannot show. */}
    <p className={`${FIGURE} text-h5 md:text-h4`}>
      {usdc(progress.raised)}{" "}
      <span className="text-p3 md:text-p2 text-tt-cream [text-shadow:none]">of {usdc(progress.goal)} USDC raised on-chain</span>
    </p>
    <div
      className="h-6 w-full overflow-hidden rounded-lg border-4 border-tt-cream bg-tt-night-950"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.percent}
      aria-label={`${campaign.name} progress`}
    >
      {/* A small gold stub at 0% so the empty bar still reads as a meter, not an input field. */}
      <div
        className="h-full bg-gradient-to-r from-tt-pink to-tt-gold-400 shadow-[0_0_12px_rgb(var(--tt-gold-400)/.6)] motion-safe:transition-all motion-safe:duration-700"
        style={{ width: `${Math.max(3, progress.percent)}%` }}
      />
    </div>
    {(progress.count > 0 || loading) && (
      <p className="text-tt-cream/90">
        {progress.count > 0 ? `From ${progress.count} payout${progress.count === 1 ? "" : "s"}` : ""}
        {loading ? `${progress.count > 0 ? " " : ""}(still counting…)` : ""}
      </p>
    )}
    {!progress.counting && (
      <p className="text-tt-cream/75">The meter starts counting when the shelter wallet goes live.</p>
    )}
  </section>
);

export default CampaignMeter;
