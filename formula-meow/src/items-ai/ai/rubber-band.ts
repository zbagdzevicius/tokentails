/**
 * Rubber band (GDD 5.3, fair and capped): an AI's top-speed scale is its skill base times
 * `1 + clamp(bandK × gapToPlayer + packK × gapToPack, −bandDown, +bandUp)`, capped at the class's `maxScale`.
 *
 * - The skill base runs from the class's `aiTop` (least skilled cat in the band) to `aiTopHi` (most skilled) on a
 *   square-root curve.
 * - SIM_VERSION 7 (playtest round 2: "the field strings out, so racing is lonely"): the band also pulls every AI
 *   toward the middle of the field (`AI.packK` × metres to the median kart), so a cat far ahead of the pack eases
 *   off and a straggler catches up, and the skill bands are narrower. At 100cc and 150cc an AI behind a leading
 *   player may go a little faster than the class top speed (`maxScale` 1.03 / 1.05): the player's coins and
 *   mini-turbos are worth more than that, and a good player otherwise won alone. 50cc never exceeds 1.
 * - The player's rival (`RacerInfo.rival`) gets a class-scaled bonus on its base (`AI.rival.top`, none at 50cc) and
 *   a stronger band only while it is behind the player: it stays close, it never runs away.
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

const dists: number[] = [];

/** Gap in metres from AI kart `i` forward to the median kart of the field still racing (> 0: behind the pack). */
export function gapToPack(ctx: SimContext, i: number): number {
  const ks = ctx.st.karts;
  dists.length = 0;
  for (const k of ks) if (!k.finished && !k.out) dists.push(k.dist);
  if (dists.length < 3) return 0;
  dists.sort((a, b) => a - b);
  const m = dists.length >> 1;
  const med = dists.length % 2 ? dists[m] : (dists[m - 1] + dists[m]) / 2;
  return med - ks[i].dist;
}

/** Top-speed scale from skill alone (before the rubber band), for an AI of class `cls`. */
export function skillBase(cls: number, skill: number, rival = false): number {
  const c = classTuning(cls as 0 | 1 | 2);
  const [lo, hi] = c.aiSkill;
  const u = clamp((skill - lo) / Math.max(1e-6, hi - lo), 0, 1);
  // a square-root curve: one or two stragglers, a pack near the top (sim-safe: sqrt only)
  return Math.min(1, c.aiTop + (c.aiTopHi - c.aiTop) * Math.sqrt(u) + (rival ? AI.rival.top[cls] ?? 0 : 0));
}

/** The band adjustment alone (a fraction, −bandDown..+bandUp); the driver also scales its corner speed by it. */
export function bandAdj(ctx: SimContext, i: number): number {
  const band = classTuning(ctx.cfg.cls);
  const pack = AI.packK * gapToPack(ctx, i);
  if (ctx.cfg.humans.length === 0) return clamp(pack, -band.bandDown, band.bandUp);
  const rival = !!ctx.cfg.racers[i]?.rival;
  const up = rival ? band.bandUp + AI.rival.bandUp : band.bandUp;
  const gp = gapToPlayer(ctx, i);
  // chasing a player who leads, the pack never holds a cat back (it would hold back the only cats who could fight)
  return clamp(AI.bandK * gp + (gp > 0 ? Math.max(0, pack) : pack), -band.bandDown, up);
}

export function bandScale(ctx: SimContext, i: number, p: Personality, adj = bandAdj(ctx, i)): number {
  const band = classTuning(ctx.cfg.cls);
  const rival = !!ctx.cfg.racers[i]?.rival && ctx.cfg.humans.length > 0;
  const base = skillBase(ctx.cfg.cls, p.skill, rival);
  // above the class top speed only when chasing a player who is ahead
  const cap = ctx.cfg.humans.length > 0 && gapToPlayer(ctx, i) > 0 ? band.maxScale : 1;
  return Math.min(cap, base * (1 + adj));
}
