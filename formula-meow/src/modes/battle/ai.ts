/**
 * Free-roam battle AI (balloon battle, GDD 3.1 math only). There is no racing line in an arena: each cat picks a
 * target (an item box while empty-handed, else the nearest cat, leaning towards the one with the most balloons),
 * drives the short way round the arena to it and steers straight at it once close, leading a moving target. It
 * three-point turns when facing away, backs off walls, and fires items when the shot is lined up (hairball and
 * cucumber forward or back, Catnip and Zoomies to ram for a steal, the Box when chased, the Bell in a crowd).
 * Eliminated cats park at the edge. Scratch state lives in `battle.ai` (4 numbers a kart), so it is hashed.
 */
import type { KartState, TickInput } from '../../types';
import type { AIDriver, SimContext } from '../../core/sim/plugins';
import { clamp, cosL, sinL } from '../../core/sim/fixed';
import { dirTo } from '../../core/sim/arena';
import { speedOf } from '../../core/sim/kart';
import { wrapDs } from '../../core/track/query';
import { draw } from '../../core/sim/rng';
import { battleOf, type BattleState } from './rules';

/**
 * target code, retarget timer, escape timer (> 0 reverse, < 0 forward), item hold ticks, stuck ticks, and a target
 * code the cat gave up on (it got wedged going for it: an item box behind two close pieces of furniture) with the ticks
 * left before it may try again
 */
export const SLOT = 7;
const GIVE_UP = 600;
/** below this speed (m/s) a cat that is not spinning counts as stuck; the watchdog flips what it does every STUCK ticks */
const STUCK_SPEED = 2;
const STUCK = 120;
const GAIN = 2.4;

function clear(out: TickInput): void {
  out.steer = 0;
  out.gas = false;
  out.brake = false;
  out.drift = false;
  out.item = false;
  out.itemBack = false;
}

/** Sample index nearest to lap position s. */
function sampleOf(ctx: SimContext, s: number): number {
  const t = ctx.track;
  const j = Math.round(s / t.step);
  return ((j % t.n) + t.n) % t.n;
}

/** Lateral offset of a world point at sample j. */
function lateral(ctx: SimContext, j: number, x: number, z: number): number {
  const t = ctx.track;
  return (x - t.px[j]) * -t.tz[j] + (z - t.pz[j]) * t.tx[j];
}

const alive = (k: KartState) => !k.out && k.respawnTicks === 0;

/**
 * A cat an item can pop (SIM_VERSION 10): in the round, and not balloon-immune, boxed, on Zoomies or invulnerable.
 * The AI neither hunts nor fires at the others (the hit is blocked: a wasted item).
 */
const hittable = (b: BattleState, k: KartState, j: number) => alive(k) && !(b.imm[j] > 0) && k.shieldTicks === 0 && k.autoTicks === 0 && k.invTicks === 0;

/** Target code: k + 1 for kart k, -(b + 1) for box b, 0 = none. */
function pickTarget(ctx: SimContext, i: number): number {
  const st = ctx.st;
  const bs = battleOf(st);
  const skip = bs.ai[i * SLOT + 6] > 0 ? bs.ai[i * SLOT + 5] : 0;
  const me = st.karts[i];
  const per = ctx.cfg.racers[i]?.ai;
  const aggr = per ? per.aggression : 0.5;
  const fx = sinL(me.heading);
  const fz = cosL(me.heading);
  const wantItem = !me.item && me.rouletteTicks === 0;
  let best = 0;
  let bestScore = Infinity;
  if (wantItem) {
    for (let b = 0; b < st.boxes.length; b++) {
      const bx = st.boxes[b];
      if (bx.respawn > 0 || skip === -(b + 1)) continue;
      const dx = bx.x - me.x;
      const dz = bx.z - me.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const behind = dx * fx + dz * fz < 0 ? 18 : 0;
      const score = d + behind;
      if (score < bestScore) {
        bestScore = score;
        best = -(b + 1);
      }
    }
    // an aggressive cat goes for a close rival even without an item (to ram it after a boost)
    if (best !== 0 && aggr < 0.75) return best;
  }
  for (let j = 0; j < st.karts.length; j++) {
    if (j === i) continue;
    const k = st.karts[j];
    if (!hittable(bs, k, j) || skip === j + 1) continue;
    const dx = k.x - me.x;
    const dz = k.z - me.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const behind = dx * fx + dz * fz < 0 ? 14 : 0;
    // lean towards the cat with the most balloons (the leader gets hunted), and towards the player a little less
    const score = d + behind - k.balloons * 4 * aggr;
    if (score < bestScore - (wantItem ? 25 : 0)) {
      bestScore = score;
      best = j + 1;
    }
  }
  return best;
}

export function createBattleAI(): AIDriver {
  return {
    drive(ctx: SimContext, i: number, out: TickInput) {
      clear(out);
      const st = ctx.st;
      const t = ctx.track;
      const me = st.karts[i];
      const b = battleOf(st);
      if (!b) return;
      const per = ctx.cfg.racers[i]?.ai;
      const skill = per ? per.skill : 0.7;
      if (st.phase === 'countdown') {
        out.gas = skill > 0.6 && st.tick >= ctx.goTick - 3;
        return;
      }
      if (me.respawnTicks > 0 || b.over) return;
      const sp = speedOf(me);
      const ai = b.ai;
      const o = i * SLOT;

      // out: park at the nearest edge and stay there
      if (me.out) {
        const j = me.si;
        const edge = t.halfW[j] - 2.2;
        const side = me.d >= 0 ? 1 : -1;
        if (me.d * side < edge - 0.5) {
          const fd = sinL(me.heading) * t.tx[j] + cosL(me.heading) * t.tz[j] >= 0 ? 1 : -1;
          const a = (j + fd * 10 + t.n) % t.n;
          const ax = t.px[a] - t.tz[a] * edge * side;
          const az = t.pz[a] + t.tx[a] * edge * side;
          out.steer = Math.round(clamp(-dirTo(ctx, i, ax, az) * GAIN, -1, 1) * 7);
          out.gas = sp < 8;
        } else out.brake = sp > 0.5;
        return;
      }

      // pick (or re-pick) a target
      if (ai[o + 6] > 0) ai[o + 6]--;
      let code = ai[o];
      if (code > 0 && !hittable(b, st.karts[code - 1], code - 1)) code = 0;
      if (code < 0 && (st.boxes[-code - 1]?.respawn ?? 1) > 0) code = 0;
      if (code < 0 && (me.item || me.rouletteTicks > 0)) code = 0;
      if (--ai[o + 1] <= 0 || code === 0) {
        code = pickTarget(ctx, i);
        ai[o + 1] = 40 + Math.floor(draw(me, 'rngAi') * 40);
      }
      ai[o] = code;

      let gx = me.x;
      let gz = me.z;
      let gs = me.s;
      let gd = me.d;
      if (code > 0) {
        const k = st.karts[code - 1];
        const lead = 0.15 + 0.3 * skill;
        gx = k.x + k.vx * lead;
        gz = k.z + k.vz * lead;
        gs = k.s;
        gd = k.d;
      } else if (code < 0) {
        const bx = st.boxes[-code - 1];
        gx = bx.x;
        gz = bx.z;
        gs = bx.s;
        gd = lateral(ctx, sampleOf(ctx, bx.s), bx.x, bx.z);
      }
      const dx = gx - me.x;
      const dz = gz - me.z;
      const dd = Math.sqrt(dx * dx + dz * dz);

      // where to aim: straight at a close target, else round the arena the short way
      let ax = gx;
      let az = gz;
      if (code === 0 || dd > 16) {
        const j = me.si;
        const fdir = sinL(me.heading) * t.tx[j] + cosL(me.heading) * t.tz[j] >= 0 ? 1 : -1;
        const ds = code === 0 ? fdir * 30 : wrapDs(t, gs - me.s);
        // nearly the same both ways: keep going the way the kart faces (no dithering U-turns)
        const dir = Math.abs(ds) > t.length * 0.5 - 30 ? fdir : ds >= 0 ? 1 : -1;
        const look = clamp(sp * 0.6, 8, 16);
        const a = (((j + dir * Math.round(look / t.step)) % t.n) + t.n) % t.n;
        const lim = Math.max(0.5, t.halfW[a] - 2.2);
        const near = clamp(1 - (dd - 16) / 40, 0, 1);
        const d = clamp(gd * near, -lim, lim);
        ax = t.px[a] - t.tz[a] * d;
        az = t.pz[a] + t.tx[a] * d;
      }
      // [integrator] the arena's furniture (`track.blocks`, solid in the tracks lane's rules): steer round the first
      // one in the way, on the side the kart is already on
      if (t.blocks.length) {
        const ex = ax - me.x;
        const ez = az - me.z;
        const el = Math.sqrt(ex * ex + ez * ez) || 1;
        const ux = ex / el;
        const uz = ez / el;
        let best = Infinity;
        let s = 0;
        for (const bl of t.blocks) {
          const bx = bl.x - me.x;
          const bz = bl.z - me.z;
          const along = bx * ux + bz * uz;
          if (along <= 0 || along > Math.min(el, 14) + bl.r || along >= best) continue;
          const side = bx * uz - bz * ux;
          const clearR = bl.r + 1.8;
          if (Math.abs(side) >= clearR) continue;
          best = along;
          s = side >= 0 ? -1 : 1;
          ax = bl.x + uz * s * (bl.r + 2.6);
          az = bl.z - ux * s * (bl.r + 2.6);
        }
        // SIM_VERSION 10: the way round lands next to another piece (a row of furniture with gaps too narrow for a
        // kart): go round that one too, on the same side, so the cat drives round the whole row and never wedges itself
        // into a gap (Rug: a cat sat between two pieces for seconds going for the boxes behind them)
        for (let n = 0; s !== 0 && n < 4; n++) {
          let moved = false;
          for (const bl of t.blocks) {
            const ox = ax - bl.x;
            const oz = az - bl.z;
            const clearR = bl.r + 1.8;
            if (ox * ox + oz * oz >= clearR * clearR) continue;
            ax = bl.x + uz * s * (bl.r + 2.6);
            az = bl.z - ux * s * (bl.r + 2.6);
            moved = true;
          }
          if (!moved) break;
        }
      }
      const err = dirTo(ctx, i, ax, az);
      out.steer = Math.round(clamp(-err * GAIN, -1, 1) * 7);
      out.gas = true;
      const vf = me.vx * sinL(me.heading) + me.vz * cosL(me.heading);
      // SIM_VERSION 10: the escape direction comes from the nearest wall. With the tail to it (the nose points back into
      // the arena) backing up only pushes the kart into the wall: drive out forward instead (a cat sat reversing into
      // the Rug's outer wall for 48 s)
      const js = me.si;
      const side = me.d >= 0 ? 1 : -1;
      const room = (side > 0 ? t.wallR[js] : t.wallL[js]) - Math.abs(me.d);
      const facesIn = sinL(me.heading) * t.tz[js] * side - cosL(me.heading) * t.tx[js] * side;
      const tailToWall = room < 4 && facesIn > 0.2;
      // pinned on a wall: back off for half a second, or pull away from it when the tail is to the wall
      if (me.wall && sp < 3 && ai[o + 2] === 0) ai[o + 2] = tailToWall ? -30 : 30;
      if (ai[o + 2] > 0) {
        ai[o + 2]--;
        out.gas = false;
        out.brake = true;
        out.steer = -out.steer;
      } else if (ai[o + 2] < 0) {
        ai[o + 2]++;
        out.gas = true;
        out.brake = false;
      } else if (!tailToWall && ((Math.abs(err) > 1.9 && sp < 7) || (vf < -0.3 && Math.abs(err) > 0.8))) {
        // facing away: a three-point turn
        out.gas = false;
        out.brake = true;
        out.steer = -out.steer;
      } else if (Math.abs(err) > 1.1 && sp > 14) out.gas = false;
      // stuck anyway (wedged on furniture, in a corner, against another cat): every 2 s the watchdog makes the cat do
      // the opposite of what it is doing (back up if it pushes forward, pull away if it reverses) for 0.75 s
      // the second time in a row it also gives up on its target for a while (whatever wedged it lies on the way there)
      if (sp < STUCK_SPEED && me.spinTicks === 0) {
        if (++ai[o + 4] % STUCK === 0) {
          ai[o + 2] = out.brake ? -45 : 45;
          if (ai[o + 4] >= 2 * STUCK && code !== 0) {
            ai[o + 5] = code;
            ai[o + 6] = GIVE_UP;
            ai[o + 1] = 0;
          }
        }
      } else ai[o + 4] = 0;

      // items
      if (!me.item || me.rouletteTicks > 0) {
        ai[o + 3] = 0;
        return;
      }
      ai[o + 3]++;
      if (me.pItem || (st.tick + i) % 4 !== 0) return;
      // a lower skill reacts later
      if (draw(me, 'rngAi') > 0.45 + skill * 0.5) return;
      const fx = sinL(me.heading);
      const fz = cosL(me.heading);
      let aheadF = 999;
      let aheadS = 999;
      let behindF = -999;
      let near = 0;
      for (let j = 0; j < st.karts.length; j++) {
        if (j === i) continue;
        const k = st.karts[j];
        if (!hittable(b, k, j)) continue;
        const ex = k.x - me.x;
        const ez = k.z - me.z;
        const f = ex * fx + ez * fz;
        const s = ex * fz - ez * fx;
        const dist = Math.sqrt(ex * ex + ez * ez);
        if (dist < 22) near++;
        if (f > 0 && Math.abs(s) < 3 && f < aheadF) {
          aheadF = f;
          aheadS = s;
        }
        if (f < 0 && Math.abs(s) < 3 && f > behindF) behindF = f;
      }
      const hold = ai[o + 3];
      let fire = false;
      let back = false;
      switch (me.item) {
        case 'hairball':
          if (aheadF > 3 && aheadF < 28 && Math.abs(aheadS) < 2.2) fire = true;
          else if (behindF > -14) fire = back = true;
          break;
        case 'yarn':
          // held it is a shield from behind; dropped it is a trap for a chaser, thrown it homes
          if (behindF > -9) fire = back = true;
          else if (aheadF < 30 || hold > 600) fire = true;
          break;
        case 'cucumber':
          if (aheadF > 12 && aheadF < 26 && Math.abs(aheadS) < 3.5) fire = true;
          else if (behindF > -8) fire = back = true;
          break;
        case 'catnip':
          if ((aheadF > 3 && aheadF < 18 && Math.abs(aheadS) < 2.5) || hold > 360) fire = true;
          break;
        case 'zoomies':
          if ((aheadF > 2 && aheadF < 25) || hold > 480) fire = true;
          break;
        case 'box':
          if (behindF > -12 || hold > 300) fire = true;
          break;
        case 'bell':
          if (near >= 2 || (near >= 1 && hold > 240)) fire = true;
          break;
        default:
          fire = hold > 120;
      }
      if (fire) {
        out.item = true;
        out.itemBack = back;
      }
    },
  };
}
