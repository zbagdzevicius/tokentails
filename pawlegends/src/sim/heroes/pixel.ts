/**
 * Pixel, Marksman (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.2). Bespoke hooks: Cardboard
 * Plating (an absorb plate that refills out of combat), Cap Cannon's reveal shot, Laser Pointer's channelled beam that
 * turns with her, Duck and Cover's damage cut, and BOXBOT MK II's splash on basics.
 *
 * Phase 0 scaffold: the aims are final; cast() is a placeholder that spends no cooldown until the kit lands.
 *
 * Kit arrays: kHonour plate HP; kWT beam ticks left; kStage beam angle; kCount beam pulses; kRT duck ticks; kWindow
 * Boxbot ticks; kHurt (shared) last hero damage.
 */
import type { World } from '../world';
import { Aim, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import type { KitNumbers } from './talents';

function aim(_a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

const fx = (w: World, id: number): number => (w.kWindow[id] > 0 ? SNAP_FX.Form : 0) | (w.kWT[id] > 0 ? SNAP_FX.Channel : 0);

export const PIXEL_KIT: HeroKit = {
  aim,
  cast() {
    return 0;
  },
  snapFx: fx,
};
