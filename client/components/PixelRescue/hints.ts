/**
 * Cupid Cat copy for the start gate and the first-seen hints (plan G10), on the shared onboarding
 * hints module: same sentence case (`hint` role, decision #86), same input-device tracking, so a
 * keyboard player reads "Space" and a phone player "Tap".
 */
import {
  JUMP_CONTROL,
  lastInputKind,
  startLine,
  type GateCopy,
  type InputKind,
} from "@/components/Phaser/onboarding/hints";
import type { CupidHintId } from "./ftue";

/** The RunGate card for a Cupid level. */
export function cupidGate(level: string | null | undefined, input: InputKind = lastInputKind()): GateCopy {
  return {
    title: `Cupid Cat · Day ${level || "1"}`,
    goal: "Collect every heart, free the caged cat, then bring it to the portal.",
    controls:
      input === "keyboard"
        ? "Arrows or A and D to run. Space or W to jump, Z to dash, Q for your spell."
        : "Joystick to run. Big button to jump, the small ones dash and cast.",
    start: startLine(input),
  };
}

/** First-seen hint lines, chosen for the last input device. */
export function cupidHintCopy(id: CupidHintId, input: InputKind = lastInputKind()): string {
  const jump = JUMP_CONTROL[input];
  switch (id) {
    case "enemy":
      return input === "keyboard"
        ? "A guard! Jump over it, or stop it with your spell (Q)."
        : `A guard! ${jump === "Tap" ? "Jump" : jump} over it, or cast your spell.`;
    case "crate":
      return "A caged cat. Stand by the cage once every heart is yours.";
    case "portal":
      return "The portal opens when the cat is free. Bring it here.";
    case "shield":
      return "Starter shield: it blocks the first hit.";
    default:
      return "";
  }
}
