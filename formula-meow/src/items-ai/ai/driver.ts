/**
 * Basic AI driver (GDD 5.2–5.3), the v1 seed the items-ai lane deepens: follows the racing line with its
 * personality's line bias, drifts where the track bends (skill decides how long it holds, so how high a tier it
 * reaches), makes seeded mistakes, tries a Pounce Start, swerves around traps it notices, uses items (item-brain.ts)
 * and rides a capped rubber band (rubber-band.ts).
 *
 * One driver instance per SimWorld (`createAIDriver()`), so its memory replays with the race. All randomness comes
 * from each kart's `rngAi` stream.
 */
import type { Personality, TickInput } from '../../types';
import { AI, DRIFT } from '../../tuning';
import type { AIDriver, SimContext } from '../../core/sim/plugins';
import { curvatureAhead, followLine } from '../../core/sim/autopilot';
import { speedOf } from '../../core/sim/kart';
import { draw } from '../../core/sim/rng';
import { clamp } from '../../core/sim/fixed';
import { itemsOf, lapGap } from '../items/state';
import { newBrain, useItems, type BrainMemory } from './item-brain';
import { bandScale } from './rubber-band';

interface Memory {
  /** tick to press for the start (−1 = no pounce attempt, presses late) */
  startPress: number;
  /** mistake: extra bias and ticks left */
  slipBias: number;
  slipTicks: number;
  /** drift hold target in charge ticks (skill), current drift wanted */
  driftHold: number;
  driftWant: number;
  /** item use delay */
  brain: BrainMemory;
  /** last trap considered for a dodge, and whether this cat dodges it */
  dodgeId: number;
  dodge: boolean;
}

const DEFAULT_P: Personality = { skill: 0.8, aggression: 0.5, mistakeRate: 0, lineBias: 0 };

export function createAIDriver(): AIDriver {
  const mem: Memory[] = [];
  return {
    init(ctx) {
      for (let i = 0; i < ctx.st.karts.length; i++) {
        const k = ctx.st.karts[i];
        const p = ctx.cfg.racers[i]?.ai ?? DEFAULT_P;
        const tryPounce = draw(k, 'rngAi') < 0.25 + 0.6 * p.skill;
        const jitter = Math.floor(draw(k, 'rngAi') * 12) - 6;
        mem.push({
          startPress: tryPounce ? ctx.goTick + jitter : ctx.goTick + 15 + Math.floor(draw(k, 'rngAi') * 20),
          slipBias: 0,
          slipTicks: 0,
          driftHold: 0,
          driftWant: 0,
          brain: newBrain(),
          dodgeId: 0,
          dodge: false,
        });
      }
    },
    drive(ctx, i, out) {
      drive(ctx, i, out, mem[i], ctx.cfg.racers[i]?.ai ?? DEFAULT_P);
    },
  };
}

function drive(ctx: SimContext, i: number, out: TickInput, m: Memory, p: Personality): void {
  const { st } = ctx;
  const k = st.karts[i];
  if (st.tick < ctx.goTick || (st.tick <= m.startPress + 2 && st.tick < ctx.goTick + 40)) {
    // grid: one press for the start
    out.steer = 0;
    out.gas = st.tick >= m.startPress;
    out.brake = out.drift = out.item = out.itemBack = false;
    return;
  }

  // mistakes: a seeded wobble off the line (late turn-in, wide exit)
  if (m.slipTicks > 0) m.slipTicks--;
  else if (draw(k, 'rngAi') < p.mistakeRate * 0.004) {
    m.slipTicks = 30 + Math.floor(draw(k, 'rngAi') * 40);
    m.slipBias = (draw(k, 'rngAi') - 0.5) * 1.6;
  }
  let bias = clamp(p.lineBias + (m.slipTicks > 0 ? m.slipBias : 0), -1, 1);
  // pass a kart that sits on our line just ahead instead of rear-ending it
  for (let j = 0; j < st.karts.length; j++) {
    if (j === i) continue;
    const o = st.karts[j];
    const ahead = o.dist - k.dist;
    if (ahead > 0.5 && ahead < 9 && Math.abs(o.d - k.d) < 2.2) {
      const hw = ctx.track.halfW[k.si];
      bias = clamp(o.d > k.d ? (o.d - 3.2) / hw : (o.d + 3.2) / hw, -1, 1);
      break;
    }
  }
  bias = dodgeBias(ctx, i, m, p, bias);
  followLine(ctx, i, out, bias, m.slipTicks > 0 ? 1.4 : 1);

  // drift where the track bends
  const sp = speedOf(k);
  const c = curvatureAhead(ctx, k.si, 2, 14);
  const turnDir = c > 0 ? -1 : 1; // left turn → drift left (steer negative)
  if (k.driftDir === 0) {
    if (Math.abs(c) > AI.driftCurv && sp > DRIFT.minSpeed + 2 && !k.air && m.slipTicks === 0) {
      if (!m.driftWant) {
        m.driftWant = 1;
        // skilled drivers hold for orange/pink; 50cc rarely reaches pink
        const tiers = [36, 72, 120];
        const r = draw(k, 'rngAi');
        m.driftHold = r < p.skill * 0.45 ? tiers[2] : r < p.skill ? tiers[1] : tiers[0];
      }
      out.drift = k.pDrift === 0; // press edge → hop, then hold
      if (Math.abs(out.steer) < 4 || Math.sign(out.steer) !== turnDir) out.steer = turnDir * 5;
    } else m.driftWant = 0;
  } else {
    // hold through the bend; low skill lets go early now and then (a missed tier)
    const stillBending = Math.abs(curvatureAhead(ctx, k.si, 0, 8)) > AI.driftCurv * 0.5;
    const early = k.driftCharge >= m.driftHold && draw(k, 'rngAi') < (1 - p.skill) * 0.08;
    out.drift = stillBending && !early;
    if (!out.drift) m.driftWant = 0;
  }

  // items (item-brain.ts) and the capped rubber band (rubber-band.ts)
  useItems(ctx, i, out, m.brain, p);
  k.topScale = bandScale(ctx, i, p);
}

/**
 * Swerve around a trap on our line 4–24 m ahead. Whether this cat sees it is decided once per trap from the
 * `rngAi` stream (skilled cats dodge more; Kitten cats walk into cucumbers, which is the point).
 */
function dodgeBias(ctx: SimContext, i: number, m: Memory, p: Personality, bias: number): number {
  const k = ctx.st.karts[i];
  const hw = ctx.track.halfW[k.si];
  for (const t of itemsOf(ctx.st).traps) {
    if (t.flight > 0) continue;
    const g = lapGap(ctx.track, t.dist - k.dist);
    if (g < 4 || g > 24 || Math.abs(t.d - k.d) > 2.6) continue;
    if (m.dodgeId !== t.id) {
      m.dodgeId = t.id;
      m.dodge = draw(k, 'rngAi') < 0.3 + 0.65 * p.skill;
    }
    if (!m.dodge) return bias;
    const side = t.d > 0 ? -1 : 1;
    return clamp((t.d + side * 3.4) / hw, -1, 1);
  }
  return bias;
}
