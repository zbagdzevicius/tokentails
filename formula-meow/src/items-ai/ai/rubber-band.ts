/**
 * Rubber band (GDD 5.3, fair and capped): an AI's top-speed scale is its skill base times
 * `1 + clamp(k × gapToPlayer, −bandDown, +bandUp)`, and never above 1, so an AI never goes faster than the
 * player's unboosted top speed unless it is boosting itself. The player never gets hidden speed.
 *
 * Iteration 2 (feel lane): the skill base runs from the class's `aiTop` (least skilled cat in the band) to `aiTopHi`
 * (most skilled) on a square-root curve, so each field has a pack up front and a straggler or two; the band is softer (50cc catches up by at most 2 %). The
 * player's rival (`RacerInfo.rival`) gets +4 % on its base and a band of up to +8 %: it stays with you.
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

/** Top-speed scale from skill alone (before the rubber band), for an AI of class `cls`. */
export function skillBase(cls: number, skill: number, rival = false): number {
  const c = classTuning(cls as 0 | 1 | 2);
  const [lo, hi] = c.aiSkill;
  const u = clamp((skill - lo) / Math.max(1e-6, hi - lo), 0, 1);
  // a square-root curve: one or two stragglers, a pack near the top (sim-safe: sqrt only)
  return Math.min(1, c.aiTop + (c.aiTopHi - c.aiTop) * Math.sqrt(u) + (rival ? AI.rival.top : 0));
}

export function bandScale(ctx: SimContext, i: number, p: Personality): number {
  const band = classTuning(ctx.cfg.cls);
  const rival = !!ctx.cfg.racers[i]?.rival && ctx.cfg.humans.length > 0;
  const base = skillBase(ctx.cfg.cls, p.skill, rival);
  if (ctx.cfg.humans.length === 0) return base;
  const up = rival ? Math.max(band.bandUp, AI.rival.bandUp) : band.bandUp;
  const adj = clamp(AI.bandK * gapToPlayer(ctx, i), -band.bandDown, up);
  return Math.min(1, base * (1 + adj));
}
