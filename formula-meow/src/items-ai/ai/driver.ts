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
import { AI, BOOST, DRIFT, ticks } from '../../tuning';
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
  /** ticks before another drift may start (after letting one go) */
  driftCool: number;
  /** this drift is let go before the first tier (a missed mini-turbo, low skill): release at this charge, else -1 */
  missAt: number;
  /** rival grudge: ticks left of chasing the player after the player hit this cat */
  grudge: number;
  /** this jump gets a trick tap */
  trickTry: boolean;
}

/** The driver's shared view of the race (one per SimWorld): how far the event log has been read for grudges. */
interface Shared {
  eventsRead: number;
  lastTick: number;
}

const TIER_T = DRIFT.tiers.map((s) => ticks(s));
const WIDE_TICKS = ticks(AI.wideTime);
const GRUDGE_TICKS = ticks(AI.rival.grudge);
const TRICK_T = ticks(BOOST.trick.window);

const DEFAULT_P: Personality = { skill: 0.8, aggression: 0.5, mistakeRate: 0, lineBias: 0 };

export function createAIDriver(): AIDriver {
  const mem: Memory[] = [];
  const shared: Shared = { eventsRead: 0, lastTick: -1 };
  return {
    init(ctx) {
      for (let i = 0; i < ctx.st.karts.length; i++) {
        const k = ctx.st.karts[i];
        const p = ctx.cfg.racers[i]?.ai ?? DEFAULT_P;
        const tryPounce = draw(k, 'rngAi') < 0.1 + 0.9 * p.skill;
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
          driftCool: 0,
          missAt: -1,
          grudge: 0,
          trickTry: false,
        });
      }
    },
    drive(ctx, i, out) {
      if (ctx.st.tick !== shared.lastTick) {
        shared.lastTick = ctx.st.tick;
        readGrudges(ctx, mem, shared);
      }
      drive(ctx, i, out, mem[i], ctx.cfg.racers[i]?.ai ?? DEFAULT_P);
    },
  };
}

/**
 * Rival grudges (feel lane): the player hitting their rival starts a 20 s grudge (`grudge` event, b = the player).
 * Read once per tick from the event log, so it replays exactly.
 */
function readGrudges(ctx: SimContext, mem: Memory[], sh: Shared): void {
  const ev = ctx.st.events;
  const human = ctx.cfg.humans[0];
  for (let e = sh.eventsRead; e < ev.length; e++) {
    const x = ev[e];
    if (x.type !== 'hit' || human == null || x.b !== human || x.kart === human) continue;
    const m = mem[x.kart];
    if (!m || !ctx.cfg.racers[x.kart]?.rival) continue;
    if (m.grudge === 0) ctx.emit({ type: 'grudge', kart: x.kart, b: human });
    m.grudge = GRUDGE_TICKS;
  }
  sh.eventsRead = ev.length;
  for (const m of mem) if (m.grudge > 0) m.grudge--;
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

  // mistakes (low skill): run wide for ~0.4 s, to the outside of the bend ahead (a late turn-in, a wide exit)
  if (m.slipTicks > 0) m.slipTicks--;
  else if (draw(k, 'rngAi') < p.mistakeRate * AI.mistakeChance) {
    m.slipTicks = WIDE_TICKS + Math.floor(draw(k, 'rngAi') * 12);
    const bend = curvatureAhead(ctx, k.si, 4, 24);
    const out = bend > 0.01 ? 1 : bend < -0.01 ? -1 : draw(k, 'rngAi') < 0.5 ? -1 : 1;
    m.slipBias = out * (0.6 + 0.4 * draw(k, 'rngAi'));
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
  // a rival with a grudge closing in from behind lines up on the player (a bump, a slipstream, a hairball)
  if (m.grudge > 0 && m.slipTicks === 0) {
    const h = ctx.cfg.humans[0];
    const o = h != null ? st.karts[h] : null;
    if (o && !o.finished) {
      const gap = o.dist - k.dist;
      if (gap > 2 && gap < 20) bias = clamp(o.d / Math.max(1, ctx.track.halfW[k.si] - AI.edge), -1, 1);
    }
  }
  followLine(ctx, i, out, bias, m.slipTicks > 0 ? 1.4 : 1);

  // drift where the track bends
  const sp = speedOf(k);
  const c = curvatureAhead(ctx, k.si, 2, 14);
  const turnDir = c > 0 ? -1 : 1; // left turn → drift left (steer negative)
  if (m.driftCool > 0) m.driftCool--;
  // skilled cats drift gentler bends too, and hold them longer (more orange and pink mini-turbos)
  const curvFor = AI.driftCurv * (1.25 - AI.driftSkill * p.skill);
  if (k.driftDir === 0) {
    // start only when the line itself asks to turn that way (never force a drift against the line)
    if (Math.abs(c) > curvFor && sp > DRIFT.minSpeed + 2 && !k.air && m.slipTicks === 0 && m.driftCool === 0 && out.steer * turnDir >= 2) {
      if (!m.driftWant) {
        m.driftWant = 1;
        // skilled drivers hold for orange/pink; 50cc rarely reaches pink
        const r = draw(k, 'rngAi');
        m.driftHold = r < p.skill * 0.45 ? TIER_T[2] : r < p.skill ? TIER_T[1] : TIER_T[0];
        // low skill now and then lets go too early: no mini-turbo at all
        m.missAt = draw(k, 'rngAi') < (1 - p.skill) * AI.missTurbo ? TIER_T[0] * (0.45 + 0.4 * draw(k, 'rngAi')) : -1;
      }
      out.drift = k.pDrift === 0; // press edge → hop, then hold
      if (Math.abs(out.steer) < 4 || Math.sign(out.steer) !== turnDir) out.steer = turnDir * 5;
    } else m.driftWant = 0;
  } else {
    // hold through the bend; low skill lets go early now and then (a missed tier)
    const stillBending = Math.abs(curvatureAhead(ctx, k.si, 0, 8)) > curvFor * 0.5;
    const early = (k.driftCharge >= m.driftHold && draw(k, 'rngAi') < (1 - p.skill) * 0.08) || (m.missAt >= 0 && k.driftCharge >= m.missAt);
    // the drift turns harder than the road (the line asks for full counter-steer): let go before the inside wall
    const overturning = out.steer * k.driftDir <= -5;
    out.drift = stillBending && !early && !overturning;
    if (!out.drift) {
      m.driftWant = 0;
      m.driftCool = 20;
      m.missAt = -1;
    }
  }

  // ramp tricks: a tap just after the lip (skilled cats nearly always, Kittens now and then)
  if (k.air && k.lipTicks >= 1 && k.lipTicks <= TRICK_T - 1 && !k.trick) {
    if (k.lipTicks === 1) m.trickTry = draw(k, 'rngAi') < AI.trickBase + (1 - AI.trickBase) * p.skill;
    if (m.trickTry) out.drift = k.pDrift === 0;
  }

  // corner speed (B15): lift, then brake, when the bend ahead needs more turn than the kart has without a drift
  if (k.driftDir === 0 && !k.air && !out.drift) {
    const ahead = Math.max(10, sp * 0.9);
    const c = Math.max(Math.abs(curvatureAhead(ctx, k.si, 2, ahead * 0.5)), Math.abs(curvatureAhead(ctx, k.si, ahead * 0.5, ahead)));
    const vmax = Math.sqrt((AI.cornerAccel * (1 + AI.cornerSkill * (p.skill - 0.7))) / Math.max(1e-4, c));
    if (sp > vmax * 1.12) {
      out.gas = false;
      out.brake = true;
    } else if (sp > vmax) out.gas = false;
  }

  // boost pads (B16): a skilled cat steers onto a pad on the road ahead
  if (p.skill >= AI.padSkill && m.slipTicks === 0 && k.driftDir === 0) {
    const t = ctx.track;
    for (const pad of t.pads) {
      let ahead = (pad.i - k.si) * t.step;
      if (ahead < 0) ahead += t.length;
      if (ahead < 4 || ahead > AI.padLook) continue;
      const hw = t.halfW[k.si];
      const want = clamp((pad.d - t.line[k.si]) / Math.max(1, hw - AI.edge), -1, 1);
      followLine(ctx, i, out, want, ahead < 15 ? 0.8 : 1);
      break;
    }
  }

  // items (item-brain.ts) and the capped rubber band (rubber-band.ts)
  useItems(ctx, i, out, m.brain, p, m.grudge > 0);
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
