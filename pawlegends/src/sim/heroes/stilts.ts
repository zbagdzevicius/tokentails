/**
 * Stilts, Assassin (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.4). Bespoke hooks: Long Stride
 * (Stride from distance walked, drained by standing still; at full she pounces on her attack target), High Leap's
 * untargetable leap and landing, Ear Swivel's reveal, Swat-Swat's two swats and Zoomies.
 *
 * Phase 0 scaffold: the aims are final; cast() is a placeholder that spends no cooldown until the kit lands.
 *
 * Kit arrays: kValor Stride; kCount mm walked carry; kChain/kEmpower last x/y; kHuntT ticks standing still; kStage 1
 * pounce in flight, 2 High Leap landing; kWT second-swat timer; kWAge swat angle; kRT Zoomies ticks.
 */
import type { World } from '../world';
import { Aim, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import type { KitNumbers } from './talents';

/** HERO_IDS index of Stilts (the snapshot's resource reads her Stride through the kit). */
export const STILTS_INDEX = 11;

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Point, reach: a.q.dash, windup: 0, mobility: true };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

export const STILTS_KIT: HeroKit = {
  aim,
  cast() {
    return 0;
  },
  snapFx: (w: World, id: number) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w: World, id: number) => w.kValor[id],
};
