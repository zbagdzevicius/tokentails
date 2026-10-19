/**
 * Basic AI driver (GDD 5.2–5.3), the v1 seed the items-ai lane deepens: follows the racing line with its
 * personality's line bias, drifts where the track bends (skill decides how long it holds, so how high a tier it
 * reaches), makes seeded mistakes, tries a Pounce Start, uses Catnip on straights, and rides a capped rubber band.
 *
 * One driver instance per SimWorld (`createAIDriver()`), so its memory replays with the race. All randomness comes
 * from each kart's `rngAi` stream.
 */
import type { Personality, TickInput } from '../../types';
import { AI, DRIFT, classTuning } from '../../tuning';
import type { AIDriver, SimContext } from '../../core/sim/plugins';
import { curvatureAhead, followLine } from '../../core/sim/autopilot';
import { speedOf } from '../../core/sim/kart';
import { draw } from '../../core/sim/rng';
import { clamp } from '../../core/sim/fixed';

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
  itemWait: number;
  pressedItem: boolean;
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
          itemWait: 0,
          pressedItem: false,
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

  // items: v1 core only has Catnip (use on a straight); other items fire after a short think
  out.item = false;
  if (k.item && k.rouletteTicks === 0) {
    if (m.itemWait <= 0) m.itemWait = 20 + Math.floor(draw(k, 'rngAi') * (90 - 60 * p.aggression));
    else if (--m.itemWait <= 0) {
      const straight = Math.abs(curvatureAhead(ctx, k.si, 0, 30)) < 0.015;
      if (k.item !== 'catnip' || straight) out.item = !m.pressedItem;
      else m.itemWait = 10;
    }
  }
  m.pressedItem = out.item;

  // rubber band (GDD 5.3): capped, and never above the player's unboosted top speed
  const humans = ctx.cfg.humans;
  const band = classTuning(ctx.cfg.cls);
  const base = band.aiTop + AI.topSkill * p.skill;
  if (humans.length > 0) {
    const h = st.karts[humans[0]];
    const gap = h.dist - k.dist; // > 0: AI behind the player
    const adj = clamp(AI.bandK * gap, -band.bandDown, band.bandUp);
    k.topScale = Math.min(1, base * (1 + adj));
  } else k.topScale = Math.min(1, base);
}
