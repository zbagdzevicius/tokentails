/**
 * Hold-to-select on the touch Attack button (Wild Rift style): the candidates in the acquire reach, the direction snap,
 * the hero preference (unless the thumb points right at a minion or tower), the cancel zone, and the selector's lock.
 */
import { describe, expect, it } from 'vitest';
import { angleGap, ATK_SELECT, dragZone, PickLock, releasePick, selectCandidates, selectReach, snapTarget } from '../../src/input/touch/attackSelect';
import { LOCK } from '../../src/input/touch/assist';
import { attackPreview, ATTACK_SEEK_MM, type Unit } from '../../src/input/targeting';

const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp: 100, state: 'idle' });
const me = u(0, 'hero', 0, 50000, 30000);
const RANGE = 1800;
const REACH = selectReach(RANGE);
const at = (deg: number, mm: number): { x: number; y: number } => ({ x: me.x + Math.cos((deg * Math.PI) / 180) * mm, y: me.y + Math.sin((deg * Math.PI) / 180) * mm });
const unitAt = (id: number, kind: Unit['kind'], deg: number, mm: number, team = 1): Unit => {
  const p = at(deg, mm);
  return u(id, kind, team, p.x, p.y);
};
const rad = (deg: number): number => (deg * Math.PI) / 180;

describe('selectCandidates: what the held Attack button offers', () => {
  it('the reach is range + reachMm, never shorter than the tap walk-in, never past the lock range', () => {
    expect(selectReach(1800)).toBe(ATTACK_SEEK_MM); // melee: 4.3 m would miss units the ATK ring shows at 4.3-7 m
    expect(selectReach(6000)).toBe(6000 + ATK_SELECT.reachMm);
    expect(selectReach(9000)).toBe(LOCK.rangeMm);
  });

  it('a melee hero is offered every unit the Attack tap rings (its 7 m walk-in), so a sweep toward it finds it', () => {
    // nothing in melee range: the tap rings (walks to) a minion 6 m away, edge to edge
    const far = unitAt(10, 'minion', 30, 6000 + 400);
    expect(attackPreview([me, far], me, 0, RANGE)).toBe(10);
    const c = selectCandidates([me, far], me, 0, RANGE);
    expect(c.map((x) => x.id)).toEqual([10]);
    expect(snapTarget(c, me, rad(40))).toBe(10);
  });

  it('only living, attackable enemies within range + reach (edge to edge)', () => {
    const near = unitAt(10, 'minion', 0, 2000);
    const reachEdge = unitAt(11, 'minion', 90, REACH + 900 - 50); // bodies 500 + 400 mm (edge to edge)
    const tooFar = unitAt(12, 'minion', 180, REACH + 900 + 200);
    const ally = unitAt(13, 'minion', 0, 1500, 0);
    const dead = { ...unitAt(14, 'hero', 45, 1500), state: 'dead' as const };
    const fountain = unitAt(15, 'fountain', 30, 1000);
    const ids = selectCandidates([me, near, reachEdge, tooFar, ally, dead, fountain], me, 0, RANGE).map((x) => x.id);
    expect(ids.sort()).toEqual([10, 11]);
  });

  it('the selected unit stays a candidate ATK_SELECT.keepMm past the reach (no flicker), others do not', () => {
    const edgeMm = REACH + 900 + 800; // 800 mm past the reach (bodies 500 + 400 mm)
    const kept = unitAt(10, 'minion', 0, edgeMm);
    const other = unitAt(11, 'minion', 90, edgeMm);
    expect(selectCandidates([me, kept, other], me, 0, RANGE, 10).map((x) => x.id)).toEqual([10]);
    expect(selectCandidates([me, kept, other], me, 0, RANGE, null)).toEqual([]);
    const gone = unitAt(10, 'minion', 0, REACH + 900 + ATK_SELECT.keepMm + 100);
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
  it('a thumb slip while spamming Attack (past the cancel centre, short of the drag) stays a press', () => {
    expect(ATK_SELECT.dragPx).toBeGreaterThan(ATK_SELECT.backPx);
    expect(dragZone(ATK_SELECT.backPx + 4, 0, false)).toBe('press');
  });
  it('once dragging, back within the centre cancels, out again aims', () => {
    expect(dragZone(10, 0, true)).toBe('cancel');
    expect(dragZone(0, ATK_SELECT.backPx, true)).toBe('cancel');
    expect(dragZone(0, ATK_SELECT.backPx + 2, true)).toBe('aim');
  });
});

describe('releasePick: the release takes what was highlighted', () => {
  const a = unitAt(10, 'minion', 0, 2000);
  const b = unitAt(11, 'hero', 90, 2000);
  it('the last step\'s selection when it is still a living enemy', () => {
    expect(releasePick(10, 11, [me, a, b], 0)).toBe(10);
  });
  it('falls back to the last highlighted unit when the last step found nothing (the wave moved off the thumb line)', () => {
    expect(releasePick(null, 11, [me, a, b], 0)).toBe(11);
  });
  it('falls back when the selection died or left the snapshot on the release frame', () => {
    expect(releasePick(10, 11, [me, { ...a, state: 'dead' }, b], 0)).toBe(11);
    expect(releasePick(10, 11, [me, b], 0)).toBe(11);
  });
  it('null when neither is a living enemy (the release cancels), never an ally', () => {
    expect(releasePick(null, null, [me, a], 0)).toBeNull();
    expect(releasePick(10, 11, [me, { ...a, state: 'dead' }], 0)).toBeNull();
    expect(releasePick(12, null, [me, unitAt(12, 'minion', 0, 1000, 0)], 0)).toBeNull();
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
