/** Shared test helpers: seeded random command streams for the sim. */
import { Op, type Command } from '../../src/sim/api';
import { Rng } from '../../src/sim/rng';

/** A random command (or none) for this tick, drawn from `r`. */
export function randomCommand(r: Rng, rateBp = 1500): Command | null {
  if (!r.chanceBp(rateBp)) return null;
  const x = r.range(0, 100000);
  const y = r.range(0, 60000);
  switch (r.int(8)) {
    case 0:
    case 1:
    case 2:
      return { op: Op.Move, x, y };
    case 3:
      return { op: Op.AttackMove, x, y };
    case 4:
      return { op: Op.Attack, id: r.int(63) };
    case 5:
      return { op: Op.Cast, slot: r.int(4) as 0 | 1 | 2 | 3, x, y, id: r.int(2) ? 255 : r.int(63) };
    case 6:
      return { op: Op.Stop };
    default:
      return r.int(2) ? { op: Op.Nap } : { op: Op.Talent, tier: r.int(3) as 0 | 1 | 2, choice: r.int(2) as 0 | 1 };
  }
}
