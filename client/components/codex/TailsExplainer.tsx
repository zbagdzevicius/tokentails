import { PixelIcon } from "@/components/shared/PixelIcon";
import { ModalButton, ModalSection } from "@/components/ui/modal";
import { TAILS_NO_CASH_VALUE } from "@/shared-contracts/copy";
import { useEffect, useReducer } from "react";
import { tailsExplainer, type SceneState, type TailsExplainerQueue } from "./explainer";

const STEPS = [
  { lead: "Earn them by playing.", rest: "Every run, mission and tier pays Tails." },
  { lead: "Give them to a goal.", rest: "Your Tails choose which goal is delivered next." },
  { lead: "Your rank stays.", rest: "Giving never lowers your rank or tier progress." },
] as const;

const ExplainerSteps = () => (
  <ol className="grid grid-cols-1 gap-2 md:grid-cols-3">
    {STEPS.map((step, i) => (
      <li key={step.lead} className="flex items-start gap-2 font-sans text-p6 font-semibold leading-snug text-tt-cream md:text-p5">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-tt-night-950/60 font-primary text-p6 text-tt-gold-400"
        >
          {i + 1}
        </span>
        <span>
          <strong className="font-extrabold text-tt-gold-400">{step.lead}</strong> {step.rest}
        </span>
      </li>
    ))}
  </ol>
);

/**
 * Hosts the queued "Tails are rescue points" explainer (plan G5 "Explainer"). It shows only
 * while a request waits and the scene allows it (a menu or a game-over screen, never a running
 * scene); otherwise nothing renders and the request keeps waiting.
 *
 * It is an inline card at the top of PROGRESS, not a second dialog: a modal on top of PROGRESS
 * would hide PROGRESS from assistive tech and trap focus for a note the player can read in place.
 */
export const TailsExplainer = ({
  scene,
  queue = tailsExplainer,
}: {
  scene: SceneState | null;
  queue?: TailsExplainerQueue;
}) => {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => queue.subscribe(rerender), [queue]);
  if (!queue.shouldShow(scene)) return null;
  return (
    <ModalSection
      tone="highlight"
      title="Tails are rescue points"
      icon="heart"
      helper={TAILS_NO_CASH_VALUE}
      data-testid="tails-explainer"
      aside={
        <ModalButton variant="secondary" size="sm" onClick={() => queue.dismiss()} data-testid="tails-explainer-ok">
          Got it
        </ModalButton>
      }
    >
      {/* On a short landscape the steps fold away: the title, the line and GOT IT are enough. */}
      <div className="short:hidden">
        <ExplainerSteps />
      </div>
      <details className="group hidden short:block">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 font-primary text-p5 uppercase tracking-wide text-tt-cream">
          How it works
          <PixelIcon name="chevron-right" size={16} className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <ExplainerSteps />
      </details>
    </ModalSection>
  );
};

export default TailsExplainer;
