import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { isAppBuild } from "@/components/claims/build";
import { labelSet } from "@/components/claims/labels";
import { ModalButton, ModalSection } from "@/components/ui/modal";
import { pawView } from "./pawView";
import { useImpactMe } from "./useImpactMe";

/** What a paw is, in one line: the word the founder saw players stumble on. */
export const PAW_HELPER = "A paw marks a day you played enough. Impact shows how paws turn into treats.";

/**
 * MY IMPACT in ABOUT ME (plan G4 "ProfileModal: a one-row summary", 2.13 row 29): the player's
 * paws and today's progress, and one link to the IMPACT tab, which is the full view. It reads paws
 * (in-game) only; it never converts purchases into surgeries or meals, and it needs no purchase
 * and no cat to render. The IN-GAME chip sits on the line that explains it.
 */
export const MyImpactSummary = ({ onOpenImpact }: { onOpenImpact: () => void }) => {
  const { viewer, me, loading } = useImpactMe();
  const view = pawView(viewer, me, loading);
  const isApp = isAppBuild();
  // A signed-in player always sees a count, "0 paws" while the server has none yet.
  const counted =
    view.state === "progress" || view.state === "earned" || view.state === "blocked" || view.state === "unavailable";
  // A guest's one primary is Save progress (ABOUT ME): the impact link steps back for them.
  const guest = view.state === "guest";
  return (
    <ModalSection
      tone={guest ? "default" : "highlight"}
      title="My impact"
      icon="paw"
      helper={PAW_HELPER}
      data-testid="my-impact-summary"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {counted && (
            <span className="font-primary text-p3 uppercase leading-none text-tt-cream" data-testid="my-impact-paws">
              {view.lifetime} paw{view.lifetime === 1 ? "" : "s"}
            </span>
          )}
          {/* pawView owns the wording, so the rule (runs needed, spacing, account age) lives in one place. */}
          <span className="font-sans text-p5 font-semibold leading-snug text-tt-cream/90">{view.text}</span>
          {view.runs && view.state === "progress" && (
            <span className="flex items-center gap-1.5" aria-hidden="true" data-testid="my-impact-runs">
              {Array.from({ length: view.runs.needed }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < view.runs!.done
                      ? "h-2.5 w-2.5 bg-tt-gold-400"
                      : "h-2.5 w-2.5 bg-tt-night-950 [box-shadow:0_0_0_2px_rgb(var(--tt-night-500))]"
                  }
                />
              ))}
            </span>
          )}
        </div>
        <ModalButton variant={guest ? "secondary" : "primary"} size="sm" icon="heart" onClick={onOpenImpact}>
          SEE MY IMPACT
        </ModalButton>
      </div>
      <p className="flex flex-wrap items-center gap-2 border-t-2 border-tt-night-500/50 pt-2 font-sans text-p6 font-semibold leading-snug text-tt-muted">
        <EvidenceChip kind="in-game" isApp={isApp} />
        <span>{labelSet(isApp).explain["in-game"]}</span>
      </p>
    </ModalSection>
  );
};

export default MyImpactSummary;
