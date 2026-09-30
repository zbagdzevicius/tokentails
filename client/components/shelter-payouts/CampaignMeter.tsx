import { Campaign, CampaignProgress } from "./campaign";
import { formatUnits } from "./logs";

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
  <section
    className="w-full rounded-xl border-2 border-yellow-900 bg-black/60 p-4 font-secondary text-p5"
    data-testid="campaign-meter"
  >
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-primary uppercase text-p3">{campaign.name}</h3>
      {campaign.startDate && <span className="opacity-80">since {campaign.startDate}</span>}
    </div>
    <div
      className="mt-3 h-5 w-full overflow-hidden rounded-full border-2 border-yellow-900 bg-white/20"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.percent}
      aria-label={`${campaign.name} progress`}
    >
      <div
        className="h-full bg-pink-400 transition-all duration-700"
        style={{ width: `${progress.percent}%` }}
      />
    </div>
    <p className="mt-2">
      <strong>{usdc(progress.raised)}</strong> of {usdc(progress.goal)} USDC raised on-chain
      {progress.count > 0 ? ` from ${progress.count} payout${progress.count === 1 ? "" : "s"}` : ""}
      {loading ? " (still counting…)" : ""}
    </p>
    {!progress.counting && (
      <p className="opacity-80">The meter starts counting when the shelter wallet goes live.</p>
    )}
  </section>
);

export default CampaignMeter;
