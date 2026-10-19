/**
 * Rubber band (GDD 5.3, fair and capped): an AI's top-speed scale is its skill base times
 * `1 + clamp(k × gapToPlayer, −bandDown, +bandUp)`, and never above 1, so an AI never goes faster than the
 * player's unboosted top speed unless it is boosting itself. The player never gets hidden speed.
 */
import type { Personality } from '../../types';
import { AI, classTuning } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { clamp } from '../../core/sim/fixed';

/** Gap in metres from AI kart `i` forward to the first human (> 0: the AI is behind the player). */
export function gapToPlayer(ctx: SimContext, i: number): number {
  const h = ctx.cfg.humans[0];
  if (h == null) return 0;
  return ctx.st.karts[h].dist - ctx.st.karts[i].dist;
}

export function bandScale(ctx: SimContext, i: number, p: Personality): number {
  const band = classTuning(ctx.cfg.cls);
  const base = band.aiTop + AI.topSkill * p.skill;
  if (ctx.cfg.humans.length === 0) return Math.min(1, base);
  const adj = clamp(AI.bandK * gapToPlayer(ctx, i), -band.bandDown, band.bandUp);
  return Math.min(1, base * (1 + adj));
}
