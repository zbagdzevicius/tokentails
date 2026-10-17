/** Test helpers for the Room Maker (not shipped: only *.test.ts import this). */
import { content } from '../content';
import type { RoomDef } from '../types';
import { check } from './check';
import { newDraft, placeProp, toggleTarget } from './placement';

export const KITCHEN = (): RoomDef => newDraft(content.shells![0], 0, content.routines!);

/** A Kitchen room that passes check(): `n` mugs on the counter, the first 3 reachable ones are targets. */
export function validKitchen(extra = 0): RoomDef {
  const sh = content.shells![0];
  let room = KITCHEN();
  let targets = 0;
  for (let z = 0; z < sh.depth && targets < 3; z++)
    for (let x = 0; x < sh.width && targets < 3; x++) {
      if (sh.levels[z * sh.width + x] !== 2) continue;
      const r = placeProp(room, sh, 2, x, z);
      if (!r.ok) continue;
      const t = toggleTarget(r.room, r.index!);
      if (check(t.room, content).errors.some((e) => /reach|too far|nowhere to|is taken/.test(e))) continue;
      room = t.room;
      targets++;
    }
  for (let z = sh.depth - 1, n = 0; z >= 0 && n < extra; z--)
    for (let x = 0; x < sh.width && n < extra; x++) {
      const r = placeProp(room, sh, 19, x, z); // socks: free, zero points
      if (r.ok) {
        room = r.room;
        n++;
      }
    }
  return room;
}
