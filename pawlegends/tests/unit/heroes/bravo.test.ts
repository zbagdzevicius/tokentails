import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { BRAVO } from '../../../src/data/heroes/bravo';
import { PROJECTILE_KIND } from '../../../src/data/towers';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { canCast, kitBusy } from '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { dealDamage } from '../../../src/sim/combat/damage';
import { fireSkillshot } from '../../../src/sim/effects';
import { applyOrder } from '../../../src/sim/units/hero';
import { targetable } from '../../../src/sim/units/kinds';
import { snapshot } from '../../../src/sim/index';
import { Op, type SimEvent } from '../../../src/sim/api';
import { COOLDOWN_SLOTS, G, Kind, RANGE } from '../../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Bravo (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const BV = 0;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('bravo'));

function arena() {
  const m = heroMatch(['bravo', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, BV, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

/** Hit Bravo for `dmg` from FOE (a basic), or `pure` (true damage). */
const hit = (m: ReturnType<typeof arena>, dmg: number, pure = false) => dealDamage(m, FOE, 1, Kind.Hero, BV, dmg, 'basic', { pure });
/** A killing blow on a Bravo at 100 HP (small enough that Nine Lives, which caps a second's loss, does not soften it). */
const kill = (m: ReturnType<typeof arena>, pure = false) => {
  m.world.hp[BV] = 100;
  return hit(m, 5000, pure);
};

describe('Bravo, original dog tank (sim v13)', () => {
  it('data: a STELLAR dog tank, index 14; R is his only charm', () => {
    expect([BRAVO.side, BRAVO.role, BRAVO.element, BRAVO.name]).toEqual(['dog', 'tank', 'STELLAR', 'Bravo']);
    expect(HERO_IDS.indexOf('bravo')).toBe(14);
    expect(A.q.charm).toBeUndefined();
    expect(A.e.charm).toBeUndefined();
    expect(A.r.charm).toBe(30);
  });

  it('Dramatic Flop: a killing blow stops at 1 HP; untargetable, busy, the Form bit, a flop clip; 90 s lockout', () => {
    const m = arena();
    const w = m.world;
    kill(m);
    expect(w.hp[BV]).toBe(1);
    expect(w.alive[BV]).toBe(1);
    expect(w.untargT[BV]).toBe(A.passive.duration);
    expect(targetable(w, BV, 1)).toBe(false);
    expect(kitBusy(w, BV)).toBe(true);
    expect(m.events.some((e) => e.type === 'clip' && e.id === BV && e.what === 'flop')).toBe(true);
    expect(snapshot(m, 0).entities.find((e) => e.id === BV)?.form).toBe(true);
    expect(w.kHuntT[BV]).toBe(A.passive.cooldown);
    // Nothing touches him while he plays dead.
    hit(m, 500, true);
    expect(w.hp[BV]).toBe(1);
    steps(m, A.passive.duration + 2);
    expect(w.hp[BV]).toBeGreaterThan(1);
    expect(kitBusy(w, BV)).toBe(false);
    // Inside the lockout a second killing blow lands.
    kill(m);
    steps(m, 1);
    expect(w.alive[BV]).toBe(0);
  });

  it('Dramatic Flop: a pure execute is clamped too', () => {
    const m = arena();
    const w = m.world;
    kill(m, true);
    expect(w.hp[BV]).toBe(1);
  });

  it('Dramatic Flop: no move, basic or cast while flopped, even CC-immune', () => {
    const m = arena();
    const w = m.world;
    kill(m);
    w.ccImmT[BV] = 100;
    w.attackTimer[BV] = 0;
    for (let s = 0; s < 3; s++) expect(canCast(w, BV, s)).toBe(false);
    applyOrder(m, BV, { op: Op.Move, x: MID.x + 5000, y: MID.y });
    place(m, FOE, MID.x + 1200, MID.y, 2048);
    steps(m, 10);
    expect(w.x[BV]).toBe(MID.x);
    expect(w.windup[BV]).toBe(0);
  });

  it('Dramatic Flop: towers let go, and a skillshot already in flight misses', () => {
    const m = arena();
    const w = m.world;
    const t = RANGE.towers + 3;
    w.lockId[t] = BV;
    w.lockT[t] = 5;
    w.target[t] = BV;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    fireSkillshot(w, FOE, { kind: PROJECTILE_KIND.fluff, angle: 2048, speed: 15000, range: 6000, radius: 450, dmg: 50, flags: 0 });
    kill(m);
    expect(w.lockId[t]).toBe(-1);
    expect(w.target[t]).toBe(-1);
    const hp = w.hp[BV];
    steps(m, 8);
    expect(w.hp[BV]).toBeGreaterThanOrEqual(hp);
  });

  it('Dramatic Flop and Nine Lives lock each other out, in both orders', () => {
    // Flop first: Nine Lives cannot fire again inside the flop's lockout.
    const m = arena();
    const w = m.world;
    kill(m);
    expect(w.nineReady[BV]).toBeGreaterThanOrEqual(w.globals[G.Tick] + A.passive.cooldown);
    // Nine Lives first: the flop waits until it is ready again.
    const m2 = arena();
    const w2 = m2.world;
    w2.nineReady[BV] = w2.globals[G.Tick] + 100;
    w2.hp[BV] = 100;
    dealDamage(m2, FOE, 1, Kind.Hero, BV, 5000, 'basic');
    steps(m2, 1);
    expect(w2.alive[BV]).toBe(0);
  });

  it('Crocodile Tears: a hero hit is slowed 50%, fading to 25%, and Center Stage comes back 1 s sooner', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    w.cooldowns[BV * COOLDOWN_SLOTS + 1] = 300;
    cast(m, BV, 0, MID.x + 3000, MID.y);
    let t = 0;
    while (w.slowBp[FOE] === 0 && t++ < 20) steps(m, 1);
    expect(w.slowBp[FOE]).toBe(A.q.slowBp);
    expect(cd(m, BV, 1)).toBeLessThanOrEqual(300 - A.q.refundW);
    steps(m, A.q.slow + 1);
    expect(w.slowBp[FOE]).toBe(A.q.slowTailBp);
  });

  it('Center Stage: the cut only while he stands inside the stored centre; cats in it are slowed', () => {
    const m = arena();
    const w = m.world;
    const g = A.w;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    cast(m, BV, 1, MID.x, MID.y);
    steps(m, 2);
    expect(w.slowBp[FOE]).toBe(g.slowBp);
    const before = w.hp[BV];
    hit(m, 200);
    const inside = before - w.hp[BV];
    place(m, BV, MID.x + g.radius + 2000, MID.y, 0);
    const b2 = w.hp[BV];
    hit(m, 200);
    expect(b2 - w.hp[BV]).toBeGreaterThan(inside);
  });

  it('ENCORE!: enemy heroes in the ring are charmed to him and hurt; he gains a shield', () => {
    const m = arena();
    const w = m.world;
    w.level[BV] = 4;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, BV, 3, MID.x, MID.y);
    const events: SimEvent[] = [];
    for (let i = 0; i < A.r.windup + 2; i++) steps(m, 1);
    void events;
    expect(w.fearSrc[FOE]).toBe(BV);
    expect(hp - w.hp[FOE]).toBeGreaterThan(0);
    expect(w.shield[BV]).toBe(Math.trunc((w.maxHp[BV] * A.r.shieldBp) / 10000));
  });
});
