/**
 * Scripted "average player" bot (GDD 5.3): holds the racing line, drifts the bends (releases at whatever tier it
 * reached), presses gas on GO, fires items at once. Used by the balance tests, `?bot=1` and the e2e smoke.
 * `skill` 0..1 scales how well it holds the line and how long it drifts.
 */
import type { TickInput } from '../../types';
import { GO_TICK } from '../../core/sim/world';
import { curvatureAhead, followLine, stuntEntryAhead } from '../../core/sim/autopilot';
import { speedOf } from '../../core/sim/kart';
import { sinL } from '../../core/sim/fixed';
import { PHYS, classTuning } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';

export function playerBot(ctx: SimContext, me: number, skill = 0.6): TickInput {
  const out: TickInput = { steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false };
  const st = ctx.st;
  if (st.tick < GO_TICK) {
    out.gas = st.tick >= GO_TICK - 3; // a press right on GO: Pounce Start
    return out;
  }
  // a human wobbles a little around the line
  const wob = sinL(st.tick * 0.05 + me) * (1 - skill) * 0.5;
  const err = followLine(ctx, me, out, wob, 1, skill);
  const k = st.karts[me];
  // [integrator] way off the line at speed (a late turn-in for a branch): lift, as a player would
  if (Math.abs(err) > 0.45 && speedOf(k) > 18 && k.driftDir === 0) out.gas = false;
  const c = curvatureAhead(ctx, k.si, 2, 14);
  const turn = c > 0 ? -1 : 1;
  // SIM_VERSION 8 (SETPIECES.md section 4): the bot follows the AI's set-piece rules at its skill: hands off on a loop's
  // rail, no new drift within 20 m of a loop or a lip, a held drift let go just before a lip, no brake near either
  if (k.rail > 0 || k.netTicks > 0) {
    out.item = false;
    return out;
  }
  const toStunt = k.branch < 0 ? stuntEntryAhead(ctx, k.si, 25) : -1;
  if (k.driftDir === 0 && (toStunt < 0 || toStunt > 20) && Math.abs(c) > 0.035 && speedOf(k) > 12 && out.steer * turn >= 2) {
    out.drift = !k.pDrift;
    out.steer = turn * 5;
  } else if (k.driftDir === 0 && !out.drift && !k.air) {
    // a bend tighter than the kart turns at this speed (yaw falls with speed): lift, as a player would
    const sp = speedOf(k);
    const top = classTuning(ctx.cfg.cls).topSpeed;
    const yaw = sp <= PHYS.yawLowSpeed ? PHYS.yawLow : PHYS.yawLow + (PHYS.yawHigh - PHYS.yawLow) * Math.min(1, (sp - PHYS.yawLowSpeed) / (top - PHYS.yawLowSpeed));
    const ahead = Math.max(Math.abs(curvatureAhead(ctx, k.si, 2, 10)), Math.abs(curvatureAhead(ctx, k.si, 8, 18)));
    if (sp * ahead > yaw * 1.3) out.gas = false;
    // over the class top speed (a boost, coins) into a bend the kart cannot turn: brake
    if (sp > top && sp * ahead > yaw * 1.5) out.brake = true;
  }
  if (k.driftDir !== 0) out.drift = Math.abs(curvatureAhead(ctx, k.si, 0, 8)) > 0.018 * (1.4 - skill * 0.6) && out.steer * k.driftDir > -5 && (k.branch >= 0 || stuntEntryAhead(ctx, k.si, 7, 'jump') < 0);
  if (toStunt >= 0) out.brake = false;
  out.item = !!k.item && k.rouletteTicks === 0 && !k.pItem;
  return out;
}
