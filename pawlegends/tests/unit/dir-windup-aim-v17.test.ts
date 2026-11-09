/**
 * Sim v17: a directional cast with a windup lands where its telegraph said when the windup started. A target id on the
 * command (the official client sends none; a modified client could) must not steer it onto the target's position at
 * the end of the windup, or the telegraph's dodge window is gone in PvP.
 */
import { describe, expect, it } from 'vitest';
import { NO_TARGET, Op, type SimEvent } from '../../src/sim/api';
import { step } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { MID, heroMatch, hold, place, setLevel, tanky } from './heroes/kit-helpers';

type CastEvent = Extract<SimEvent, { type: 'cast' }>;
type WindupEvent = Extract<SimEvent, { type: 'windup' }>;

const LAMBO = 0;
const FOE = 3;

function bellyFlop(target: number, dist: number) {
  const m = heroMatch(['lambo', 'clem', 'clem', 'sage', 'clem', 'clem']);
  const w = m.world;
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
  place(m, LAMBO, MID.x, MID.y, 0);
  place(m, FOE, MID.x + dist, MID.y, 0);
  setLevel(m, LAMBO, 4);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE);
  const hp = w.hp[FOE];
  applyOrder(m, LAMBO, { op: Op.Cast, slot: 2, x: MID.x + dist, y: MID.y, id: target });
  // The windup starts on the order (the event is pushed before the next step clears the list).
  const windup = m.events.find((e): e is WindupEvent => e.type === 'windup' && e.src === LAMBO);
  // The target walks sideways from the first tick.
  applyOrder(m, FOE, { op: Op.Move, x: MID.x + dist, y: MID.y + 20000 });
  let fired: CastEvent | undefined;
  for (let i = 0; i < 20; i++) {
    step(m);
    fired ??= m.events.find((e): e is CastEvent => e.type === 'cast' && e.src === LAMBO);
  }
  return { hit: w.hp[FOE] < hp, windup, fired };
}

describe('sim v17 directional windup aim', () => {
  for (const dist of [3500, 4500]) {
    it(`Lambo E at ${dist / 1000} m: a target id changes nothing; the cast lands on the telegraphed point`, () => {
      const plain = bellyFlop(NO_TARGET, dist);
      const aimed = bellyFlop(FOE, dist);
      expect(plain.hit).toBe(false);
      expect(aimed.hit).toBe(plain.hit);
      expect(aimed.windup).toBeDefined();
      expect(aimed.fired).toBeDefined();
      expect(aimed.fired?.target).toBe(-1);
      expect([aimed.fired?.x, aimed.fired?.y]).toEqual([aimed.windup?.x, aimed.windup?.y]);
    });
  }
});
