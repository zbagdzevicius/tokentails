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
import { AI, BOOST, COINS, DRIFT, PHYS, STUNT, classTuning, ticks } from '../../tuning';
import type { BuiltPiece } from '../../core/track/stunt';
import type { AIDriver, SimContext } from '../../core/sim/plugins';
import { curvatureAhead, followLine, STEER_GAIN, stuntEntryAhead } from '../../core/sim/autopilot';
import { routeRemaining } from '../../core/track/branch-ai';
import { speedOf } from '../../core/sim/kart';
import { draw } from '../../core/sim/rng';
import { atan2L, clamp, wrapAngle } from '../../core/sim/fixed';
import { itemsOf, lapGap } from '../items/state';
import { newBrain, useItems, type BrainMemory } from './item-brain';
import { bandAdj, bandScale } from './rubber-band';

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

/**
 * Set pieces (SIM_VERSION 8, ai-ugc lane, SETPIECES.md section 4). No new drift this close (m) to a loop's strip or a
 * jump lip, and a drift still held this close to a lip is let go (the launch would end it without its mini-turbo).
 * No brake this close to either (the loop and the lip floor the speed anyway). Wall lanes: cats with skill ≥
 * `AI.padSkill` line up from `laneEarly` m before the lane and ride its centre until `laneLate` m before its end.
 * Trick taps off a jump gap's lip need skill ≥ `trickSkill`.
 */
export const STUNT_AI = { noDrift: 20, letGo: 7, noBrake: 25, laneEarly: 25, laneLate: 10, laneIn: 1.4, laneCost: 8, trickSkill: 0.6 } as const;

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

  // SIM_VERSION 8: on a loop's rail or held by a jump's net: hands off, gas on (the rail auto-centres), no item press
  // (item use is buffered until the exit), the rubber band still applies
  if (k.rail > 0 || k.netTicks > 0) {
    out.steer = 0;
    out.gas = true;
    out.brake = out.drift = out.item = out.itemBack = false;
    m.driftWant = 0;
    k.topScale = bandScale(ctx, i, p, bandAdj(ctx, i));
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
  // SIM_VERSION 7: no new drift (and so no mini-turbo) in the last stretch of a branch: the merge can be steep
  const branchLeft = routeRemaining(ctx, k.si);
  const nearMerge = branchLeft !== null && branchLeft < Math.max(25, speedOf(k) * 1.2);
  // SIM_VERSION 8: a loop entry or a jump lip just ahead (main road only), and the wall lane this cat rides
  const onMain = k.branch < 0;
  const toStunt = onMain ? stuntEntryAhead(ctx, k.si, STUNT_AI.noBrake) : -1;
  const lane = onMain && p.skill >= AI.padSkill && m.slipTicks === 0 && !k.air ? laneOf(ctx, i) : 0;

  // drift where the track bends
  const sp = speedOf(k);
  const c = curvatureAhead(ctx, k.si, 2, 14);
  const turnDir = c > 0 ? -1 : 1; // left turn → drift left (steer negative)
  if (m.driftCool > 0) m.driftCool--;
  // skilled cats drift gentler bends too, and hold them longer (more orange and pink mini-turbos)
  const curvFor = AI.driftCurv * (1.25 - AI.driftSkill * p.skill);
  if (k.driftDir === 0) {
    // start only when the line itself asks to turn that way (never force a drift against the line)
    if (!nearMerge && (toStunt < 0 || toStunt > STUNT_AI.noDrift) && !lane && Math.abs(c) > curvFor && sp > DRIFT.minSpeed + 2 && !k.air && m.slipTicks === 0 && m.driftCool === 0 && out.steer * turnDir >= 2) {
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
    // (SIM_VERSION 6) hold through the exit: a mini-turbo fired with the nose still pointing at the outside wall
    // cannot turn back at boost speed
    const stillBending = Math.max(Math.abs(curvatureAhead(ctx, k.si, 0, 8)), Math.abs(curvatureAhead(ctx, k.si, -4, 4))) > curvFor * 0.5;
    const early = (k.driftCharge >= m.driftHold && draw(k, 'rngAi') < (1 - p.skill) * 0.08) || (m.missAt >= 0 && k.driftCharge >= m.missAt);
    // the drift turns harder than the road (the line asks for full counter-steer): let go before the inside wall
    const overturning = out.steer * k.driftDir <= -5;
    // a jump lip right ahead: let go now, the launch would end the drift without its mini-turbo
    const lip = onMain ? stuntEntryAhead(ctx, k.si, STUNT_AI.letGo, 'jump') : -1;
    out.drift = stillBending && !early && !overturning && !nearMerge && lip < 0;
    if (!out.drift) {
      m.driftWant = 0;
      m.driftCool = 20;
      m.missAt = -1;
    }
  }

  // ramp tricks: a tap just after the lip (skilled cats nearly always, Kittens now and then)
  if (k.air && k.lipTicks >= 1 && k.lipTicks <= TRICK_T - 1 && !k.trick) {
    // SIM_VERSION 8: off a jump gap's lip only the skilled cats try one
    if (k.lipTicks === 1) m.trickTry = draw(k, 'rngAi') < AI.trickBase + (1 - AI.trickBase) * p.skill && (k.gapLaunch === 0 || p.skill >= STUNT_AI.trickSkill);
    if (m.trickTry) out.drift = k.pDrift === 0;
  }

  // the rubber band (rubber-band.ts) also moves corner speed (SIM_VERSION 7): a cat behind the pack carries a little
  // more through the bends, one far ahead a little less, so the field stays together where top speed does not decide
  const adj = bandAdj(ctx, i);
  // corner speed (B15): lift, then brake, when the bend ahead needs more turn than the kart has without a drift
  // (SIM_VERSION 8: not while lining up for or riding a wall lane: its line has a much larger radius than the road's)
  if (k.driftDir === 0 && !k.air && !out.drift && !lane) {
    const ahead = Math.max(10, sp * 0.9);
    let c = Math.max(Math.abs(curvatureAhead(ctx, k.si, 2, ahead * 0.5)), Math.abs(curvatureAhead(ctx, k.si, ahead * 0.5, ahead)));
    // a ramp ahead (SIM_VERSION 7): the kart barely steers in the air, so the landing bend counts from the lip
    for (const r of ctx.track.ramps) {
      let toLip = (r.i - k.si) * ctx.track.step;
      if (toLip < -ctx.track.length / 2) toLip += ctx.track.length;
      if (toLip < 0 || toLip > ahead) continue;
      const land = Math.abs(curvatureAhead(ctx, k.si, toLip, toLip + sp * 0.8)) * 2.2;
      if (land > c) c = land;
    }
    const cc = Math.max(1e-4, c);
    // the grip limit, and the steering limit: yaw rate falls with speed (SIM_VERSION 6), so a tight bend at top speed
    // needs a lift even when the tyres would hold (v · c ≤ yaw(v), with a little slack for using the road width)
    const top = classTuning(ctx.cfg.cls).topSpeed;
    const yaw = sp <= PHYS.yawLowSpeed ? PHYS.yawLow : PHYS.yawLow + (PHYS.yawHigh - PHYS.yawLow) * Math.min(1, (sp - PHYS.yawLowSpeed) / (top - PHYS.yawLowSpeed));
    const vmax = (1 + AI.cornerBand * adj + AI.cornerClass * ctx.cfg.cls) * Math.min(Math.sqrt((AI.cornerAccel * (1 + AI.cornerSkill * (p.skill - 0.7))) / cc), (yaw * (1.12 + 0.12 * p.skill)) / cc);
    if (sp > vmax * 1.12 && toStunt < 0) {
      out.gas = false;
      out.brake = true;
    } else if (sp > vmax) out.gas = false;
  }

  // boost pads (B16) and fish coins only change the steering: keep the corner lift / brake decided above
  // (SIM_VERSION 7: a pad or coin on the way into a hairpin used to cancel the brake, and a boosted cat flew into the wall)
  const gas = out.gas;
  const brake = out.brake;
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

  // fish coins (SIM_VERSION 7): a cat with room for more steers onto a coin just ahead on its side of the road
  if (k.driftDir === 0 && m.slipTicks === 0 && k.coins < COINS.max && k.branch < 0) {
    const t = ctx.track;
    const reach = AI.coinLook * (0.5 + 0.5 * p.skill);
    for (let c = 0; c < t.coins.length; c++) {
      if (ctx.st.coins[c] > 0) continue;
      const cn = t.coins[c];
      let ahead = (cn.i - k.si) * t.step;
      if (ahead < -t.length / 2) ahead += t.length;
      if (ahead < 3 || ahead > reach || Math.abs(cn.d - k.d) > AI.coinReach) continue;
      const hw = t.halfW[k.si];
      followLine(ctx, i, out, clamp((cn.d - t.line[cn.i]) / Math.max(1, hw - AI.edge), -1, 1), 0.8);
      break;
    }
  }

  out.gas = gas;
  out.brake = brake;
  // SIM_VERSION 8: a skilled cat rides the wall lane (its line has the larger radius, and the lane boosts)
  if (lane) laneSteer(ctx, i, out, lane);
  wallGuard(ctx, i, out, p);

  // items (item-brain.ts) and the capped rubber band (rubber-band.ts)
  useItems(ctx, i, out, m.brain, p, m.grudge > 0);
  k.topScale = bandScale(ctx, i, p, adj);
}

/**
 * Extra metres (time × top speed) riding a wall piece's lane costs against the racing line: the lane's inner part sits
 * on the outside of the bend (a longer way round), the lane's boost gives some back. Built once per track. A lane is
 * worth riding at ≤ `STUNT_AI.laneCost` m (≈ 0.3 s at 50cc); on a tight bend the outside lane is much longer than the
 * boost repays, and a racing cat stays on its line there (SETPIECES.md 3.2 wants lanes within ±0.2 s: placement and
 * `STUNT.wall.level` decide it).
 */
export function laneCostM(t: SimContext['track'], pc: BuiltPiece): number {
  let memo = laneMemo.get(t);
  if (!memo) laneMemo.set(t, (memo = []));
  const hit = memo[pc.id];
  if (hit !== undefined) return hit;
  let cost = 0;
  for (let k = pc.i0; k !== pc.i1; k = (k + 1) % t.n) {
    const side = pc.side !== 0 ? pc.side : t.curv[k] >= 0 ? 1 : -1;
    if ((side > 0 ? t.laneR[k] : t.laneL[k]) < 2) continue;
    // + = the lane is on the outside of the bend here
    const kap = t.curv[k] * side;
    cost += t.step * ((1 + kap * (t.halfW[k] + STUNT_AI.laneIn)) / STUNT.wall.level - (1 + kap * t.line[k] * side));
  }
  memo[pc.id] = cost;
  return cost;
}

const laneMemo = new WeakMap<object, number[]>();

/**
 * The wall lane a kart is lining up for or riding (SIM_VERSION 8): +1 right / -1 left, 0 = none. From `laneEarly` m
 * before a wall piece's start until `laneLate` m before its end, when the lane is worth riding (`laneCostM`); a
 * half-pipe (side 0) is ridden on the kart's side.
 */
export function laneOf(ctx: SimContext, i: number): -1 | 0 | 1 {
  const t = ctx.track;
  const k = ctx.st.karts[i];
  for (const pc of t.pieces) {
    if (pc.kind !== 'wall') continue;
    let pos = ((((k.si - pc.i0) % t.n) + t.n) % t.n) * t.step;
    if (pos > t.length / 2) pos -= t.length;
    const len = ((((pc.i1 - pc.i0) % t.n) + t.n) % t.n) * t.step;
    if (pos < -STUNT_AI.laneEarly || pos > len - STUNT_AI.laneLate || laneCostM(t, pc) > STUNT_AI.laneCost) continue;
    return pc.side !== 0 ? pc.side : k.d >= 0 ? 1 : -1;
  }
  return 0;
}

/** Steer at the wall lane's centre a look-ahead in front (the outside edge of the road before the lane opens). */
function laneSteer(ctx: SimContext, i: number, out: TickInput, side: -1 | 1): void {
  const t = ctx.track;
  const k = ctx.st.karts[i];
  const sp = speedOf(k);
  const look = clamp(sp * AI.lookTime, AI.lookMin, AI.lookMax);
  const j = (k.si + Math.max(1, Math.round(look / t.step))) % t.n;
  const lane = side > 0 ? t.laneR[j] : t.laneL[j];
  // the lane's inner part (the boost counts anywhere on it; its centre is a much longer way round the bend)
  const d = side * (lane > 2 ? t.halfW[j] + STUNT_AI.laneIn : t.halfW[j] - AI.edge + lane * 0.5);
  const tx = t.px[j] - t.tz[j] * d;
  const tz = t.pz[j] + t.tx[j] * d;
  const err = wrapAngle(atan2L(tx - k.x, tz - k.z) - k.heading);
  out.steer = Math.round(clamp(-err * STEER_GAIN, -1, 1) * 7);
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

/**
 * Wall guard (SIM_VERSION 7, playtest round 2: 4–19 grazes per AI kart per race, nearly all on the inside of a bend
 * after a drift or a mini-turbo). When the kart will reach the wall within `AI.wallLook` seconds at its sideways
 * speed, it steers away (a drift goes wide; a drift that still runs into the wall is let go). Skilled cats react a
 * little earlier. Main road only: branches have their own walls.
 */
function wallGuard(ctx: SimContext, i: number, out: TickInput, p: Personality): void {
  const k = ctx.st.karts[i];
  if (k.branch >= 0 || k.air || k.spinTicks > 0 || k.autoTicks > 0) return;
  const t = ctx.track;
  const side = k.d >= 0 ? 1 : -1;
  // contact happens with the kart's side at the wall: `wallMargin` beyond the road edge, less half the kart
  const wall = (side > 0 ? t.wallR[k.si] : t.wallL[k.si]) - PHYS.kartHalfWidth;
  const room = wall - Math.abs(k.d);
  const lat = (k.vx * -t.tz[k.si] + k.vz * t.tx[k.si]) * side; // sideways speed toward that wall, m/s
  if (lat <= 0) return;
  const need = lat * (AI.wallLook * (0.6 + 0.6 * p.skill)) + AI.wallPad;
  if (room > need) return;
  // steer away, harder the closer the wall (never less than the line already asks for); steer < 0 moves toward +d
  const want = -side * Math.min(7, 2 + Math.round((5 * (need - room)) / Math.max(0.3, need)));
  if (out.steer * -side < Math.abs(want)) out.steer = want;
  // heading into the wall at a steep angle (a branch exit, a bounce): brake as well, a head-on costs more
  if (lat > 0.5 * speedOf(k) && room < lat * 0.6) {
    out.gas = false;
    out.brake = true;
  }
  // never start a drift while steering off a wall: the hop would take the guard's direction, against the bend
  if (k.driftDir === 0 || room < lat * 0.18 + 0.3) out.drift = false;
}
