/**
 * Clem, Fighter (POC.md §6.3). Bespoke hooks: Valor (passive), the Paw Combo recasts, The Stand's frontal block and
 * parry (the reflect lives here, not as a primitive), Golden Hour's every-Nth-basic wave, and the talents Second
 * Wind (Tumble resets on a takedown) and Sunlit Mend (heals a share of the damage dealt during Golden Hour).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp } from '../fixed';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, ENTITY_CAP, G, Kind, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { attackSpeed, collect, dash, fireSkillshot, heal, inCone, inFront, knockback, stun, PFLAG } from '../effects';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, hasTalent, type KitNumbers } from './talents';
import { creditHealShield } from '../effects/heal';

const Q = 0;
const E = 2;
const hits = new Int32Array(ENTITY_CAP);

/** Spend a full Valor bar: true when this cast is empowered. */
function spendValor(w: World, id: number): boolean {
  const p = abil(w, id).passive;
  if (w.kValor[id] < p.valorMax) return false;
  w.kValor[id] = 0;
  return true;
}

/** Is The Stand's parry window open (a projectile hitting Clem now is reflected)? */
export function parryOpen(w: World, id: number): boolean {
  return w.kind[id] === Kind.Hero && w.sub[id] === CLEM_INDEX && w.kWT[id] > 0 && w.kWAge[id] < abil(w, id).w.parryWindow;
}

/** HERO_IDS index of Clem. */
export const CLEM_INDEX = 0;

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

function castQ(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const a = abil(w, id);
  const q = a.q;
  const open = w.kStage[id] > 0 && w.kWindow[id] > 0;
  const stage = open ? w.kStage[id] + 1 : 1;
  const dir = aimAngle(w, id, x, y);
  let dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
  if (spendValor(w, id)) dmg = applyBp(dmg, a.passive.valorBonusBp);
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, q.range, q.arc, w.x[e], w.y[e], r));
  const last = stage >= 1 + q.recasts;
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
    if (!last) continue;
    if ((q.stun ?? 0) > 0) stun(w, e, q.stun);
    else knockback(m, e, hx, hy, q.knockback, dir);
  }
  w.kChain[id] = w.globals[G.Tick];
  if (last) {
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    return q.cooldown;
  }
  if (stage === 1) w.kWindow[id] = q.recastWindow;
  w.kStage[id] = stage;
  return 0;
}

export const CLEM_KIT: HeroKit = {
  aim,
  recastReady: (w, id, slot) => slot === Q && w.kStage[id] > 0 && w.kWindow[id] > 0,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0:
        return castQ(m, id, x, y);
      case 1:
        w.kWT[id] = a.w.duration;
        w.kWAge[id] = 0;
        return a.w.cooldown;
      case 2:
        dash(m, id, aimAngle(w, id, x, y), a.e.dash);
        w.untargT[id] = Math.max(w.untargT[id], a.e.untargetable);
        return a.e.cooldown;
      default:
        w.kRT[id] = a.r.duration;
        w.kCount[id] = 0;
        w.kEmpower[id] = spendValor(w, id) ? 1 : 0;
        attackSpeed(w, id, a.r.attackSpeedBp, a.r.duration);
        return a.r.cooldown;
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0 && w.kStage[id] > 0) {
      // Window closed before the third hit: the cooldown counts from the last cast.
      const since = w.globals[G.Tick] - w.kChain[id];
      w.cooldowns[id * COOLDOWN_SLOTS + Q] = Math.max(0, abil(w, id).q.cooldown - since);
      w.kStage[id] = 0;
    }
    if (w.kWT[id] > 0) {
      w.kWT[id]--;
      w.kWAge[id]++;
    }
    if (w.kRT[id] > 0 && --w.kRT[id] === 0) w.kEmpower[id] = 0;
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (w.kRT[id] === 0) return;
    const r = abil(w, id).r;
    w.kCount[id]++;
    if (w.kCount[id] % r.everyNth !== 0) return;
    let dmg = lvl(w, id, r.waveDmg, r.waveDmgPerLevel);
    if (w.kEmpower[id] === 1) dmg = applyBp(dmg, abil(w, id).passive.valorBonusBp);
    fireSkillshot(w, id, {
      kind: PROJECTILE_KIND.wave,
      angle: aimAngle(w, id, w.x[dst], w.y[dst]),
      speed: r.waveSpeed,
      range: r.waveRange,
      radius: r.waveWidth >> 1,
      dmg,
      flags: PFLAG.Pierce,
    });
  },
  incoming(m, id, src, dmg) {
    const w = m.world;
    if (w.kWT[id] === 0 || src < 0) return dmg;
    const st = abil(w, id).w;
    return inFront(w, id, w.x[src], w.y[src], st.arc) ? applyBp(dmg, BP_ONE - st.reduceBp) : dmg;
  },
  afterDeal(m, id, dst, dmg, kind) {
    const w = m.world;
    const a = abil(w, id);
    if (kind === 'basic' || kind === 'ability') {
      const k = w.kind[dst];
      const gain = k === Kind.Hero ? a.passive.valorPerHeroHit : k === Kind.Minion ? a.passive.valorPerMinionHit : 0;
      w.kValor[id] = Math.min(a.passive.valorMax, w.kValor[id] + gain);
    }
    if (w.kRT[id] > 0 && (a.r.lifestealBp ?? 0) > 0) creditHealShield(m, id, heal(w, id, applyBp(dmg, a.r.lifestealBp)));
  },
  onTakedown(m, id) {
    if (hasTalent(m.world, id, 'second-wind')) m.world.cooldowns[id * COOLDOWN_SLOTS + E] = 0;
  },
  reset(w, id) {
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    w.kWT[id] = 0;
    w.kWAge[id] = 0;
    w.kRT[id] = 0;
    w.kEmpower[id] = 0;
    w.kCount[id] = 0;
  },
};
