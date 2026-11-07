/**
 * UX pass 2 (Wild Rift basic-attack targeting): the unit the Attack button would hit right now (attackPreview, ringed
 * on the field), the idle auto-attack taking the very same unit, and the last-hit (minion) button preferring the
 * minion the next basic kills. Client only: these decide which id an Attack command carries.
 */
import { describe, expect, it } from 'vitest';
import { attackPreview, attackPriority, inAttackReach, lastHitTarget, type Unit } from '../../src/input/targeting';
import { autoAttackTarget } from '../../src/input/touch/assist';

const u = (id: number, kind: Unit['kind'], team: number, x: number, hp = 100, maxHp = 100, y = 30000): Unit => ({ id, kind, team, x, y, hp, maxHp, state: 'idle' });
const me = u(0, 'hero', 0, 50000);
const RANGE = 1800;
/** The next basic deals 60 to minions (the last-hit estimate). */
const kill60 = (): number => 60;

describe('the Attack button target, three scenarios', () => {
  it('1. an enemy hero in range beats every minion (the lowest HP share among the heroes in range)', () => {
    const units = [me, u(20, 'minion', 1, 51200, 30, 400), u(3, 'hero', 1, 51800, 500, 600), u(4, 'hero', 1, 51600, 200, 600)];
    expect(attackPriority(units, me, 0, RANGE)).toBe(4);
    expect(attackPreview(units, me, 0, RANGE)).toBe(4);
  });

  it('2. no hero in range: the minion the next basic kills (the last hit), else the lowest-HP one', () => {
    const units = [me, u(20, 'minion', 1, 51200, 90, 400), u(21, 'minion', 1, 51000, 55, 400), u(22, 'minion', 1, 51400, 300, 400), u(3, 'hero', 1, 58000, 100, 600)];
    expect(attackPreview(units, me, 0, RANGE, 'heroes', kill60)).toBe(21);
    expect(attackPreview(units.filter((x) => x.id !== 21), me, 0, RANGE, 'heroes', kill60)).toBe(20);
  });

  it('3. only a tower in reach: the tower; an enemy hero 6 m away: rung too (the tap walks to it), out of reach', () => {
    const tower = u(30, 'tower', 1, 52500, 3000, 3000);
    expect(attackPreview([me, tower], me, 0, RANGE)).toBe(30);
    const far = u(3, 'hero', 1, 56000);
    expect(attackPriority([me, far], me, 0, RANGE)).toBe(3);
    expect(attackPreview([me, far], me, 0, RANGE)).toBe(3);
    expect(inAttackReach(far, me, RANGE)).toBe(false);
    expect(attackPreview([me, u(3, 'hero', 1, 60000)], me, 0, RANGE)).toBeNull();
  });

  it('a locked hero wins the preview, in range or not (the tap walks to it)', () => {
    const units = [me, u(3, 'hero', 1, 51500, 600, 600), u(4, 'hero', 1, 51600, 100, 600), u(5, 'hero', 1, 58000)];
    expect(attackPreview(units, me, 0, RANGE, 'heroes', undefined, 3)).toBe(3);
    expect(attackPreview(units, me, 0, RANGE, 'heroes', undefined, 5)).toBe(5);
  });

  it('the Settings order: Lowest HP % or Closest', () => {
    const units = [me, u(3, 'hero', 1, 51700, 400, 600), u(21, 'minion', 1, 50900, 300, 400)];
    expect(attackPreview(units, me, 0, RANGE, 'lowest')).toBe(3);
    expect(attackPreview(units, me, 0, RANGE, 'closest')).toBe(21);
  });
});

describe('the idle auto-attack takes what ATK rings (they agree)', () => {
  const cases: Unit[][] = [
    [me, u(20, 'minion', 1, 51200, 30, 400), u(3, 'hero', 1, 51800, 500, 600)],
    [me, u(20, 'minion', 1, 51200, 90, 400), u(21, 'minion', 1, 51000, 55, 400)],
    [me, u(20, 'minion', 1, 51200, 40, 400), u(21, 'minion', 1, 51000, 55, 400)],
    [me, u(3, 'hero', 1, 51800, 500, 600), u(4, 'hero', 1, 51600, 200, 600)],
  ];
  for (const [i, units] of cases.entries()) {
    it(`case ${i + 1}`, () => {
      const atk = attackPreview(units, me, 0, RANGE, 'heroes', kill60);
      // the auto-attack passes the reach with its own 300 mm slack
      expect(autoAttackTarget(units, me, 0, RANGE + 300, 'heroes', kill60)).toBe(atk);
    });
  }

  it('never starts on a tower or a neutral camp by itself (ATK may)', () => {
    const tower = u(30, 'tower', 1, 52500, 3000, 3000);
    expect(attackPreview([me, tower], me, 0, RANGE)).toBe(30);
    expect(autoAttackTarget([me, tower], me, 0, RANGE + 300, 'heroes', kill60)).toBeNull();
    expect(autoAttackTarget([me, u(41, 'camp', 2, 51000, 100, 450)], me, 0, RANGE + 300, 'heroes', kill60)).toBeNull();
  });
});

describe('the ring, the tap and the idle auto-attack never name three different units (review cases)', () => {
  it('A. a full-HP minion in reach and a 150-HP one 0.7 m past reach (killable): ring = tap = the far one; idle waits', () => {
    const near = u(20, 'minion', 1, 51600, 400, 400);
    const farKill = u(21, 'minion', 1, 50000 + RANGE + 300 + 400 + 700, 50, 400);
    const units = [me, near, farKill];
    const ring = attackPreview(units, me, 0, RANGE, 'heroes', kill60);
    expect(ring).toBe(21);
    expect(inAttackReach(farKill, me, RANGE)).toBe(false);
    expect(autoAttackTarget(units, me, 0, RANGE + 300, 'heroes', kill60)).toBeNull();
  });

  it('B. a killable minion just past reach: rung (out of reach) and the tap walks to it', () => {
    const m = u(21, 'minion', 1, 50000 + RANGE + 300 + 400 + 300, 50, 400);
    expect(attackPreview([me, m], me, 0, RANGE, 'heroes', kill60)).toBe(21);
  });

  it('C. a locked hero out of range with a minion in range: the ring is on the locked hero, idle never hits the minion', () => {
    const units = [me, u(20, 'minion', 1, 51000, 300, 400), u(5, 'hero', 1, 56000)];
    expect(attackPreview(units, me, 0, RANGE, 'heroes', kill60, 5)).toBe(5);
    expect(autoAttackTarget(units, me, 0, RANGE + 300, 'heroes', kill60, 5)).toBeNull();
    // in range, the lock is the idle target too
    expect(autoAttackTarget([me, u(5, 'hero', 1, 51500)], me, 0, RANGE + 300, 'heroes', kill60, 5)).toBe(5);
  });
});

describe('the last-hit (minion) button', () => {
  it('the minion the next basic kills first (nearest of them), else the lowest-HP one; never a hero or a tower', () => {
    const units = [me, u(20, 'minion', 1, 51200, 50, 400), u(21, 'minion', 1, 50900, 58, 400), u(3, 'hero', 1, 51000, 10, 600)];
    expect(lastHitTarget(units, me, 0, RANGE, kill60)).toBe(21);
    expect(lastHitTarget(units, me, 0, RANGE)).toBe(20);
    expect(lastHitTarget([me, u(3, 'hero', 1, 51000, 10, 600), u(30, 'tower', 1, 52000)], me, 0, RANGE, kill60)).toBeNull();
  });
});
