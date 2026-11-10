/**
 * Sim v20 (V20-CHASE.md S1, Wild Rift / LoL attack timer): "When the windup is interrupted by any means, the attack
 * timer stops counting and resets to zero" (LoL Wiki, Attack speed). A swing that never landed costs no attack, so the
 * hero may start the next one as soon as it is allowed. A swing that lands still spends the full timer.
 */
import type { World } from '../world';

/** Cancel `id`'s basic-attack windup, if one is running, and give the attack timer back. */
export function cancelSwing(w: World, id: number): void {
  if (w.windup[id] === 0) return;
  w.windup[id] = 0;
  w.attackTimer[id] = 0;
}
