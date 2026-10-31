/**
 * Meatball, Tank (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.1). Bespoke hooks: Food Coma (a
 * hit below the threshold puts him to sleep under a shield), Bowling Roll's sideways knock along the path, Loaf Mode's
 * rooted damage cut and charm, Big Brother's ally pick and landing, and Unstoppable Chonk's bumps.
 *
 * Phase 0 scaffold: the aims are final; cast() is a placeholder that spends no cooldown until the kit lands.
 *
 * Kit arrays: kHuntT Food Coma lockout; kRT loaf ticks; kWindow Chonk ticks; kCount Chonk bump bitmask (bit = enemy
 * hero id); kEmpower ticks until the bitmask clears; kStage 1 = Big Brother landing pending; kFoe the ally being guarded.
 */
import { FM, type World } from '../world';
import { Aim, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import type { KitNumbers } from './talents';

function aim(_a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      // Reach 0: cast where he stands; cast() clamps the point to the range and picks the ally (Gabė's Wing Wrap).
      return { aim: Aim.Point, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

/** Rolling (Bowling Roll in flight, not Big Brother's dash) or Unstoppable Chonk: the ball pose. */
const formed = (w: World, id: number): boolean => w.kWindow[id] > 0 || (w.fmKind[id] === FM.Dash && w.kStage[id] !== 1);

export const MEATBALL_KIT: HeroKit = {
  aim,
  cast() {
    return 0;
  },
  snapFx: (w, id) => (formed(w, id) ? SNAP_FX.Form : 0),
};
