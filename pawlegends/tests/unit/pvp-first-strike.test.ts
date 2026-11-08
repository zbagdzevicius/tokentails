import { describe, expect, it } from 'vitest';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, step } from '../../src/sim/index';

/**
 * Sim v16 (PvP side bias): a mirror duel. The same hero stands on slot 0 and slot 3 at mirrored points and both are
 * ordered to attack each other on the same tick. Heroes step in id order; before the fix slot 3 read slot 0 after it
 * had already moved this tick, so it started its swing a tick earlier and won every close duel (map side 46.5%).
 * Every hero now reads the others where the tick started, so both sides land the first hit on the same tick.
 */
const none = (): Command[][] => [[], [], [], [], [], []];

function duel(hero: string, gap: number) {
  const picks = [hero, 'sage', 'gabe', hero, 'sage', 'gabe'];
  const m = createMatch({
    seed: 7,
    picks,
    tricks: ['snack', 'snack', 'snack', 'snack', 'snack', 'snack'],
    difficulty: 'hard',
    humans: [0, 1, 2, 3, 4, 5],
    mode: 'pvp',
  } as never);
  const w = m.world;
  const go = none();
  go[0] = [{ op: Op.Move, x: 50000 - gap / 2, y: 30000 }];
  go[3] = [{ op: Op.Move, x: 50000 + gap / 2, y: 30000 }];
  step(m, go[0], go);
  for (let t = 1; t < 500; t++) step(m, [], none());
  // The walk-in is a mirror image too.
  expect(w.x[0] + w.x[3]).toBe(100000);
  expect(w.y[0]).toBe(w.y[3]);
  const atk = none();
  atk[0] = [{ op: Op.Attack, id: 3 }];
  atk[3] = [{ op: Op.Attack, id: 0 }];
  step(m, atk[0], atk);
  const first: Record<string, number> = {};
  for (let k = 0; k < 600; k++) {
    step(m, [], none());
    for (const e of m.events as Array<Record<string, number | string>>) {
      if (e.type === 'hit' && (e.src === 0 || e.src === 3) && (e.dst === 0 || e.dst === 3)) first[`hit${e.src}`] ??= e.tick as number;
      if (e.type === 'death' && (e.id === 0 || e.id === 3)) first[`death${e.id}`] ??= e.tick as number;
    }
    if (first.death0 !== undefined || first.death3 !== undefined) break;
  }
  return { first, alive0: w.alive[0], alive3: w.alive[3], hp0: w.hp[0], hp3: w.hp[3] };
}

describe('PvP first strike is side-blind (sim v16)', () => {
  for (const hero of ['clem', 'rocket', 'sage']) {
    it(`${hero} on slot 0 and slot 3 hit first on the same tick and both, or neither, die`, () => {
      const r = duel(hero, 9000);
      expect(r.first.hit0).toBeDefined();
      expect(r.first.hit0).toBe(r.first.hit3);
      expect(r.alive0).toBe(r.alive3);
      expect(r.first.death0).toBe(r.first.death3);
      if (r.alive0 === 1) expect(r.hp0).toBe(r.hp3);
    });
  }
});
