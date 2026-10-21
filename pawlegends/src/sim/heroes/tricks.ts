/**
 * Paw Tricks (POC.md §6.7), slot 4: Pounce (blink), Snack Break (heal over time), Hiss (fear ring) and, sim v10 (GAPS
 * B5), Purr-ify (cleanse, then a short crowd-control immunity).
 */
import { TRICKS } from '../../data/tricks';
import { applyBp } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, type World } from '../world';
import { blink, cleanse, collect, fear, healOverTime, inRing } from '../effects';
import { Aim, type SlotAim } from './kit';
import { TRICK_IDS } from '../../data/tricks';

const hits = new Int32Array(ENTITY_CAP);

/** The trick each hero slot carries is fixed for the match (config.tricks), kept in the world as `trickOf`. */
export function trickAim(w: World, id: number): SlotAim {
  switch (TRICK_IDS[w.trick[id]]) {
    case 'pounce':
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

/** Sim v10: Purr-ify is the one cast a stunned, feared or charmed hero can start and finish. */
export const castsThroughCc = (w: World, id: number): boolean => TRICK_IDS[w.trick[id]] === 'purrify';

/** Resolve hero `id`'s trick toward (x, y). Returns the cooldown. */
export function castTrick(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  switch (TRICK_IDS[w.trick[id]]) {
    case 'pounce':
      blink(m, id, x, y, TRICKS.pounce.blink);
      return TRICKS.pounce.cooldown;
    case 'snack':
      healOverTime(w, id, applyBp(w.maxHp[id], TRICKS.snack.healBp), TRICKS.snack.duration);
      return TRICKS.snack.cooldown;
    case 'purrify':
      cleanse(w, id, TRICKS.purrify.immune);
      return TRICKS.purrify.cooldown;
    default: {
      const h = TRICKS.hiss;
      const hx = w.x[id];
      const hy = w.y[id];
      const n = collect(w, w.team[id], hits, (e, r) => inRing(hx, hy, h.radius, w.x[e], w.y[e], r));
      for (let i = 0; i < n; i++) fear(w, hits[i], h.fear, hx, hy);
      return h.cooldown;
    }
  }
}
