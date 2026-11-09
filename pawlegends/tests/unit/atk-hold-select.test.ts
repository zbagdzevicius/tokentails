/**
 * Hold-to-select on the touch Attack button (Wild Rift style): the candidates in the acquire reach, the direction snap,
 * the hero preference (unless the thumb points right at a minion or tower), the cancel zone, and the selector's lock.
 */
import { describe, expect, it } from 'vitest';
import { angleGap, ATK_SELECT, dragZone, PickLock, selectCandidates, snapTarget } from '../../src/input/touch/attackSelect';
import { LOCK } from '../../src/input/touch/assist';
import type { Unit } from '../../src/input/targeting';

const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp: 100, state: 'idle' });
const me = u(0, 'hero', 0, 50000, 30000);
const RANGE = 1800;
const at = (deg: number, mm: number): { x: number; y: number } => ({ x: me.x + Math.cos((deg * Math.PI) / 180) * mm, y: me.y + Math.sin((deg * Math.PI) / 180) * mm });
const unitAt = (id: number, kind: Unit['kind'], deg: number, mm: number, team = 1): Unit => {
  const p = at(deg, mm);
  return u(id, kind, team, p.x, p.y);
};
const rad = (deg: number): number => (deg * Math.PI) / 180;

describe('selectCandidates: what the held Attack button offers', () => {
  it('only living, attackable enemies within range + reach (edge to edge)', () => {
    const near = unitAt(10, 'minion', 0, 2000);
    const reachEdge = unitAt(11, 'minion', 90, RANGE + ATK_SELECT.reachMm + 400 - 50); // body 400 mm
    const tooFar = unitAt(12, 'minion', 180, RANGE + ATK_SELECT.reachMm + 400 + 200);
    const ally = unitAt(13, 'minion', 0, 1500, 0);
    const dead = { ...unitAt(14, 'hero', 45, 1500), state: 'dead' as const };
    const fountain = unitAt(15, 'fountain', 30, 1000);
    const ids = selectCandidates([me, near, reachEdge, tooFar, ally, dead, fountain], me, 0, RANGE).map((x) => x.id);
    expect(ids.sort()).toEqual([10, 11]);
  });

  it('the selected unit stays a candidate ATK_SELECT.keepMm past the reach (no flicker), others do not', () => {
    const edgeMm = RANGE + ATK_SELECT.reachMm + 400 + 800; // 800 mm past the reach (body 400 mm)
    const kept = unitAt(10, 'minion', 0, edgeMm);
    const other = unitAt(11, 'minion', 90, edgeMm);
    expect(selectCandidates([me, kept, other], me, 0, RANGE, 10).map((x) => x.id)).toEqual([10]);
    expect(selectCandidates([me, kept, other], me, 0, RANGE, null)).toEqual([]);
    const gone = unitAt(10, 'minion', 0, RANGE + ATK_SELECT.reachMm + 400 + ATK_SELECT.keepMm + 100);
    expect(selectCandidates([me, gone], me, 0, RANGE, 10)).toEqual([]);
  });

  it('heroes first, then the nearest others, at most ATK_SELECT.max', () => {
    const units = [me, ...[1, 2, 3, 4, 5, 6, 7].map((i) => unitAt(20 + i, 'minion', i * 40, 800 + i * 100)), unitAt(3, 'hero', 200, 3500)];
    const c = selectCandidates(units, me, 0, RANGE);
    expect(c.length).toBe(ATK_SELECT.max);
    expect(c[0].id).toBe(3);
    expect(c.slice(1).map((x) => x.id)).toEqual([21, 22, 23, 24, 25]);
  });
});

describe('snapTarget: the direction picks the target', () => {
  it('snaps to the candidate closest to the pointed direction', () => {
    const a = unitAt(10, 'minion', 0, 2000);
    const b = unitAt(11, 'minion', 90, 2000);
    const c = unitAt(12, 'minion', 200, 2000);
    expect(snapTarget([a, b, c], me, rad(10))).toBe(10);
    expect(snapTarget([a, b, c], me, rad(70))).toBe(11);
    expect(snapTarget([a, b, c], me, rad(-150))).toBe(12); // wraps around ±π
  });

  it('prefers an enemy hero within the cone over a minion that is a bit closer in angle', () => {
    const minion = unitAt(10, 'minion', 20, 1500);
    const hero = unitAt(3, 'hero', 45, 2500);
    // pointing at 30°: the minion is 10° off (not pointed right at), the hero 15° off: the hero
    expect(snapTarget([minion, hero], me, rad(30))).toBe(3);
  });

  it('a minion or tower pointed right at wins over the hero', () => {
    const minion = unitAt(10, 'minion', 20, 1500);
    const hero = unitAt(3, 'hero', 45, 2500);
    expect(snapTarget([minion, hero], me, rad(20))).toBe(10);
    const tower = unitAt(30, 'tower', -60, 3000);
    expect(snapTarget([tower, hero], me, rad(-58))).toBe(30);
  });

  it('a hero outside the cone never steals the pick', () => {
    const minion = unitAt(10, 'minion', 0, 1500);
    const hero = unitAt(3, 'hero', 90, 2000);
    expect(snapTarget([minion, hero], me, rad(25))).toBe(10);
  });

  it('two heroes: the one in the pointed direction; a near tie goes to the nearer one', () => {
    const h1 = unitAt(3, 'hero', 0, 3000);
    const h2 = unitAt(4, 'hero', 60, 1500);
    expect(snapTarget([h1, h2], me, rad(50))).toBe(4);
    expect(snapTarget([h1, h2], me, rad(5))).toBe(3);
    const h3 = unitAt(5, 'hero', 2, 1200);
    expect(snapTarget([h1, h3], me, rad(1))).toBe(5);
  });

  it('no candidates: null', () => {
    expect(snapTarget([], me, 0)).toBeNull();
  });

  it('angleGap is symmetric and at most π', () => {
    expect(angleGap(rad(170), rad(-170))).toBeCloseTo(rad(20));
    expect(angleGap(0, Math.PI * 3)).toBeCloseTo(Math.PI);
  });
});

describe('dragZone: tap, aim, cancel', () => {
  it('a press stays a press inside the drag threshold, aims past it', () => {
    expect(dragZone(5, 5, false)).toBe('press');
    expect(dragZone(ATK_SELECT.dragPx + 1, 0, false)).toBe('aim');
  });
  it('once dragging, back within the centre cancels, out again aims', () => {
    expect(dragZone(10, 0, true)).toBe('cancel');
    expect(dragZone(0, ATK_SELECT.backPx, true)).toBe('cancel');
    expect(dragZone(0, ATK_SELECT.backPx + 2, true)).toBe('aim');
  });
});

describe('PickLock: the selector lock on a minion or structure', () => {
  const minion = unitAt(10, 'minion', 0, 1500);
  it('holds while the unit lives, is in the snapshot and the time lasts', () => {
    const l = new PickLock();
    l.set(10, 0);
    expect(l.check([me, minion], me, 0, 100)).toBe(10);
    expect(l.check([me, minion], me, 0, LOCK.ms + 1)).toBeNull();
    l.set(10, 0);
    expect(l.check([me], me, 0, 100)).toBeNull();
    l.set(10, 0);
    expect(l.check([me, { ...minion, state: 'dead' }], me, 0, 100)).toBeNull();
  });
  it('breaks once the unit was within breakMm and then got further', () => {
    const l = new PickLock();
    l.set(10, 0);
    expect(l.check([me, minion], me, 0, 10, 2000)).toBe(10);
    const away = unitAt(10, 'minion', 0, 4000);
    expect(l.check([me, away], me, 0, 20, 2000)).toBeNull();
  });
  it('left() drains from 1 to 0', () => {
    const l = new PickLock();
    expect(l.left(0)).toBe(0);
    l.set(10, 0);
    expect(l.left(LOCK.ms / 2)).toBeCloseTo(0.5);
  });
});
