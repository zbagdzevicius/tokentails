/**
 * MAP-GAPS A14: the input grid mirrors the standing towers and cores from the snapshot: a flash ghost stops at a
 * tower's footprint like the sim's blink, a tap on a core yields a goal outside it, and a fallen structure frees its
 * cells. Only the command the client sends changes; the sim and its replays do not.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { TRICKS } from '../../src/data/tricks';
import { trickAim } from '../../src/input/abilities';
import { headingPoint, landing } from '../../src/input/heading';
import { clientGrid, coveredStructures, resetStructures, syncStructures } from '../../src/input/navMirror';
import { reachableGoal } from '../../src/input/orders';
import { HUMAN_SLOT, Op } from '../../src/sim/api';
import { blink } from '../../src/sim/effects';
import { quantize } from '../../src/sim/commands';
import { createMatch, fillPicks } from '../../src/sim/index';
import type { MatchHandle } from '../../src/sim/state';
import { Kind, RANGE } from '../../src/sim/world';
import { cellOf, walkable } from '../../src/sim/map/grid';
import { CORE, RADIUS, TOWER_SPOTS } from '../../src/data/map';

const POUNCE = trickAim('pounce');
afterEach(() => resetStructures());

function match(): MatchHandle {
  const { picks, tricks } = fillPicks(7, 'clem', 'pounce');
  return createMatch({ seed: 7, picks, tricks, difficulty: 'easy' }) as MatchHandle;
}

function structuresOf(m: MatchHandle): { id: number; kind: string; x: number; y: number; state: string }[] {
  const w = m.world;
  const out: { id: number; kind: string; x: number; y: number; state: string }[] = [];
  for (let id = RANGE.towers; id < RANGE.fountains; id++) {
    if (w.alive[id] !== 1) continue;
    out.push({ id, kind: w.kind[id] === Kind.Core ? 'core' : 'tower', x: w.x[id], y: w.y[id], state: 'idle' });
  }
  return out;
}

describe('MAP-GAPS A14 client grid mirrors the structures', () => {
  it('covers every standing tower and core like the sim', () => {
    const m = match();
    const list = structuresOf(m);
    expect(list.length).toBe(10);
    syncStructures(list);
    const g = clientGrid();
    expect(Array.from(g.blocked)).toEqual(Array.from(m.grid.blocked));
    // a tower falls: its cells free on the next sync
    syncStructures(list.slice(1));
    expect(coveredStructures()).toHaveLength(9);
    expect(walkable(g, cellOf(list[0].x, list[0].y))).toBe(true);
  });

  it('a Pounce aimed onto a tower lands its ghost where the sim blink stops', () => {
    const m = match();
    syncStructures(structuresOf(m));
    const t = TOWER_SPOTS[0];
    const w = m.world;
    let checked = 0;
    for (const [dx, dy] of [
      [-4500, 0],
      [0, -4000],
      [3500, -2500],
    ]) {
      const me = { x: t.x + dx, y: t.y + dy };
      if (!walkable(m.grid, cellOf(me.x, me.y))) continue;
      const a = Math.atan2(t.y - me.y, t.x - me.x);
      w.x[HUMAN_SLOT] = me.x;
      w.y[HUMAN_SLOT] = me.y;
      const p = headingPoint(POUNCE, me, a);
      const q = quantize({ op: Op.Trick, x: Math.round(p.x), y: Math.round(p.y) }) as { x: number; y: number };
      blink(m, HUMAN_SLOT, q.x, q.y, TRICKS.pounce.blink);
      const l = landing(POUNCE, me, a);
      expect(Math.hypot(l.x - w.x[HUMAN_SLOT], l.y - w.y[HUMAN_SLOT]), `from ${dx},${dy}`).toBeLessThanOrEqual(1);
      expect(Math.hypot(l.x - t.x, l.y - t.y)).toBeGreaterThanOrEqual(RADIUS.tower - 500);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a tap on a core gives a goal outside its footprint', () => {
    const m = match();
    syncStructures(structuresOf(m));
    const g = reachableGoal(CORE.x + 8000, CORE.y, CORE.x, CORE.y);
    expect(walkable(clientGrid(), cellOf(g.x, g.y))).toBe(true);
    expect(Math.hypot(g.x - CORE.x, g.y - CORE.y)).toBeGreaterThan(RADIUS.core - 1000);
  });
});
