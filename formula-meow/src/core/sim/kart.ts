/**
 * Arcade kart physics (GDD 3.2–3.6). No physics engine: a planar state with a grip model that pulls the velocity
 * toward the heading, an explicit drift model (travel direction rotates at the drift yaw, the body sits at a slip
 * angle inside it), boosts that refresh instead of stacking, ramps, walls and hits. Sim-safe math only.
 */
import { BoostSource, DT, HitKind, Surface, type KartState, type TickInput } from '../../types';
import { BOOST, COINS, DRIFT, HITS, ITEMS, PHYS, RACE, ticks, type ClassTuning } from '../../tuning';
import { BODY_STEP, bodyStats } from '../../content/karts';
import { atan2L, clamp, cosL, headingOf, lerp, pow06, sinL, wrapAngle } from './fixed';
import type { SimContext } from './plugins';
import { queryTrack, type TrackHit } from '../track/query';
import { respawnSampleOf } from '../track/stunt';
import { airAssist, checkNet, pushSkipsTrigger, stripAssist, hitsLipFace, launch, landed, laneAt, lipCrossed, stepLane, stepNet, stepRail, stuntImmune, tryAttachRail } from './stunt';

const SIN30 = 0.5;
/** sin of the head-on angle (50°, B11) */
const SIN_HEAD_ON = sinL(PHYS.wallHeadOnAngle);
/** a head-on also needs this much speed into the wall, m/s (a slow nudge is a graze) */
const HEAD_ON_MIN = 3;
const WALL_WOBBLE = ticks(PHYS.wallWobble);
const WRONG_BANNER = ticks(PHYS.wrongWay);
const WRONG_RESPAWN = ticks(PHYS.wrongWayRespawn);
const BLOCKED_CD = ITEMS.blockedCooldownTicks;
const TIER_TICKS = DRIFT.tiers.map((s) => ticks(s));
const HOP_TICKS = ticks(PHYS.hop);
const ARM_TICKS = ticks(DRIFT.entryWindow);
const PIN_TICKS = ticks(PHYS.pinRespawn);
const STEER_RATE = DT / PHYS.steerSmooth;
const TRICK_WINDOW = ticks(BOOST.trick.window);
const GUARD = ticks(HITS.guard);
const GUARD_FORGIVING = ticks(HITS.guardForgiving);

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road, wallL: 0, wallR: 0, branch: -1 };

export function newKart(): KartState {
  return {
    x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0, steer: 0, air: 0, airTicks: 0, hopTicks: 0, armTicks: 0, pinTicks: 0, driftDir: 0, driftCharge: 0,
    driftTier: 0, boostTicks: 0, boostLevel: 1, spinTicks: 0, leapTicks: 0, wobbleTicks: 0, chaseTicks: 0, shieldTicks: 0,
    autoTicks: 0, invTicks: 0, guardTicks: 0, stallTicks: 0, respawnTicks: 0, lipTicks: -1, trick: 0, slipTicks: 0, si: 0, s: 0, d: 0, dist: 0,
    surface: Surface.Road, wall: 0, pGas: 0, pDrift: 0, pItem: 0, startJudged: 0, item: null, itemCount: 0, rouletteTicks: 0,
    rngItems: 1, rngAi: 1, lap: 0, lapStartTick: 0, bestLapTicks: 0, finished: 0, finishTime: 0, place: 0, stuckTicks: 0, progDist: -1e9, topScale: 1,
    lapMax: 0, lapStartPrev: 0, coins: 0, balloons: 0, out: 0, itemBuf: 0, itemBufBack: 0, wrongTicks: 0, branch: -1,
    rail: 0, su: 0, sd: 0, netTicks: 0, gapLaunch: 0, laneTicks: 0,
  };
}

/** Per-kart numbers from the kart body (content/karts.ts) and the coins held: top speed, peak accel, yaw rates. */
export interface KartTuning {
  top: number;
  a0: number;
  yawLow: number;
  yawHigh: number;
  weight: number;
}

export function kartTuning(ctx: SimContext, idx: number, out: KartTuning): KartTuning {
  return tuneFor(ctx.tun, ctx.cfg.racers[idx]?.kart.body, ctx.st.karts[idx]?.coins ?? 0, out);
}

export function tuneFor(tun: ClassTuning, body: number | undefined, coins: number, out: KartTuning): KartTuning {
  const b = bodyStats(body);
  out.top = tun.topSpeed * (1 + (b.speed - 3) * BODY_STEP.speed) * (1 + COINS.speedPer * Math.min(COINS.max, coins));
  const z90 = Math.max(0.6, tun.zeroTo90 - (b.accel - 3) * BODY_STEP.accel);
  // peak accel for a0·(1 − v/V)^0.6 reaching 90 % of top in z90 (tuning.ts peakAccel)
  out.a0 = (0.6019 * out.top) / (0.4 * z90);
  out.yawLow = PHYS.yawLow + (b.handling - 3) * BODY_STEP.handling;
  out.yawHigh = PHYS.yawHigh + (b.handling - 3) * BODY_STEP.handling;
  out.weight = b.weight;
  return out;
}

const kt: KartTuning = { top: 0, a0: 0, yawLow: 0, yawHigh: 0, weight: 1 };

/** Planar speed. */
export function speedOf(k: KartState): number {
  return Math.sqrt(k.vx * k.vx + k.vz * k.vz);
}

/** Boosts refresh rather than add (GDD 3.5). */
export function applyBoost(ctx: SimContext, idx: number, level: number, seconds: number, source: number): void {
  const k = ctx.st.karts[idx];
  const t = ticks(seconds);
  k.boostTicks = Math.max(k.boostTicks, t);
  k.boostLevel = Math.max(k.boostTicks > 0 && k.boostLevel > 1 ? k.boostLevel : 1, Math.min(level, source === BoostSource.Zoomies ? BOOST.zoomies : BOOST.cap));
  ctx.emit({ type: 'boost', kart: idx, a: source, b: level });
}

const HIT_INDEX: Record<HitKind, number> = { spin: 0, leap: 1, wobble: 2, chase: 3 };

/**
 * Apply a hit to kart `idx` (items call this). Returns false when it bounced off a shield, invincibility or the
 * respawn immunity. `by` is the attacker kart or -1.
 */
export function applyHit(ctx: SimContext, idx: number, kind: HitKind, by = -1): boolean {
  const k = ctx.st.karts[idx];
  // SIM_VERSION 8: on a loop's rail, in a jump gap's flight or in its net nothing hits (projectiles pass)
  if (stuntImmune(k)) return false;
  // SIM_VERSION 7 hit cap: a human hit by an item shrugs off further item hits for a while (hazards still count)
  const guarded = k.guardTicks > 0 && by >= 0;
  if (guarded || k.shieldTicks > 0 || k.autoTicks > 0 || k.invTicks > 0 || k.respawnTicks > 0 || k.finished || k.out) {
    // B18: one `blocked` per attacker → victim pair every 0.5 s (a Zoomies kart grinding a shield sent 33 in a row)
    const pairs = ctx.st.pairs;
    const n = ctx.st.karts.length;
    const p = (by < 0 ? n : by) * n + idx;
    if (!pairs || !(pairs.blocked[p] > 0)) {
      if (pairs) pairs.blocked[p] = BLOCKED_CD;
      if (!k.finished && !k.out) ctx.emit({ type: 'blocked', kart: idx, b: by });
    }
    return false;
  }
  endDrift(k);
  switch (kind) {
    case 'spin':
      k.spinTicks = ticks(HITS.spin.time);
      k.vx *= HITS.spin.speed;
      k.vz *= HITS.spin.speed;
      k.boostTicks = 0;
      k.boostLevel = 1;
      break;
    case 'leap':
      k.leapTicks = ticks(HITS.leap.time);
      k.vx *= HITS.leap.keep;
      k.vz *= HITS.leap.keep;
      k.air = 1;
      k.airTicks = 0;
      k.lipTicks = -1;
      // vy so the apex is HITS.leap.height and the flight lasts about the leap time
      k.vy = Math.sqrt(2 * PHYS.gravity * HITS.leap.height);
      break;
    case 'wobble':
      k.wobbleTicks = ticks(HITS.wobble.time);
      k.vx *= HITS.wobble.speed;
      k.vz *= HITS.wobble.speed;
      break;
    case 'chase':
      k.chaseTicks = ticks(HITS.chase.time);
      break;
  }
  ctx.emit({ type: 'hit', kart: idx, a: HIT_INDEX[kind], b: by });
  if (by >= 0 && kind !== 'chase' && ctx.cfg.mode !== 'battle' && ctx.cfg.humans.includes(idx)) k.guardTicks = ctx.cfg.forgiving ? GUARD_FORGIVING : GUARD;
  // a spin or a leap drops coins (the scatter is a visual only)
  if ((kind === 'spin' || kind === 'leap') && k.coins > 0) {
    const lost = Math.min(COINS.drop, k.coins);
    k.coins -= lost;
    ctx.emit({ type: 'coinLoss', kart: idx, a: lost });
  }
  ctx.plugins?.mode?.onHit?.(ctx, idx, by, kind);
  return true;
}

export function endDrift(k: KartState): void {
  k.driftDir = 0;
  k.driftCharge = 0;
  k.driftTier = 0;
}

/** Place the kart on the centre line at sample `si`, facing along the track. */
export function placeOnTrack(ctx: SimContext, k: KartState, si: number, lateral = 0): void {
  const t = ctx.track;
  const i = ((si % t.n) + t.n) % t.n;
  k.x = t.px[i] + -t.tz[i] * lateral;
  k.z = t.pz[i] + t.tx[i] * lateral;
  k.heading = atan2L(t.tx[i], t.tz[i]);
  queryTrack(t, k.x, k.z, i, hit);
  k.y = hit.y;
  k.si = hit.i;
  k.s = hit.s;
  k.d = hit.d;
  k.surface = hit.surface;
}

/**
 * One fixed step for kart `idx`. `inp` is this tick's input (human, AI or autopilot). Before GO the kart only
 * records button edges for the Pounce Start.
 */
export function stepKart(ctx: SimContext, idx: number, inp: TickInput): void {
  const { st, track: t, tun, cfg } = ctx;
  const k = st.karts[idx];
  const tick = st.tick;
  const go = ctx.goTick;
  const gasEdge = inp.gas && !k.pGas;
  const driftEdge = inp.drift && !k.pDrift;
  k.pGas = inp.gas ? 1 : 0;
  k.pDrift = inp.drift ? 1 : 0;

  // --- Pounce Start (GDD 1.1): the first press in the last 1.5 s of the countdown is judged -------------------
  const win = ticks(BOOST.pounce.window);
  if (k.startJudged === 0 && (gasEdge || driftEdge) && tick >= go - 90) {
    if (tick < go - win) k.startJudged = cfg.forgiving ? 1 : 3;
    else if (tick <= go + win) k.startJudged = 2;
    else k.startJudged = 1;
  }
  if (tick === go) {
    if (k.startJudged === 2) {
      applyBoost(ctx, idx, BOOST.pounce.level, BOOST.pounce.time, BoostSource.Pounce);
      ctx.emit({ type: 'pounce', kart: idx });
    } else if (k.startJudged === 3) {
      k.stallTicks = ticks(BOOST.pounce.stall);
      ctx.emit({ type: 'stall', kart: idx });
    }
  } else if (tick > go && k.startJudged === 2) {
    // pressed just after GO, still inside the window
    applyBoost(ctx, idx, BOOST.pounce.level, BOOST.pounce.time, BoostSource.Pounce);
    ctx.emit({ type: 'pounce', kart: idx });
    k.startJudged = 1;
  }
  if (tick >= go && k.startJudged === 2) k.startJudged = 1;
  if (tick > go + win && k.startJudged === 0) k.startJudged = 1;
  if (k.startJudged === 3 && tick >= go) k.startJudged = 1;
  if (tick < go) return;

  // --- respawn ("big hand") ------------------------------------------------------------------------------------
  if (k.respawnTicks > 0) {
    k.respawnTicks--;
    if (k.respawnTicks === 0) {
      // SIM_VERSION 8: never inside a set piece (before a loop's strip, past a jump's far lip)
      const [rsi, fast] = respawnSampleOf(t, k.si);
      placeOnTrack(ctx, k, rsi, clamp(t.line[rsi], -2, 2));
      const sp = fast > 0 ? kartTuning(ctx, idx, kt).top * fast : tun.topSpeed * 0.35;
      k.vx = sinL(k.heading) * sp;
      k.vz = cosL(k.heading) * sp;
      k.vy = 0;
      k.air = 0;
      k.invTicks = ticks(PHYS.respawnImmunity);
      endDrift(k);
    }
    return;
  }
  // --- the catch net of a jump gap holds the kart, then sets it down past the far lip (SIM_VERSION 8) --------------
  if (k.netTicks > 0) {
    kartTuning(ctx, idx, kt);
    stepNet(ctx, k, kt.top * clamp(k.topScale, 0.5, 1));
    return;
  }

  // --- timers -----------------------------------------------------------------------------------------------------
  if (k.boostTicks > 0 && --k.boostTicks === 0) k.boostLevel = 1;
  if (k.spinTicks > 0) k.spinTicks--;
  if (k.leapTicks > 0) k.leapTicks--;
  if (k.wobbleTicks > 0) k.wobbleTicks--;
  if (k.chaseTicks > 0) k.chaseTicks--;
  if (k.shieldTicks > 0) k.shieldTicks--;
  if (k.autoTicks > 0) k.autoTicks--;
  if (k.invTicks > 0) k.invTicks--;
  if (k.guardTicks > 0) k.guardTicks--;
  if (k.stallTicks > 0) k.stallTicks--;
  if (k.hopTicks > 0) k.hopTicks--;
  if (k.armTicks > 0) k.armTicks--;

  const stunned = k.spinTicks > 0 || k.stallTicks > 0 || k.leapTicks > 0;
  let steerIn = stunned ? 0 : inp.steer / 7;
  if (k.wobbleTicks > 0) steerIn += HITS.wobble.noise * sinL(tick * 0.9 + idx * 1.7);
  steerIn = clamp(steerIn, -1, 1);
  k.steer += clamp(steerIn - k.steer, -STEER_RATE, STEER_RATE);
  const gas = !stunned && (inp.gas || k.autoTicks > 0);
  const brake = !stunned && inp.brake && !inp.gas;

  // --- basis --------------------------------------------------------------------------------------------------------
  const boosting = k.boostTicks > 0;
  const surf = k.surface;
  // body stats and coins (iteration 2): per-kart top speed, peak accel and yaw rates
  kartTuning(ctx, idx, kt);
  let top = kt.top * clamp(k.topScale, 0.5, 1);
  let accelMul = 1;
  if (!boosting) {
    if (surf === Surface.Offroad) {
      top *= PHYS.offroadTop;
      accelMul = PHYS.offroadAccel;
    } else if (surf === Surface.Curb) top *= PHYS.curbTop;
  }
  const target = boosting ? kt.top * k.boostLevel : top;
  const a0 = kt.a0;
  /** the kart's own top speed (no surface penalty): set pieces scale their floors by it */
  const ownTop = kt.top * clamp(k.topScale, 0.5, 1);
  /** speed after one tick of gas / coast / overspeed drag (GDD 3.3: a = a0·(1 − v/vmax)^0.6) */
  const driving = gas || boosting;
  const nextV = (v: number): number => {
    if (k.stallTicks > 0) return v > 0 ? Math.max(0, v - 30 * DT) : v;
    if (v > target) return Math.max(target, v - PHYS.overspeedDrag * DT);
    if (!driving) return v > 0 ? Math.max(0, v - PHYS.coastDrag * DT) : Math.min(0, v + PHYS.coastDrag * DT);
    if (v < 0) return v + a0 * DT;
    const peak = boosting ? a0 * BOOST.accelMult : a0 * accelMul;
    return Math.min(target, v + peak * pow06(1 - v / target) * DT);
  };

  // --- SIM_VERSION 8: on a loop's rail the rail does everything (core/sim/stunt.ts) ---------------------------------
  if (k.rail > 0) {
    stepRail(ctx, idx, k, inp, nextV, ownTop, a0, stunned);
    return;
  }

  // --- hop and drift entry ------------------------------------------------------------------------------------------
  if (driftEdge && !k.air && !stunned) {
    k.hopTicks = HOP_TICKS;
    k.armTicks = ARM_TICKS;
    ctx.emit({ type: 'hop', kart: idx });
  }
  let sp = speedOf(k);
  if (k.driftDir === 0 && inp.drift && k.armTicks > 0 && !k.air && Math.abs(steerIn) > DRIFT.minSteer && sp > DRIFT.minSpeed && !stunned) {
    k.driftDir = steerIn > 0 ? 1 : -1;
    k.driftCharge = 0;
    k.driftTier = 0;
    k.armTicks = 0;
    ctx.emit({ type: 'driftStart', kart: idx, a: k.driftDir });
  }

  // trick: a tap within 0.2 s of leaving a ramp lip
  if (k.air && driftEdge && k.lipTicks >= 0 && k.lipTicks <= TRICK_WINDOW && !k.trick) {
    k.trick = 1;
    ctx.emit({ type: 'trick', kart: idx });
  }

  // --- drift release / cancel ----------------------------------------------------------------------------------------
  if (k.driftDir !== 0) {
    if (!inp.drift || stunned) {
      if (k.driftTier > 0 && !stunned) {
        applyBoost(ctx, idx, DRIFT.level, DRIFT.boost[k.driftTier - 1], BoostSource.MiniTurbo);
        ctx.emit({ type: 'miniTurbo', kart: idx, a: k.driftTier });
      }
      ctx.emit({ type: 'driftEnd', kart: idx });
      endDrift(k);
    } else if (sp < DRIFT.dropSpeed) {
      ctx.emit({ type: 'driftEnd', kart: idx });
      endDrift(k);
    }
  }

  // --- longitudinal ---------------------------------------------------------------------------------------------------
  let vf = k.vx * sinL(k.heading) + k.vz * cosL(k.heading);

  if (k.driftDir !== 0) {
    // explicit drift: the travel direction turns at the drift yaw, the body sits inside it at the slip angle
    const dir = k.driftDir;
    const tight = clamp(k.steer * dir, -1, 1);
    const u = (tight + 1) / 2;
    const yaw = lerp(DRIFT.yawWide, DRIFT.yawTight, u) * (k.air ? PHYS.airSteer : 1);
    let travel = headingOf(k.vx, k.vz);
    travel = wrapAngle(travel - dir * yaw * DT);
    const slip = lerp(DRIFT.slipMin, DRIFT.slipMax, u);
    const want = wrapAngle(travel - dir * slip);
    k.heading = wrapAngle(k.heading + wrapAngle(want - k.heading) * 0.18);
    if (!k.air) sp = Math.max(0, nextV(sp));
    k.vx = sinL(travel) * sp;
    k.vz = cosL(travel) * sp;
    if (!k.air) {
      const rate = tight > DRIFT.tightSteer ? DRIFT.tightFactor : tight < -0.3 ? DRIFT.wideFactor : 1;
      k.driftCharge += rate;
      const tier = k.driftCharge >= TIER_TICKS[2] ? 3 : k.driftCharge >= TIER_TICKS[1] ? 2 : k.driftCharge >= TIER_TICKS[0] ? 1 : 0;
      if (tier > k.driftTier) {
        k.driftTier = tier;
        ctx.emit({ type: 'driftTier', kart: idx, a: tier });
      }
    }
  } else {
    // normal driving: yaw from the steer, then grip pulls the velocity toward the new heading
    const asp = Math.abs(vf);
    const yawMax = asp <= PHYS.yawLowSpeed ? kt.yawLow : lerp(kt.yawLow, kt.yawHigh, clamp((asp - PHYS.yawLowSpeed) / (tun.topSpeed - PHYS.yawLowSpeed), 0, 1));
    const fade = clamp(asp / PHYS.yawFadeSpeed, PHYS.yawFadeMin, 1);
    let auth = (k.air ? PHYS.airSteer : 1) * (k.chaseTicks > 0 ? HITS.chase.authority : 1);
    if (k.spinTicks > 0) auth = 0;
    const yaw = -k.steer * yawMax * fade * auth * (vf < 0 ? -1 : 1);
    k.heading = wrapAngle(k.heading + yaw * DT);
    const fx = sinL(k.heading);
    const fz = cosL(k.heading);
    const rx = -fz;
    const rz = fx;
    vf = k.vx * fx + k.vz * fz;
    let vl = k.vx * rx + k.vz * rz;
    const grip = k.air ? PHYS.gripAir : surf === Surface.LowGrip && !boosting ? PHYS.gripLow : PHYS.grip;
    vl *= Math.max(0, 1 - grip * DT);
    if (!k.air) {
      if (brake) {
        if (vf > 0) vf = Math.max(0, vf - PHYS.brakeDecel * DT);
        else vf = Math.max(-PHYS.reverseMax, vf - a0 * 0.4 * DT);
      } else vf = nextV(vf);
    }
    k.vx = fx * vf + rx * vl;
    k.vz = fz * vf + rz * vl;
  }

  // --- integrate --------------------------------------------------------------------------------------------------------
  const prevSi = k.si;
  const px0 = k.x;
  const pz0 = k.z;
  k.x += k.vx * DT;
  k.z += k.vz * DT;
  queryTrack(t, k.x, k.z, k.si, hit);
  resolveWall(ctx, idx, k, true);
  // SIM_VERSION 8: crossing a loop's zone start attaches the kart to its rail (it is placed on it this tick)
  if (t.pieces.length && tryAttachRail(ctx, idx, k, prevSi, hit, ownTop)) return;
  // a jump gap's lip launches at any speed on an aimed arc
  const lip = t.pieces.length ? lipCrossed(ctx, prevSi, hit) : null;
  if (lip) launch(ctx, idx, k, lip, ownTop);
  // and a loop's boost strip lines the kart up for the rail (lead-in assist)
  if (t.pieces.length && !k.air) stripAssist(ctx, k, hit);

  // --- vertical: ground follow, ramps, air ---------------------------------------------------------------------------
  let groundY = hit.y;
  if (k.air) {
    k.airTicks++;
    if (k.lipTicks >= 0) k.lipTicks++;
    if (k.gapLaunch > 0) airAssist(ctx, k, hit);
    k.vy -= PHYS.gravity * DT;
    k.y += k.vy * DT;
    // SIM_VERSION 8: a gap flight that reaches the far deck from below its edge goes into the net
    if (k.gapLaunch > 0 && hitsLipFace(ctx, idx, k, hit, groundY)) return;
    if (k.y <= groundY && k.vy <= 0) {
      const airT = k.airTicks;
      k.y = groundY;
      k.vy = 0;
      k.air = 0;
      k.airTicks = 0;
      k.lipTicks = -1;
      ctx.emit({ type: 'land', kart: idx, a: airT });
      if (k.gapLaunch > 0) landed(ctx, idx, k, airT, hit);
      if (k.leapTicks > 0) {
        // the cucumber leap lands facing forward
        k.heading = atan2L(t.tx[hit.i], t.tz[hit.i]);
        const v = speedOf(k);
        k.vx = sinL(k.heading) * v;
        k.vz = cosL(k.heading) * v;
      }
      // SIM_VERSION 7: a kart hit in the air (spinning, leaping) lands without the trick boost: it used to accelerate
      // a spinning kart with no steering straight into the wall
      if (k.trick && (k.spinTicks > 0 || k.leapTicks > 0)) k.trick = 0;
      if (k.trick) {
        k.trick = 0;
        ctx.emit({ type: 'trickLand', kart: idx, a: idx % 3 });
        applyBoost(ctx, idx, BOOST.trick.level, BOOST.trick.time, BoostSource.Trick);
      }
    }
  } else {
    // ramp lip: crossing a ramp's lip sample within its span launches the kart
    let launched = false;
    for (const r of t.ramps) {
      const before = (r.i - prevSi + t.n) % t.n;
      const after = (hit.i - r.i + t.n) % t.n;
      if (before > 0 && before < 6 && after < 6 && Math.abs(hit.d - r.d) <= r.halfW) {
        // SIM_VERSION 8: a set-piece kicker launches at any speed on an aimed arc
        if (r.piece != null && t.pieces[r.piece]) {
          launch(ctx, idx, k, t.pieces[r.piece], ownTop);
          k.y = Math.max(k.y, groundY);
          launched = true;
          continue;
        }
        const v = speedOf(k);
        if (v > BOOST.rampMinSpeed) {
          k.air = 1;
          k.airTicks = 0;
          k.lipTicks = 0;
          k.trick = 0;
          k.vy = BOOST.rampLaunch * clamp(v / tun.topSpeed, 0.6, 1.15);
          k.y = Math.max(k.y, groundY);
          launched = true;
          ctx.emit({ type: 'ramp', kart: idx });
        }
      }
    }
    if (!launched) {
      // B12: the grounded height follows the ground by at most a small step per tick (plus the road's grade); a
      // bigger drop is a fall (airborne), a bigger rise is a step the kart cannot climb (pushed back like a wall)
      const ddx = k.x - px0;
      const ddz = k.z - pz0;
      const travel = Math.sqrt(ddx * ddx + ddz * ddz);
      const rise = groundY - k.y;
      if (rise > PHYS.stepUp + PHYS.stepGrade * travel && !(hit.ramp ?? 0)) {
        k.x = px0;
        k.z = pz0;
        k.vx *= -0.2;
        k.vz *= -0.2;
        queryTrack(t, k.x, k.z, prevSi, hit);
        groundY = hit.y;
        if (Math.abs(groundY - k.y) > PHYS.stepUp) k.y = groundY; // the old spot moved too (respawn, banking): follow it
        ctx.emit({ type: 'wall', kart: idx, a: 2 });
      } else if (-rise > PHYS.stepDown + PHYS.stepGrade * travel) {
        k.air = 1;
        k.airTicks = 0;
        k.lipTicks = -1;
        k.vy = 0;
      } else k.y = groundY;
    }
  }

  // --- SIM_VERSION 8: the wall-ride lane (boost, magnet, events) -------------------------------------------------------
  if (t.pieces.length) stepLane(ctx, idx, k, inp, hit);

  // --- surface: boost pads -------------------------------------------------------------------------------------------
  if (hit.surface === Surface.Boost && !k.air) {
    if (k.surface !== Surface.Boost) ctx.emit({ type: 'pad', kart: idx });
    applyBoostQuiet(k, BOOST.pad.level, BOOST.pad.time);
  }
  k.surface = k.air ? k.surface : hit.surface;

  // --- progress ----------------------------------------------------------------------------------------------------------
  k.si = hit.i;
  k.s = hit.s;
  k.d = hit.d;
  k.branch = hit.branch ?? -1;
  advanceDist(t.length, k, hit.s, speedOf(k) * DT + 0.5);

  // --- SIM_VERSION 8: the catch net under a jump gap; no watchdog or wrong way during a gap flight --------------------
  if (t.pieces.length && checkNet(ctx, idx, k)) return;
  if (k.gapLaunch > 0) {
    k.wrongTicks = 0;
    k.stuckTicks = 0;
    k.progDist = k.dist;
    return;
  }

  // --- safety: stuck, wrong way or fell (respawn hand, GDD 3.3) --------------------------------------------------------
  if (k.y < groundY - 8) startRespawn(ctx, idx);
  const sp1 = speedOf(k);
  const vfwd = k.vx * sinL(k.heading) + k.vz * cosL(k.heading);
  // B5: reversing on purpose (brake held, rolling backwards) is never "stuck"
  const reversing = inp.brake && vfwd < 0;
  // wall pin: touching a wall below 25 % of top speed for 1.5 s → the big hand (creeping along a wall is not progress)
  if (k.wall && !k.finished && sp1 < tun.topSpeed * 0.25 && !reversing) {
    if (++k.pinTicks > PIN_TICKS) {
      k.pinTicks = 0;
      k.progDist = k.dist;
      startRespawn(ctx, idx);
    }
  } else if (k.pinTicks > 0) k.pinTicks--;
  if (t.arena) {
    // arenas have no lap direction: only a kart that sits still with the gas held for the watchdog time is stuck
    if (k.finished || k.out || sp1 > 1 || !gas) k.stuckTicks = 0;
    else if (++k.stuckTicks > ticks(RACE.stuckRespawn)) startRespawn(ctx, idx);
    k.wrongTicks = 0;
    return;
  }
  // progress watchdog: no 4 m of progress in 5 s (3 s for AI) while slower than 4 m/s → the big hand
  if (k.finished || k.dist > k.progDist + 4) {
    k.progDist = k.dist;
    k.stuckTicks = 0;
  } else if (!reversing && sp1 < PHYS.stuckSpeed && ++k.stuckTicks > ticks(cfg.racers[idx]?.ai ? RACE.stuckRespawn - 1 : RACE.stuckRespawn + 1)) {
    k.progDist = k.dist;
    startRespawn(ctx, idx);
  }
  // wrong way (GDD 3.3): driving against the track for 1.5 s shows the banner, 3 s puts the kart back facing forward
  if (!k.finished && k.respawnTicks === 0) {
    const tx = t.tx[k.si];
    const tz = t.tz[k.si];
    const along = k.vx * tx + k.vz * tz;
    const facing = sinL(k.heading) * tx + cosL(k.heading) * tz;
    const wrong = !reversing && (along < -1 || (along > -1 && along < 1 && facing < -0.5));
    if (wrong) {
      if (++k.wrongTicks === WRONG_BANNER) ctx.emit({ type: 'wrongWay', kart: idx });
      if (k.wrongTicks >= WRONG_RESPAWN) {
        k.wrongTicks = 0;
        k.progDist = k.dist;
        startRespawn(ctx, idx);
      }
    } else k.wrongTicks = 0;
  } else k.wrongTicks = 0;
}

/**
 * Walls (GDD 3.3, B11): the wall line comes from the track query (`hit.wallL` / `wallR`, so branches need no change
 * here); the kart's body edge (`kartHalfWidth`) stops at it. A graze keeps the tangential speed and loses 12 % once,
 * then 10 % a second while scraping; a head-on (> 50° and > 3 m/s into the wall) bounces back 3 m/s with a short
 * wobble. Never a dead stop. `hit` must hold the query at the kart's position; it is refreshed when the kart moves.
 * With `respond` false (contacts pushed the kart, B9) only the position is clamped and the inward speed removed.
 */
function resolveWall(ctx: SimContext, idx: number, k: KartState, respond: boolean): void {
  const t = ctx.track;
  const wl = hit.wallL ?? t.wallL[hit.i];
  const wr = hit.wallR ?? t.wallR[hit.i];
  const lim = (hit.d > 0 ? wr : wl) - PHYS.kartHalfWidth;
  if (Math.abs(hit.d) <= lim) {
    if (respond) k.wall = 0;
    return;
  }
  const side = hit.d > 0 ? 1 : -1;
  const rx = -t.tz[hit.i];
  const rz = t.tx[hit.i];
  const nx = -rx * side; // inward normal
  const nz = -rz * side;
  const over = Math.abs(hit.d) - lim;
  k.x += nx * over;
  k.z += nz * over;
  const vn = k.vx * nx + k.vz * nz;
  const v = speedOf(k);
  // SIM_VERSION 8: a wall-ride lane's outer rail is soft: clamp, drop the outward speed, a graze event, no speed loss.
  // The whole taper counts (from its first centimetre), so a kart steering out early never pays a graze at the lane mouth.
  if (laneAt(t, hit.i, hit.d) > 0 && (hit.branch ?? -1) === -1) {
    if (vn < 0) {
      k.vx -= nx * vn;
      k.vz -= nz * vn;
      // redirect along the rail at the same speed (projecting alone would cost v·(1 − cos a) at a steep approach)
      const vt = speedOf(k);
      if (vt > 0.01) {
        k.vx *= v / vt;
        k.vz *= v / vt;
      }
      if (respond && !k.wall && v > 0.01 && -vn / v > 0.15) ctx.emit({ type: 'wall', kart: idx, a: 1 });
    }
    // the rail guides: a nose pointing into it turns along it (grip would otherwise bleed the speed into the rail)
    const away = sinL(k.heading) * nx + cosL(k.heading) * nz;
    if (respond && away < 0.05 && !k.air && k.spinTicks === 0 && k.driftDir === 0 && speedOf(k) > 1) k.heading = headingOf(k.vx, k.vz);
    if (respond) k.wall = 1;
    queryTrack(t, k.x, k.z, hit.i, hit);
    return;
  }
  if (vn < 0 && v > 0.01) {
    const sinA = -vn / v;
    k.vx -= nx * vn;
    k.vz -= nz * vn;
    if (respond) {
      const headOn = sinA > SIN_HEAD_ON && -vn > HEAD_ON_MIN;
      if (headOn) {
        k.vx *= 1 - PHYS.wallGrazeLoss;
        k.vz *= 1 - PHYS.wallGrazeLoss;
        k.vx += nx * PHYS.wallBounce;
        k.vz += nz * PHYS.wallBounce;
        k.wobbleTicks = Math.max(k.wobbleTicks, WALL_WOBBLE);
        if (k.driftDir !== 0) {
          ctx.emit({ type: 'driftEnd', kart: idx });
          endDrift(k);
        }
        ctx.emit({ type: 'wall', kart: idx, a: 2 });
      } else if (!k.wall) {
        k.vx *= 1 - PHYS.wallGrazeLoss;
        k.vz *= 1 - PHYS.wallGrazeLoss;
        if (sinA >= SIN30 && k.driftDir !== 0) {
          ctx.emit({ type: 'driftEnd', kart: idx });
          endDrift(k);
        }
        if (sinA > 0.15) ctx.emit({ type: 'wall', kart: idx, a: 1 });
      }
    }
  }
  if (respond) {
    if (k.wall) {
      // scraping along the wall
      k.vx *= 1 - PHYS.wallScrape * DT;
      k.vz *= 1 - PHYS.wallScrape * DT;
    }
    // slide off the wall: turn the nose toward the track direction (never into the wall), so a pinned kart
    // always has a way out even with no brake (touch)
    const along = atan2L(t.tx[hit.i], t.tz[hit.i]);
    const away = sinL(k.heading) * nx + cosL(k.heading) * nz;
    if (away < 0.2 && !k.air && k.spinTicks === 0) k.heading = wrapAngle(k.heading + wrapAngle(along - k.heading) * PHYS.wallAlign * DT);
    k.wall = 1;
  }
  queryTrack(t, k.x, k.z, hit.i, hit);
}

/**
 * B9: after contacts moved a kart, re-query the track, keep it inside the walls and bring `si`, `s` and `d` up to
 * date (a push used to leave them stale for a tick, or push the kart through the wall).
 */
export function settleAfterPush(ctx: SimContext, idx: number): void {
  const k = ctx.st.karts[idx];
  const t = ctx.track;
  queryTrack(t, k.x, k.z, k.si, hit);
  resolveWall(ctx, idx, k, false);
  // SIM_VERSION 8: a push never carries the kart over a loop's start or a jump's lip (its own move must cross it)
  if (!pushSkipsTrigger(t, k.si, hit)) k.si = hit.i;
  k.s = hit.s;
  k.d = hit.d;
  k.branch = hit.branch ?? -1;
  // `dist` is re-aimed at the new `s` on the next tick (advanceDist), so a push never makes progress jump
}

/**
 * Move `dist` toward the lap position `s` (B4). Near the inside of a tight bend the centre line runs several times
 * faster than the kart, so `s` can leap metres in a tick; `dist` follows it by at most `maxStep` per tick and
 * catches up afterwards (it is always re-aimed at the true `s`), so laps stay exact and positions stop jumping.
 */
export function advanceDist(L: number, k: KartState, s: number, maxStep: number): void {
  let at = k.dist - L * Math.floor(k.dist / L);
  if (at >= L) at -= L;
  let ds = s - at;
  if (ds > L / 2) ds -= L;
  else if (ds <= -L / 2) ds += L;
  k.dist += clamp(ds, -maxStep, maxStep);
}

function applyBoostQuiet(k: KartState, level: number, seconds: number): void {
  k.boostTicks = Math.max(k.boostTicks, ticks(seconds));
  k.boostLevel = Math.max(k.boostLevel, Math.min(level, BOOST.cap));
}

/** The "big hand" (GDD 3.3): `respawn` and `respawnStart` both fire as the hand comes; the kart is set down facing forward. */
export function startRespawn(ctx: SimContext, idx: number): void {
  const k = ctx.st.karts[idx];
  if (k.respawnTicks > 0) return;
  k.respawnTicks = ticks(PHYS.respawnDelay);
  k.rail = 0;
  k.su = 0;
  k.sd = 0;
  k.gapLaunch = 0;
  k.netTicks = 0;
  k.laneTicks = 0;
  k.stuckTicks = 0;
  k.pinTicks = 0;
  k.wrongTicks = 0;
  k.vx = k.vz = k.vy = 0;
  ctx.emit({ type: 'respawn', kart: idx });
  ctx.emit({ type: 'respawnStart', kart: idx });
}
