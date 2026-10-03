import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { isAppBuild } from "@/components/claims/build";
import { PixelButton } from "@/components/shared/PixelButton";
import { pawView } from "./pawView";
import { useImpactMe } from "./useImpactMe";

/**
 * MY IMPACT in ABOUT ME (plan G4 "ProfileModal: a one-row summary", 2.13 row 29): the player's
 * paws and today's progress, and a link to the IMPACT tab, which is the full view. It reads paws
 * (in-game) only; it never converts purchases into surgeries or meals, and it needs no purchase
 * and no cat to render.
 */
export const MyImpactSummary = ({ onOpenImpact }: { onOpenImpact: () => void }) => {
  const { viewer, me, loading } = useImpactMe();
  const view = pawView(viewer, me, loading);
  const counted = view.state === "progress" || view.state === "earned" || view.state === "blocked";
  return (
    <div
      data-testid="my-impact-summary"
      className="mt-6 flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[4px] border-2 border-tt-gold-500/70 bg-tt-night-900/80 px-3 py-2 text-tt-cream"
    >
      {counted && (
        <span className="font-primary text-p4 uppercase" data-testid="my-impact-paws">
          {view.lifetime} paw{view.lifetime === 1 ? "" : "s"}
        </span>
      )}
      <span className="min-w-0 font-secondary text-p5">{view.text}</span>
      <EvidenceChip kind="in-game" isApp={isAppBuild()} />
      <PixelButton size="sm" text="OPEN IMPACT" onClick={onOpenImpact} />
    </div>
  );
};

export default MyImpactSummary;
