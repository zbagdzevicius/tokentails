/**
 * TARGETING.md (founder: "improve clickability on champs / towers / minions ... especially in teamfights"): the body
 * pick (unitPick.ts), the aim magnet (aimMagnet.ts), "Weakest hero" in Target first, the lock with no timer, and the
 * Attack button never pulled onto a minion while an enemy hero is in range. Crowded scenes are built in screen px
 * (bodies) and sim mm (priority), so each rule is checked without a renderer.
 */
import { describe, expect, it } from 'vitest';
import { aimMagnet, magnetFor, MAGNET } from '../../src/input/aimMagnet';
import type { AimSpec } from '../../src/input/abilities';
import { attackPreview, attackPriority, pickNearest, type Unit } from '../../src/input/targeting';
import { autoAttackTarget, LOCK, TargetLock } from '../../src/input/touch/assist';
import { bodyGapPx, PICK, pickBody, type ScreenBody } from '../../src/input/unitPick';

const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 500, maxHp = 500): Unit => ({ id, kind, team, x, y, hp, maxHp, state: 'idle' });

/** A standing body on screen: feet at (x, y), `h` px tall, `r` px half width. */
const body = (x: number, y: number, h: number, r: number): ScreenBody => ({ fx: x, fy: y, hx: x, hy: y - h, r });

describe('body pick (unitPick.pickBody)', () => {
  it('a click on a hero head hits it: the old feet point missed anything 44 px above the feet', () => {
    const hero = { id: 1, kind: 'hero' };
    const b = body(400, 400, 86, 25);
    // the head, 80 px above the feet
    expect(pickBody([hero], () => b, 400, 322)).toBe(hero);
    expect(pickNearest([hero], () => ({ x: 400, y: 400 - 14, on: true }), 400, 322, 44)).toBeNull();
  });

  it('a tower is hit anywhere on its 6 m body', () => {
    const tower = { id: 9, kind: 'tower' };
    const b = body(600, 500, 238, 60);
    for (const y of [495, 420, 330, 280]) expect(pickBody([tower], () => b, 610, y)).toBe(tower);
  });

  it('an enemy hero beats a minion standing in front of it where their bodies overlap', () => {
    const hero = { id: 1, kind: 'hero' };
    const minion = { id: 20, kind: 'minion' };
    const bodies = new Map<number, ScreenBody>([
      [1, body(400, 400, 86, 25)],
      // a minion 10 px in front (lower on screen), its body over the hero's legs
      [20, body(405, 412, 40, 16)],
    ]);
    // the click sits on the minion's centre line and inside the hero's body
    expect(pickBody([minion, hero], (c) => bodies.get(c.id)!, 405, 392)).toBe(hero);
  });

  it('a minion clear of every hero body is still picked (farming by click keeps working)', () => {
    const hero = { id: 1, kind: 'hero' };
    const minion = { id: 20, kind: 'minion' };
    const bodies = new Map<number, ScreenBody>([
      [1, body(400, 400, 86, 25)],
      [20, body(500, 420, 40, 16)],
    ]);
    expect(pickBody([hero, minion], (c) => bodies.get(c.id)!, 500, 405)).toBe(minion);
  });

  it('a click squarely on a minion beside a hero takes the minion; the hero pad only wins on empty ground', () => {
    const hero = { id: 1, kind: 'hero' };
    const minion = { id: 20, kind: 'minion' };
    const bodies = new Map<number, ScreenBody>([
      [1, body(400, 400, 86, 25)],
      [20, body(440, 405, 40, 12)],
    ]);
    // 10 px outside the hero's body (in its pad), inside the minion's
    expect(pickBody([hero, minion], (c) => bodies.get(c.id)!, 435, 390)).toBe(minion);
    // 10 px outside the hero's body, outside the minion too: the hero's bigger pad takes it
    expect(pickBody([hero, minion], (c) => bodies.get(c.id)!, 400 - 35, 380)).toBe(hero);
  });

  it('between two overlapping heroes the nearer centre line wins, and the target already held keeps a small edge', () => {
    const a = { id: 1, kind: 'hero' };
    const b = { id: 2, kind: 'hero' };
    const bodies = new Map<number, ScreenBody>([
      [1, body(400, 400, 86, 25)],
      [2, body(420, 402, 86, 25)],
    ]);
    const at = (x: number, prefer: number | null = null): number | undefined => pickBody([a, b], (c) => bodies.get(c.id)!, x, 360, { prefer })?.id;
    expect(at(405)).toBe(1);
    expect(at(416)).toBe(2);
    // hysteresis: a click just past the middle keeps the held hero
    expect(at(412, 1)).toBe(1);
    expect(at(412, 2)).toBe(2);
  });

  it('a touch pad is wider than a mouse pad', () => {
    const hero = { id: 1, kind: 'hero' };
    const b = body(400, 400, 60, 14);
    const x = 400 + 14 + PICK.pad.hero + 4;
    expect(pickBody([hero], () => b, x, 380)).toBeNull();
    expect(pickBody([hero], () => b, x, 380, { padScale: PICK.touchPad })).toBe(hero);
  });

  it('bodyGapPx is 0 inside the capsule and grows outside it', () => {
    const b = body(0, 100, 80, 10);
    expect(bodyGapPx(b, 5, 60)).toBe(0);
    expect(bodyGapPx(b, 30, 60)).toBeCloseTo(20);
    expect(bodyGapPx(b, 0, 130)).toBeCloseTo(20);
  });

  it('teamfight metric: random clumps, taps over hero bodies: the body pick finds the hero far more often', () => {
    // a seeded crowd: 3 heroes and 6 minions in a 140 px clump, taps spread over each hero's body
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let oldHit = 0;
    let newHit = 0;
    let n = 0;
    for (let scene = 0; scene < 60; scene++) {
      const units: { id: number; kind: string; b: ScreenBody }[] = [];
      for (let i = 0; i < 9; i++) {
        const hero = i < 3;
        units.push({ id: i, kind: hero ? 'hero' : 'minion', b: body(400 + rnd() * 140, 400 + rnd() * 90, hero ? 86 : 40, hero ? 25 : 16) });
      }
      for (const t of units.slice(0, 3)) {
        for (let k = 0; k < 20; k++) {
          const x = t.b.fx + (rnd() * 2 - 1) * t.b.r * 0.9;
          const y = t.b.fy - rnd() * 86;
          const o = pickNearest(units, (c) => ({ x: c.b.fx, y: c.b.fy - 14, on: true }), x, y, 44);
          const p = pickBody(units, (c) => c.b, x, y);
          if (o?.id === t.id) oldHit++;
          if (p?.id === t.id) newHit++;
          n++;
        }
      }
    }
    expect(newHit / n).toBeGreaterThan(0.75);
    expect(newHit / n).toBeGreaterThan(oldHit / n + 0.2);
  });
});

describe('Attack button priority in a teamfight', () => {
  const me = u(0, 'hero', 0, 50000, 30000);
  const range = 4500;

  it('an enemy hero in range wins over a minion the next basic would kill (and over any minion)', () => {
    const units = [me, u(1, 'hero', 1, 53000, 30000, 400, 500), u(20, 'minion', 1, 51500, 30000, 10, 300), u(21, 'minion', 1, 52000, 30500, 100, 300)];
    expect(attackPriority(units, me, 0, range, undefined, 'heroes', () => 50)).toBe(1);
    expect(attackPreview(units, me, 0, range, 'heroes', () => 50)).toBe(1);
  });

  it('Heroes takes the lowest HP share; Weakest hero the fewest HP points (no tank tunnel)', () => {
    // a half-HP tank (1500/3000) and a 70% carry (700/1000)
    const units = [me, u(1, 'hero', 1, 53000, 30000, 1500, 3000), u(2, 'hero', 1, 52500, 31000, 700, 1000)];
    expect(attackPriority(units, me, 0, range, undefined, 'heroes')).toBe(1);
    expect(attackPriority(units, me, 0, range, undefined, 'absolute')).toBe(2);
    expect(autoAttackTarget(units, me, 0, range, 'absolute')).toBe(2);
  });

  it('a locked hero stays the pick over a closer, weaker one', () => {
    const units = [me, u(1, 'hero', 1, 53000, 30000, 100, 500), u(2, 'hero', 1, 54000, 30000, 500, 500)];
    expect(attackPreview(units, me, 0, range, 'heroes', undefined, 2)).toBe(2);
  });

  it('the lock has no timer: it holds through a long fight and ends on death or a second tap', () => {
    const foe = u(4, 'hero', 1, 53000, 30000);
    const l = new TargetLock();
    l.set(4, 0);
    expect(l.check([me, foe], me, 0, LOCK.ms * 10, 6000)).toBe(4);
    expect(l.check([me, { ...foe, state: 'dead' }], me, 0, LOCK.ms * 11, 6000)).toBeNull();
    l.set(4, 0);
    expect(l.set(4, 1)).toBe(false);
    expect(l.id).toBeNull();
  });
});

describe('aim magnet (aimMagnet.ts)', () => {
  const me = { x: 50000, y: 30000 };
  const line: AimSpec = { kind: 'dir', shape: 'line', range: 8000, width: 600, smart: 'hero' };
  const circle: AimSpec = { kind: 'point', shape: 'circle', range: 7000, radius: 1500, smart: 'hero' };

  it('a line aimed 8 deg off an enemy hero turns onto it; one aimed 25 deg off does not', () => {
    const foe = u(1, 'hero', 1, 56000, 30000);
    const a8 = (8 * Math.PI) / 180;
    const p = aimMagnet(line, me, { x: me.x + Math.cos(a8) * 8000, y: me.y + Math.sin(a8) * 8000 }, [foe], 0);
    expect(Math.atan2(p.y - me.y, p.x - me.x)).toBeCloseTo(0, 5);
    expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeCloseTo(8000, 0);
    const a25 = (25 * Math.PI) / 180;
    const q = { x: me.x + Math.cos(a25) * 8000, y: me.y + Math.sin(a25) * 8000 };
    expect(aimMagnet(line, me, q, [foe], 0)).toEqual(q);
  });

  it('takes the hero nearest the line, never an ally, a minion or one behind', () => {
    const units = [u(1, 'hero', 1, 56000, 30700), u(2, 'hero', 1, 55000, 29700), u(3, 'hero', 0, 55000, 30000), u(4, 'minion', 1, 54000, 30000), u(5, 'hero', 1, 45000, 30000)];
    const p = aimMagnet(line, me, { x: 58000, y: 30000 }, units, 0);
    expect(Math.atan2(p.y - me.y, p.x - me.x)).toBeCloseTo(Math.atan2(-300, 5000), 5);
  });

  it('a ground circle within 1 m of an enemy hero lands on it, in range only', () => {
    const foe = u(1, 'hero', 1, 54000, 30000);
    expect(aimMagnet(circle, me, { x: 54600, y: 30500 }, [foe], 0)).toEqual({ x: 54000, y: 30000 });
    const far = u(2, 'hero', 1, 58000, 30000);
    expect(aimMagnet(circle, me, { x: 57500, y: 30000 }, [far], 0)).toEqual({ x: 57500, y: 30000 });
  });

  it('never for blinks, escapes, flashes, ally or no-target casts', () => {
    expect(magnetFor({ ...line, blink: true })).toBe(false);
    expect(magnetFor({ ...line, heading: true })).toBe(false);
    expect(magnetFor({ ...line, away: true })).toBe(false);
    expect(magnetFor({ ...line, smart: 'ally' })).toBe(false);
    expect(magnetFor({ ...line, smart: 'none' })).toBe(false);
    expect(magnetFor({ kind: 'unit', shape: 'none', range: 5000, smart: 'hero' })).toBe(false);
    expect(magnetFor(line)).toBe(true);
    expect(MAGNET.arc).toBeLessThan(0.2);
  });
});
