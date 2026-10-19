/**
 * Arcade kart physics (GDD 3.2–3.6). No physics engine: a planar state with a grip model that pulls the velocity
 * toward the heading, an explicit drift model (travel direction rotates at the drift yaw, the body sits at a slip
 * angle inside it), boosts that refresh instead of stacking, ramps, walls and hits. Sim-safe math only.
 */
import { BoostSource, DT, HitKind, Surface, type KartState, type TickInput } from '../../types';
import { BOOST, DRIFT, HITS, PHYS, RACE, peakAccel, ticks } from '../../tuning';
import { atan2L, clamp, cosL, headingOf, lerp, pow06, sinL, wrapAngle } from './fixed';
import type { SimContext } from './plugins';
import { queryTrack, wrapDs, type TrackHit } from '../track/query';

const SIN30 = 0.5;
const SIN60 = 0.8660254037844386;
const TIER_TICKS = DRIFT.tiers.map((s) => ticks(s));
const HOP_TICKS = ticks(PHYS.hop);
const ARM_TICKS = ticks(DRIFT.entryWindow);
const PIN_TICKS = ticks(PHYS.pinRespawn);
const STEER_RATE = DT / PHYS.steerSmooth;
const TRICK_WINDOW = ticks(BOOST.trick.window);

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };

export function newKart(): KartState {
  return {
    x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0, steer: 0, air: 0, airTicks: 0, hopTicks: 0, armTicks: 0, pinTicks: 0, driftDir: 0, driftCharge: 0,
    driftTier: 0, boostTicks: 0, boostLevel: 1, spinTicks: 0, leapTicks: 0, wobbleTicks: 0, chaseTicks: 0, shieldTicks: 0,
    autoTicks: 0, invTicks: 0, stallTicks: 0, respawnTicks: 0, lipTicks: -1, trick: 0, slipTicks: 0, si: 0, s: 0, d: 0, dist: 0,
    surface: Surface.Road, wall: 0, pGas: 0, pDrift: 0, pItem: 0, startJudged: 0, item: null, itemCount: 0, rouletteTicks: 0,
    rngItems: 1, rngAi: 1, lap: 0, lapStartTick: 0, bestLapTicks: 0, finished: 0, finishTime: 0, place: 0, stuckTicks: 0, progDist: -1e9, topScale: 1,
  };
}

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
  if (k.shieldTicks > 0 || k.autoTicks > 0 || k.invTicks > 0 || k.respawnTicks > 0 || k.finished) {
    ctx.emit({ type: 'blocked', kart: idx, b: by });
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
  return true;
}

function endDrift(k: KartState): void {
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
      placeOnTrack(ctx, k, k.si, clamp(t.line[k.si], -2, 2));
      const sp = tun.topSpeed * 0.35;
      k.vx = sinL(k.heading) * sp;
      k.vz = cosL(k.heading) * sp;
      k.vy = 0;
      k.air = 0;
      k.invTicks = ticks(PHYS.respawnImmunity);
      endDrift(k);
    }
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
  let top = tun.topSpeed * clamp(k.topScale, 0.5, 1);
  let accelMul = 1;
  if (!boosting) {
    if (surf === Surface.Offroad) {
      top *= PHYS.offroadTop;
      accelMul = PHYS.offroadAccel;
    } else if (surf === Surface.Curb) top *= PHYS.curbTop;
  }
  const target = boosting ? tun.topSpeed * k.boostLevel : top;
  const a0 = peakAccel(tun);

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
      const rate = tight > 0.7 ? DRIFT.tightFactor : tight < -0.3 ? DRIFT.wideFactor : 1;
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
    const yawMax = asp <= PHYS.yawLowSpeed ? PHYS.yawLow : lerp(PHYS.yawLow, PHYS.yawHigh, clamp((asp - PHYS.yawLowSpeed) / (tun.topSpeed - PHYS.yawLowSpeed), 0, 1));
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
  const prevS = k.s;
  const prevSi = k.si;
  k.x += k.vx * DT;
  k.z += k.vz * DT;
  queryTrack(t, k.x, k.z, k.si, hit);

  // walls (GDD 3.3): graze < 30° loses 15 %, head-on > 60° loses 40 % and bounces, never to zero
  const lim = (hit.d > 0 ? t.wallR[hit.i] : t.wallL[hit.i]) - PHYS.kartRadius * 0.6;
  if (Math.abs(hit.d) > lim) {
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
    if (vn < 0 && v > 0.01) {
      const sinA = -vn / v;
      k.vx -= nx * vn;
      k.vz -= nz * vn;
      const headOn = sinA > SIN60;
      if (!k.wall || headOn) {
        const loss = sinA < SIN30 ? PHYS.wallGrazeLoss : headOn ? PHYS.wallHeadOnLoss : lerp(PHYS.wallGrazeLoss, PHYS.wallHeadOnLoss, (sinA - SIN30) / (SIN60 - SIN30));
        k.vx *= 1 - loss;
        k.vz *= 1 - loss;
        if (headOn) {
          k.vx += nx * PHYS.wallBounce;
          k.vz += nz * PHYS.wallBounce;
        }
        if (sinA >= SIN30 && k.driftDir !== 0) {
          ctx.emit({ type: 'driftEnd', kart: idx });
          endDrift(k);
        }
        if (sinA > 0.15 || headOn) ctx.emit({ type: 'wall', kart: idx, a: headOn ? 2 : 1 });
      }
    }
    // slide off the wall: turn the nose toward the track direction (never into the wall), so a pinned kart
    // always has a way out even with no brake (touch)
    const along = atan2L(t.tx[hit.i], t.tz[hit.i]);
    const away = sinL(k.heading) * nx + cosL(k.heading) * nz;
    if (away < 0.2 && !k.air && k.spinTicks === 0) k.heading = wrapAngle(k.heading + wrapAngle(along - k.heading) * PHYS.wallAlign * DT);
    k.wall = 1;
    queryTrack(t, k.x, k.z, hit.i, hit);
  } else k.wall = 0;

  // --- vertical: ground follow, ramps, air ---------------------------------------------------------------------------
  const groundY = hit.y;
  if (k.air) {
    k.airTicks++;
    if (k.lipTicks >= 0) k.lipTicks++;
    k.vy -= PHYS.gravity * DT;
    k.y += k.vy * DT;
    if (k.y <= groundY && k.vy <= 0) {
      const airT = k.airTicks;
      k.y = groundY;
      k.vy = 0;
      k.air = 0;
      k.airTicks = 0;
      k.lipTicks = -1;
      ctx.emit({ type: 'land', kart: idx, a: airT });
      if (k.leapTicks > 0) {
        // the cucumber leap lands facing forward
        k.heading = atan2L(t.tx[hit.i], t.tz[hit.i]);
        const v = speedOf(k);
        k.vx = sinL(k.heading) * v;
        k.vz = cosL(k.heading) * v;
      }
      if (k.trick) {
        k.trick = 0;
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
    if (!launched) k.y = groundY;
  }

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
  k.dist += wrapDs(t, hit.s - prevS);

  // --- safety: stuck or fell (respawn hand) ------------------------------------------------------------------------------
  if (k.y < groundY - 8) startRespawn(ctx, idx);
  // wall pin: touching a wall below 25 % of top speed for 1.5 s → the big hand (creeping along a wall is not progress)
  if (k.wall && !k.finished && speedOf(k) < tun.topSpeed * 0.25) {
    if (++k.pinTicks > PIN_TICKS) {
      k.pinTicks = 0;
      k.progDist = k.dist;
      startRespawn(ctx, idx);
    }
  } else if (k.pinTicks > 0) k.pinTicks--;
  // progress watchdog: no 4 m of progress in 5 s (3 s for AI) → the big hand puts the kart back on the road
  if (k.finished || k.dist > k.progDist + 4) {
    k.progDist = k.dist;
    k.stuckTicks = 0;
  } else if (++k.stuckTicks > ticks(cfg.racers[idx]?.ai ? RACE.stuckRespawn - 1 : RACE.stuckRespawn + 1)) {
    k.progDist = k.dist;
    startRespawn(ctx, idx);
  }
}

function applyBoostQuiet(k: KartState, level: number, seconds: number): void {
  k.boostTicks = Math.max(k.boostTicks, ticks(seconds));
  k.boostLevel = Math.max(k.boostLevel, Math.min(level, BOOST.cap));
}

export function startRespawn(ctx: SimContext, idx: number): void {
  const k = ctx.st.karts[idx];
  if (k.respawnTicks > 0) return;
  k.respawnTicks = ticks(PHYS.respawnDelay);
  k.stuckTicks = 0;
  k.pinTicks = 0;
  k.vx = k.vz = k.vy = 0;
  ctx.emit({ type: 'respawn', kart: idx });
}
