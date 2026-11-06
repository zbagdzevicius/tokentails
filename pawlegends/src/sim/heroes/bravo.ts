/**
 * Bravo, Tank (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.3). Bespoke hooks: the Dramatic Flop
 * (playing dead), Crocodile Tears' fading slow and W refund, Center Stage's spotlight cut, Stage Dive's landing ring
 * and ENCORE!'s charm (his only charm).
 *
 * The flop runs in `absorb`, which the damage pipeline (combat/damage.ts) calls for every hit after the flat shield,
 * `pure` ones (true damage, executes) included: incoming → shield → absorb → Nine Lives. A hit that would leave him
 * below thresholdBp of max HP is clamped so he keeps at least 1 HP; he is untargetable and `busy` (no move, basic or
 * cast, CC immunity or not) for `duration`, heals healBp of max HP over it, and every tower and core locked on him lets
 * go. The flop and Nine Lives lock each other out: the flop needs `nineReady` passed and pushes it out by its own
 * lockout, so Nine Lives cannot save him again inside it (Nine Lives runs after absorb and sees the clamped, never
 * lethal hit).
 *
 * Kit arrays: kHuntT flop lockout; kRT flop ticks; kWT spotlight ticks; kHonour / kChain spotlight centre (x, y);
 * kFoe the Q victim for the slow tail; kWindow ticks until the tail; kStage 1 = Stage Dive landing pending.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, ENTITY_CAP, FM, G, Kind, RANGE, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { addShield, charm, collect, dash, fireSkillshot, healOverTime, inRing, slow, spawnBurst } from '../effects';
import { creditHealShield } from '../effects/heal';
import { disabled } from '../effects/status';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const W = 1;
const hits = new Int32Array(ENTITY_CAP);
/** True while Stage Dive or ENCORE! deal their damage: afterDeal then knows an ability hit is not a tear. */
let resolving = false;

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Point, reach: a.e.dash, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

/** Is Bravo playing dead? */
export const flopped = (w: World, id: number): boolean => w.kRT[id] > 0;

/** Stage Dive lands: a ring of damage and a slow round him. */
function dive(m: MatchHandle, id: number): void {
  const w = m.world;
  const e = abil(w, id).e;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (t, r) => inRing(hx, hy, e.radius, w.x[t], w.y[t], r));
  const dmg = lvl(w, id, e.dmg, e.dmgPerLevel);
  resolving = true;
  for (let i = 0; i < n; i++) {
    dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
    slow(w, hits[i], e.slowBp, e.slow);
  }
  resolving = false;
}

/** ENCORE!: every enemy hero in the ring is charmed to him and hurt; he takes a bow behind a shield. */
function encore(m: MatchHandle, id: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, er) => inRing(hx, hy, r.radius, w.x[e], w.y[e], er), true);
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  resolving = true;
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    charm(w, e, r.charm, id);
    slow(w, e, r.slowBp, r.charm);
    dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
  }
  resolving = false;
  creditHealShield(m, id, addShield(w, id, idiv(w.maxHp[id] * r.shieldBp, BP_ONE), r.duration));
  return r.cooldown;
}

/** The flop: clamp this hit, play dead, drop every structure's lock on him. Returns the damage absorbed. */
function flop(m: MatchHandle, id: number, dmg: number): number {
  const w = m.world;
  const p = abil(w, id).passive;
  const tick = w.globals[G.Tick];
  const absorbed = Math.max(0, dmg - (w.hp[id] - 1));
  w.untargT[id] = Math.max(w.untargT[id], p.duration);
  w.kRT[id] = p.duration;
  w.kHuntT[id] = p.cooldown;
  w.nineReady[id] = Math.max(w.nineReady[id], tick + p.cooldown);
  // Dropped where he stands: no swing, no cast, no dash in progress.
  w.windup[id] = 0;
  w.castPhase[id] = 0;
  w.castT[id] = 0;
  healOverTime(w, id, idiv(w.maxHp[id] * p.healBp, BP_ONE), p.duration);
  for (let t = RANGE.towers; t < RANGE.fountains; t++) {
    if (w.lockId[t] === id) {
      w.lockId[t] = -1;
      w.lockT[t] = 0;
    }
    if (w.target[t] === id) {
      w.target[t] = -1;
      w.forced[t] = 0;
    }
  }
  m.events.push({ type: 'clip', tick, id, what: 'flop' });
  return absorbed;
}

export const BRAVO_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const p = fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.fluff,
          angle: aimAngle(w, id, x, y),
          speed: q.speed,
          range: q.range,
          radius: q.width >> 1,
          dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
          flags: 0,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const g = a.w;
        const hx = w.x[id];
        const hy = w.y[id];
        // The stage itself is a burst zone (the slow, and what the render draws); the damage cut reads kit state only.
        spawnBurst(w, w.team[id], id, hx, hy, g.radius, 0, g.duration, 0, 0, g.every, g.slowBp, g.slow);
        w.kHonour[id] = hx;
        w.kChain[id] = hy;
        w.kWT[id] = g.duration;
        return g.cooldown;
      }
      case 2: {
        const e = a.e;
        const to = x === w.x[id] && y === w.y[id] ? e.dash : Math.min(e.dash, isqrt(dist2(w.x[id], w.y[id], x, y)));
        dash(m, id, aimAngle(w, id, x, y), Math.max(1, to));
        w.kStage[id] = 1;
        return e.cooldown;
      }
      default:
        return encore(m, id);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kHuntT[id] > 0) w.kHuntT[id]--;
    if (w.kRT[id] > 0) w.kRT[id]--;
    if (w.kWT[id] > 0) w.kWT[id]--;
    if (w.kStage[id] === 1 && w.napT[id] > 0) w.kStage[id] = 0;
    if (w.kStage[id] === 1 && w.fmKind[id] === FM.None) {
      w.kStage[id] = 0;
      if (!disabled(w, id)) dive(m, id);
    }
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0) {
      const v = w.kFoe[id];
      const q = abil(w, id).q;
      if (v >= 0 && w.alive[v] === 1) slow(w, v, q.slowTailBp, q.slowTail);
      w.kFoe[id] = -1;
    }
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    // Crocodile Tears: his only other ability damage (dive, encore) is flagged; the spotlight deals none.
    if (kind !== 'ability' || resolving || w.kind[dst] !== Kind.Hero || w.team[dst] === w.team[id]) return;
    const q = abil(w, id).q;
    slow(w, dst, q.slowBp, q.slow);
    w.kFoe[id] = dst;
    w.kWindow[id] = q.slow;
    const i = id * COOLDOWN_SLOTS + W;
    w.cooldowns[i] = Math.max(0, w.cooldowns[i] - q.refundW);
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    if (w.kWT[id] === 0) return dmg;
    const g = abil(w, id).w;
    if (dist2(w.x[id], w.y[id], w.kHonour[id], w.kChain[id]) > g.radius * g.radius) return dmg;
    return applyBp(dmg, BP_ONE - g.reduceBp);
  },
  absorb(m, id, dmg) {
    const w = m.world;
    // Playing dead: nothing touches him (a hit that slips through in the flop's own tick included).
    if (w.kRT[id] > 0) return dmg;
    if (w.kHuntT[id] > 0 || w.nineReady[id] > w.globals[G.Tick]) return 0;
    const p = abil(w, id).passive;
    if ((w.hp[id] - dmg) * BP_ONE >= w.maxHp[id] * p.thresholdBp) return 0;
    return flop(m, id, dmg);
  },
  busy: (w, id) => w.kRT[id] > 0,
  reset(w, id) {
    // The flop lockout (kHuntT) carries through death, like a cooldown.
    w.kRT[id] = 0;
    w.kWT[id] = 0;
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    w.kFoe[id] = -1;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
};
