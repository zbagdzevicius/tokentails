import { PixelIcon } from "@/components/shared/PixelIcon";
import { TAILS_NO_CASH_VALUE } from "@/shared-contracts/copy";
import { useEffect, useReducer } from "react";
import { tailsExplainer, type SceneState, type TailsExplainerQueue } from "./explainer";
import { ImpactButton } from "./impact/Panel";

const STEPS = [
  { lead: "Earn them by playing.", rest: "Every run, mission and tier pays Tails." },
  { lead: "Give them to a goal.", rest: "Your Tails choose which goal is delivered next." },
  { lead: "Your rank stays.", rest: "Giving never lowers your rank or tier progress." },
] as const;

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
    <section
      data-testid="tails-explainer"
      aria-labelledby="tails-explainer-title"
      className="relative flex w-full flex-col gap-3 rounded-2xl border-2 border-tt-gold-500 bg-gradient-to-br from-tt-night-700 via-tt-night-800 to-tt-night-900 p-3 text-tt-cream shadow-[0_6px_0_rgb(var(--tt-night-950)/0.6),0_0_24px_rgb(var(--tt-gold-400)/0.15)] md:p-4"
    >
      <h3 id="tails-explainer-title" className="flex items-center gap-2 font-primary text-p4 uppercase text-tt-gold-400 md:text-p3">
        <PixelIcon name="heart" size={18} className="text-tt-pink" />
        Tails are rescue points
      </h3>
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.lead} className="flex items-start gap-2 font-secondary text-p5 leading-snug">
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-tt-gold-500/60 font-primary text-p6 text-tt-gold-400"
            >
              {i + 1}
            </span>
            <span>
              <strong className="font-bold">{step.lead}</strong> {step.rest}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-secondary text-p6 text-tt-muted">{TAILS_NO_CASH_VALUE}</p>
        <ImpactButton onClick={() => queue.dismiss()} testId="tails-explainer-ok">
          Got it
        </ImpactButton>
      </div>
    </section>
  );
};

export default TailsExplainer;
