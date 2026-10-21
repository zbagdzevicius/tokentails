/**
 * The 8 items (GDD 4), registered once. `back` is the throw/drop-backwards modifier (swipe down, Down + item,
 * look-back).
 *
 * | Item | Forward (tap) | Back |
 * |---|---|---|
 * | Hairball | straight shot, rolls along the road, 3 wall bounces | shot backwards |
 * | Yarn | homing yarn ball at the kart ahead (also a shield while held) | tangle trap behind |
 * | Cucumber | lobbed ~18 m ahead, lands as a trap (jump-scare leap) | dropped behind |
 * | Catnip | boost ×3 | same |
 * | Cardboard Box | 3 s shield | same |
 * | Bell Collar | 25 m wobble ring | same |
 * | Zoomies | 3 s autopilot at 1.40×, invincible, knocks karts aside | same |
 * | Laser Dot | runs to the leader, chase on everyone it passes | same |
 */
import { BoostSource } from '../../types';
import { BOOST, ITEMS, ticks } from '../../tuning';
import { applyBoost } from '../../core/sim/kart';
import { registerItem, type ItemDef } from './registry';
import { fireHairball, fireLaser, fireYarnBall } from './projectiles';
import { dropTrap, lobCucumber } from './traps';
import { TrapKind, itemsOf } from './state';
import { itemHit, touchable } from './hits';

export const hairball: ItemDef = {
  id: 'hairball',
  charges: 1,
  use: (ctx, k, back) => fireHairball(ctx, k, back),
};

export const yarn: ItemDef = {
  id: 'yarn',
  charges: 1,
  use: (ctx, k, back) => (back ? dropTrap(ctx, k, TrapKind.Yarn) : fireYarnBall(ctx, k)),
};

export const cucumber: ItemDef = {
  id: 'cucumber',
  charges: 1,
  use: (ctx, k, back) => (back ? dropTrap(ctx, k, TrapKind.Cucumber) : lobCucumber(ctx, k)),
};

export const catnip: ItemDef = {
  id: 'catnip',
  charges: 3,
  use(ctx, kart) {
    applyBoost(ctx, kart, BOOST.catnip.level, BOOST.catnip.time, BoostSource.Catnip);
  },
};

export const box: ItemDef = {
  id: 'box',
  charges: 1,
  use(ctx, kart) {
    const k = ctx.st.karts[kart];
    k.shieldTicks = Math.max(k.shieldTicks, ticks(ITEMS.box.time));
  },
};

export const bell: ItemDef = {
  id: 'bell',
  charges: 1,
  use(ctx, kart) {
    const ks = ctx.st.karts;
    const me = ks[kart];
    const r2 = ITEMS.bell.radius * ITEMS.bell.radius;
    for (let j = 0; j < ks.length; j++) {
      if (j === kart || !touchable(ks[j])) continue;
      const dx = ks[j].x - me.x;
      const dz = ks[j].z - me.z;
      if (dx * dx + dz * dz <= r2) itemHit(ctx, j, 'wobble', kart, 'bell');
    }
  },
};

export const zoomies: ItemDef = {
  id: 'zoomies',
  charges: 1,
  use(ctx, kart) {
    const k = ctx.st.karts[kart];
    k.autoTicks = Math.max(k.autoTicks, ticks(ITEMS.zoomies.time));
    applyBoost(ctx, kart, BOOST.zoomies, ITEMS.zoomies.time, BoostSource.Zoomies);
  },
};

export const laser: ItemDef = {
  id: 'laser',
  charges: 1,
  notOnLap1: true,
  /** one at a time, 10 s cooldown race-wide, and never two held at once */
  blocked(ctx) {
    const s = itemsOf(ctx.st);
    if (s.laserCd > 0) return true;
    for (const p of s.proj) if (p.kind === 2) return true;
    // (a finished kart's held item can never be used: it does not block the Laser Dot for the karts still racing)
    for (const k of ctx.st.karts) if (k.item === 'laser' && !k.finished) return true;
    return false;
  },
  use: (ctx, k) => fireLaser(ctx, k),
};

let done = false;
export function registerDefaultItems(): void {
  if (done) return;
  done = true;
  for (const d of [hairball, yarn, cucumber, catnip, box, bell, zoomies, laser]) registerItem(d);
}
