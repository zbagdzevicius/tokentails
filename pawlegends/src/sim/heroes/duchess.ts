/**
 * Duchess, Mage (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.3). Bespoke hooks: Utter Disdain
 * (her ability hits stack Disdain on the victim; at the cap the victim is Snubbed), Fluff Puff's piercing shot, Not
 * Amused's cone, Cushion Glide's fur cloud and glide, and Royal Decree's ring.
 *
 * Phase 0 scaffold: the aims are final; cast() is a placeholder that spends no cooldown until the kit lands.
 *
 * Kit arrays: none of her own; Disdain lives on the victim in the `mk*` arrays (effects/stack.ts).
 */
import { Aim, type HeroKit, type SlotAim } from './kit';
import type { KitNumbers } from './talents';

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: a.w.windup, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

export const DUCHESS_KIT: HeroKit = {
  aim,
  cast() {
    return 0;
  },
};
