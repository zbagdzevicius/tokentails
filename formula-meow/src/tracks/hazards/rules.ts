/**
 * Track rules (tracks lane): what a track's shape asks of the sim beyond walls and surfaces, run each tick inside the
 * hazard system (after the items, before the mode rules). Sim-safe math, plain-data state in `RaceState.hazards`:
 *
 * - Open bridges (`voidMask`): a kart that drove off the deck and dropped 1.6 m gets the respawn hand, which sets it
 *   back on the bridge (kart.ts respawns at its `si`, the bridge's centre line).
 * - Gaps in a branch's deck (SIM_VERSION 8, the set-piece net rule, SETPIECES.md Y0): a kart that can no longer clear
 *   the gap (below the far side's deck) is caught: the hand sets it down on the branch `STUNT.jump.netPlace` m past
 *   the far lip at `STUNT.jump.netSpeed` × its top speed (`pend` with the NET flag). Never back to the fork.
 * - Solid props (`blocks`, the arena's cover): karts bounce off them like a wall (graze or head-on).
 */
import { DT, type KartState } from '../../types';
import { PHYS, STUNT, ticks } from '../../tuning';
import { branchFoot, type Foot } from '../../core/track/branch';
import { kartTuning, startRespawn, speedOf, type KartTuning } from '../../core/sim/kart';
import { atan2L, cosL, sinL } from '../../core/sim/fixed';
import type { SimContext } from '../../core/sim/plugins';

export interface RulesState {
  /**
   * per kart: where the respawn hand sets the kart down instead of kart.ts's main-road spot: 0 = there, 1 + i = main
   * sample i, BRANCH + id × 65536 + j = branch sample j; + NET = a branch gap's catch (set down at the net speed)
   */
  pend: number[];
  /** per kart: ticks before a prop may fire another `wall` event */
  wcd: number[];
}

const VOID_FALL = 1.6;
const GAP_MARGIN = 0.15;
/** a respawn that starts on a branch sets the kart down this far back along it */
const BACK_ON_BRANCH = 6; // m
const BRANCH = 1_000_000;
/** pend flag: the kart was caught in a branch gap (SIM_VERSION 8) */
const NET = 500_000_000;
const RESPAWN_TICKS = ticks(PHYS.respawnDelay);
const WALL_CD = 20;
const KART_R = 0.95;
const HEAD_ON_SIN = sinL((50 * Math.PI) / 180);
const WOBBLE = ticks(PHYS.wallWobble);

const foot: Foot = { j: 0, along: 0, d: 0 };
const kt: KartTuning = { top: 0, a0: 0, yawLow: 0, yawHigh: 0, weight: 0 };

export function rulesOf(st: { hazards: Record<string, unknown> }, n: number): RulesState {
  const h = st.hazards as { rules?: RulesState };
  if (!h.rules || h.rules.pend.length !== n) h.rules = { pend: new Array<number>(n).fill(0), wcd: new Array<number>(n).fill(0) };
  return h.rules;
}

/** Does this track need the rules at all? */
export function hasRules(t: SimContext['track']): boolean {
  return t.blocks.length > 0 || t.branches.length > 0 || t.voidMask.some((v) => v === 1);
}

export function stepRules(ctx: SimContext): void {
  const { st, track: t } = ctx;
  const ks = st.karts;
  const r = rulesOf(st, ks.length);
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    if (r.wcd[i] > 0) r.wcd[i]--;
    // the respawn hand has just put the kart down on the main road (kart.ts): move it where it belongs
    if (r.pend[i] && k.respawnTicks === 0) {
      const net = r.pend[i] >= NET;
      setDown(ctx, k, net ? r.pend[i] - NET : r.pend[i]);
      if (net) {
        // the catch: on past the gap at the net speed, like a main-road jump's net (core/sim/stunt.ts stepNet)
        const v = STUNT.jump.netSpeed * kartTuning(ctx, i, kt).top;
        k.vx = sinL(k.heading) * v;
        k.vz = cosL(k.heading) * v;
      }
      r.pend[i] = 0;
    }
    // a respawn that started this tick on a branch (stuck, pinned, wrong way): back onto the branch, not the main road
    if (k.respawnTicks === RESPAWN_TICKS && k.branch >= 0 && !r.pend[i]) {
      const b = t.branches.find((x) => x.id === k.branch);
      if (b && branchFoot(b, k.x, k.z, foot)) r.pend[i] = BRANCH + b.id * 65536 + Math.max(0, foot.j - Math.round(BACK_ON_BRANCH / b.step));
    }
    if (k.respawnTicks > 0 || k.out) continue;
    if (k.branch < 0) {
      if (t.voidMask[k.si] && k.y < t.py[k.si] - VOID_FALL) startRespawn(ctx, i);
    } else {
      const b = t.branches.find((x) => x.id === k.branch);
      const g = b?.gap;
      if (b && g && branchFoot(b, k.x, k.z, foot) && foot.j >= g.j0 - 1 && foot.j < g.j1 && k.y < g.y1 - GAP_MARGIN) {
        // fell into the gap: the net catches it and the hand sets it down just past the far lip (never back to the fork)
        startRespawn(ctx, i);
        r.pend[i] = NET + BRANCH + b.id * 65536 + Math.min(b.m - 1, g.j1 + Math.round(STUNT.jump.netPlace / b.step));
      }
    }
    if (t.blocks.length) bounce(ctx, i, k, r);
  }
}

/** Set kart `k` down at a pend code (see RulesState), facing along the road at its current speed. */
function setDown(ctx: SimContext, k: KartState, code: number): void {
  const t = ctx.track;
  let x: number;
  let y: number;
  let z: number;
  let tx: number;
  let tz: number;
  if (code >= BRANCH) {
    const c = code - BRANCH;
    const b = t.branches.find((o) => o.id === Math.floor(c / 65536));
    if (!b) return;
    const j = Math.min(b.m - 1, c % 65536);
    x = b.px[j] - b.tz[j] * b.line[j];
    z = b.pz[j] + b.tx[j] * b.line[j];
    y = b.py[j];
    tx = b.tx[j];
    tz = b.tz[j];
    k.si = b.mapI[j];
    let s = b.s0 + j * b.step * b.sk;
    s -= t.length * Math.floor(s / t.length);
    k.s = s;
    k.branch = b.id;
  } else {
    const i = (code - 1) % t.n;
    x = t.px[i];
    z = t.pz[i];
    y = t.py[i];
    tx = t.tx[i];
    tz = t.tz[i];
    k.si = i;
    k.s = i * t.step;
    k.branch = -1;
  }
  const sp = speedOf(k);
  k.x = x;
  k.z = z;
  k.y = y;
  k.heading = atan2L(tx, tz);
  k.vx = sinL(k.heading) * sp;
  k.vz = cosL(k.heading) * sp;
  k.d = 0;
}

/** Solid round props: push the kart out of the circle; graze keeps the tangent, head-on bounces with a wobble. */
function bounce(ctx: SimContext, i: number, k: KartState, r: RulesState): void {
  for (const bl of ctx.track.blocks) {
    const dx = k.x - bl.x;
    const dz = k.z - bl.z;
    const R = bl.r + KART_R;
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d;
    const nz = dz / d;
    k.x += nx * (R - d);
    k.z += nz * (R - d);
    const vn = k.vx * nx + k.vz * nz;
    const v = speedOf(k);
    if (vn >= 0 || v < 0.01) continue;
    k.vx -= nx * vn;
    k.vz -= nz * vn;
    const headOn = -vn / v > HEAD_ON_SIN && -vn > 3;
    k.vx *= 1 - PHYS.wallGrazeLoss * 60 * DT;
    k.vz *= 1 - PHYS.wallGrazeLoss * 60 * DT;
    if (headOn) {
      k.vx += nx * PHYS.wallBounce;
      k.vz += nz * PHYS.wallBounce;
      k.wobbleTicks = Math.max(k.wobbleTicks, WOBBLE);
    }
    if (r.wcd[i] === 0) {
      r.wcd[i] = WALL_CD;
      ctx.emit({ type: 'wall', kart: i, a: headOn ? 2 : 1 });
    }
  }
}
