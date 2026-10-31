import { describe, expect, it } from 'vitest';
import { BOTS } from '../../../src/data/bots';
import { HERO_IDS } from '../../../src/data/heroes';
import { PIXEL } from '../../../src/data/heroes/pixel';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { Op, type Command } from '../../../src/sim/api';
import { clearCast, escapeCast, fightCast } from '../../../src/sim/bots/casts';
import { dealDamage } from '../../../src/sim/combat/damage';
import { stun } from '../../../src/sim/effects';
import { applyBp } from '../../../src/sim/fixed';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { snapshot } from '../../../src/sim/index';
import { Rng } from '../../../src/sim/rng';
import { COOLDOWN_SLOTS, G, Kind, RANGE } from '../../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Pixel (slot 0) with Sage (1) and Clem (2) vs Clem (slot 3, melee, armour 25), Sage (4, ranged) and Cacklejaw (5).
const PX = 0;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('pixel'));
const P = A.passive;

function arena() {
  const m = heroMatch(['pixel', 'sage', 'clem', 'clem', 'sage', 'cacklejaw']);
  place(m, PX, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 30000, MID.y, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2); // not Pixel: the plate is a share of her max HP
  return m;
}

const hitsOn = (m: ReturnType<typeof arena>, dst: number, kind?: string) =>
  m.events.filter((e) => e.type === 'hit' && e.src === PX && e.dst === dst && (kind === undefined || e.kind === kind)).length;

const plate = (m: ReturnType<typeof arena>): number => applyBp(m.world.maxHp[PX], P.plateBp);

const isCast = (c: Command | null, slot: number): boolean => !!c && c.op === Op.Cast && c.slot === slot;

describe('Pixel, original cat marksman (sim v11)', () => {
  it('data: an ICE cat marksman with a 5.8 m basic', () => {
    expect([PIXEL.side, PIXEL.role, PIXEL.element, PIXEL.name]).toEqual(['cat', 'marksman', 'ICE', 'Pixel']);
    expect(PIXEL.base.range).toBe(5800);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([240, 360, 480, 1950]);
    expect(P).toEqual({ plateBp: 800, refill: 120, hasteBp: 2500, haste: 45 });
  });

  it('Cardboard Plating: an 8% plate soaks hero hits, breaks into a burst of speed, refills after 4 s alone', () => {
    const m = arena();
    const w = m.world;
    steps(m, 1);
    expect(w.kHonour[PX]).toBe(plate(m));
    const hp = w.hp[PX];
    dealDamage(m, FOE, w.team[FOE], Kind.Hero, PX, 20, 'basic');
    expect(w.hp[PX]).toBe(hp);
    expect(w.kHonour[PX]).toBeLessThan(plate(m));
    expect(w.hasteT[PX]).toBe(0);
    dealDamage(m, FOE, w.team[FOE], Kind.Hero, PX, 200, 'basic');
    expect(w.kHonour[PX]).toBe(0);
    expect(w.hp[PX]).toBeLessThan(hp);
    expect([w.hasteBp[PX], w.hasteT[PX]]).toEqual([P.hasteBp, P.haste]);
    // No refill while hero damage is recent; a full plate once `refill` ticks have passed.
    steps(m, P.refill - 2);
    expect(w.kHonour[PX]).toBe(0);
    steps(m, 4);
    expect(w.kHonour[PX]).toBe(plate(m));
  });

  it('Cap Cannon: a cap bolt that flies through minions, stops on the first hero and reveals it', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    place(m, FOE2, MID.x + 7000, MID.y, 2048);
    cast(m, PX, 0, MID.x + 5000, MID.y);
    expect(cd(m, PX, 0)).toBe(A.q.cooldown);
    let caps = 0;
    for (let p = 0; p < w.pAlive.length; p++) if (w.pAlive[p] === 1 && w.pKind[p] === PROJECTILE_KIND.cap) caps++;
    expect(caps).toBe(1);
    let onFoe = 0;
    let onFoe2 = 0;
    for (let t = 0; t < 20; t++) {
      steps(m, 1);
      onFoe += hitsOn(m, FOE, 'ability');
      onFoe2 += hitsOn(m, FOE2);
    }
    expect([onFoe, onFoe2]).toEqual([1, 0]);
    expect(w.revealT[FOE]).toBeGreaterThan(0);
  });

  it('Laser Pointer: a 1.5 s beam pulses every 8 ticks with a slow that grows to 40%; she is slowed; it turns with her', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    cast(m, PX, 1, MID.x + 5000, MID.y);
    expect(w.kWT[PX]).toBe(A.w.duration);
    expect(snapshot(m, 1).entities.find((e) => e.id === PX)?.channel).toBe(true);
    let pulses = 0;
    const slows: number[] = [];
    for (let t = 0; t < A.w.duration; t++) {
      steps(m, 1);
      const n = hitsOn(m, FOE, 'ability');
      pulses += n;
      if (n > 0) slows.push(w.slowBp[FOE]);
      if (w.kWT[PX] > 0) expect(w.slowBp[PX]).toBe(A.w.selfSlowBp);
    }
    expect(pulses).toBe(5);
    expect(slows).toEqual([1000, 2000, 3000, 4000, 4000]);
    expect(w.kWT[PX]).toBe(0);
    expect(snapshot(m, 1).entities.find((e) => e.id === PX)?.channel ?? false).toBe(false);
    // Turning: the beam follows her facing at most `turn` steps a tick.
    const m2 = arena();
    cast(m2, PX, 1, MID.x + 5000, MID.y);
    m2.world.facing[PX] = 1024;
    steps(m2, 3);
    expect(m2.world.kStage[PX]).toBe(3 * A.w.turn);
  });

  it('Laser Pointer breaks on a stun and when she casts another ability', () => {
    const m = arena();
    const w = m.world;
    cast(m, PX, 1, MID.x + 5000, MID.y);
    steps(m, 3);
    stun(w, PX, 10);
    steps(m, 1);
    expect(w.kWT[PX]).toBe(0);
    const m2 = arena();
    cast(m2, PX, 1, MID.x + 5000, MID.y);
    steps(m2, 3);
    cast(m2, PX, 2, MID.x, MID.y);
    expect(m2.world.kWT[PX]).toBe(0);
  });

  it('Duck and Cover: rooted, 75% less damage, plate refilled, melee attackers slowed', () => {
    const plain = arena();
    const ducked = arena();
    for (const m of [plain, ducked]) {
      place(m, FOE, MID.x + 1500, MID.y, 2048);
      place(m, FOE2, MID.x + 5000, MID.y, 2048);
      tanky(m, PX); // a 400 hit stays under Nine Lives' cut
      m.world.kHonour[PX] = 0;
      m.world.kHurt[PX] = m.world.globals[G.Tick];
    }
    cast(ducked, PX, 2, MID.x, MID.y);
    const w = ducked.world;
    expect(w.rootT[PX]).toBeGreaterThan(0);
    expect(w.kRT[PX]).toBe(A.e.duration);
    expect(w.kHonour[PX]).toBe(plate(ducked));
    w.kHonour[PX] = 0;
    const loss = (m: ReturnType<typeof arena>): number => {
      const hp = m.world.hp[PX];
      dealDamage(m, FOE2, m.world.team[FOE2], Kind.Hero, PX, 400, 'basic');
      return hp - m.world.hp[PX];
    };
    const full = loss(plain);
    expect(loss(ducked)).toBe(applyBp(full, 10000 - A.e.reduceBp));
    // Sage (ranged) is not slowed; Clem (melee) is.
    expect(w.slowT[FOE2]).toBe(0);
    dealDamage(ducked, FOE, w.team[FOE], Kind.Hero, PX, 40, 'basic');
    expect([w.slowBp[FOE], w.slowT[FOE]]).toEqual([A.e.slowBp, A.e.slow]);
    expect(cd(ducked, PX, 2)).toBe(A.e.cooldown);
  });

  it('BOXBOT MK II: shield, speed, faster cooldowns, a short cleanse, and basics that splash 70% around the target', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, PX, 4);
    stun(w, PX, 0);
    w.slowBp[PX] = 5000;
    w.slowT[PX] = 60;
    cast(m, PX, 3, MID.x, MID.y);
    expect(w.shield[PX]).toBe(A.r.shield + 3 * A.r.shieldPerLevel);
    expect(w.hasteBp[PX]).toBe(A.r.hasteBp);
    expect(w.cdrBp[PX]).toBe(A.r.cdrBp);
    expect(w.slowT[PX]).toBe(0);
    expect(w.ccImmT[PX]).toBeGreaterThan(0);
    expect(w.kWindow[PX]).toBe(A.r.duration);
    expect(snapshot(m, 1).entities.find((e) => e.id === PX)?.form).toBe(true);
    place(m, FOE, MID.x + 4000, MID.y, 2048);
    place(m, FOE2, MID.x + 4000, MID.y + 1200, 2048);
    m.events.length = 0;
    dealDamage(m, PX, w.team[PX], Kind.Hero, FOE, 100, 'basic');
    expect(hitsOn(m, FOE)).toBe(1);
    expect(hitsOn(m, FOE2, 'ability')).toBe(1);
    // Without the window: no splash.
    w.kWindow[PX] = 0;
    m.events.length = 0;
    dealDamage(m, PX, w.team[PX], Kind.Hero, FOE, 100, 'basic');
    expect(hitsOn(m, FOE2)).toBe(0);
    steps(m, 1);
    expect(snapshot(m, 1).entities.find((e) => e.id === PX)?.form ?? false).toBe(false);
  });

  it('reset: death clears the beam, the duck, Boxbot and the plate', () => {
    const m = arena();
    const w = m.world;
    cast(m, PX, 1, MID.x + 5000, MID.y);
    w.kWindow[PX] = 30;
    w.kRT[PX] = 10;
    w.hp[PX] = 1;
    dealDamage(m, FOE, w.team[FOE], Kind.Hero, PX, 5000, 'basic', { pure: true });
    steps(m, 1);
    expect([w.kWT[PX], w.kWindow[PX], w.kRT[PX], w.kHonour[PX]]).toEqual([0, 0, 0, 0]);
  });
});

describe('Pixel bot (sim v11)', () => {
  function bot() {
    const m = arena();
    setLevel(m, PX, 6);
    return m;
  }
  const fight = (m: ReturnType<typeof bot>, foe = FOE) => fightCast(m.world, PX, foe, BOTS.normal, new Rng(7));

  it('fight: BOXBOT when healthy with a foe near, then Cap Cannon, then the beam from a safe distance', () => {
    const m = bot();
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    expect(isCast(fight(m), 3)).toBe(true);
    m.world.cooldowns[PX * COOLDOWN_SLOTS + 3] = 100;
    expect(isCast(fight(m), 0)).toBe(true);
    m.world.cooldowns[PX * COOLDOWN_SLOTS + 0] = 100;
    expect(isCast(fight(m), 1)).toBe(true);
    // A foe inside pixelBeamSafe: no beam.
    place(m, FOE2, MID.x + 2000, MID.y, 2048);
    expect(isCast(fight(m), 1)).toBe(false);
  });

  it('fight and escape: Duck and Cover against a melee hero on her when she is low', () => {
    const m = bot();
    const w = m.world;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    w.hp[PX] = w.maxHp[PX] >> 2;
    expect(isCast(fight(m), 2)).toBe(true);
    expect(isCast(escapeCast(w, PX, FOE, BOTS.normal), 2)).toBe(true);
    // Not against a ranged foe.
    place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
    place(m, FOE2, MID.x + 1500, MID.y, 2048);
    expect(isCast(fight(m, FOE2), 2)).toBe(false);
  });

  it('clear: Cap Cannon at a lone target (a rat or Pudding)', () => {
    const m = bot();
    const w = m.world;
    // A camp rat (first slot, woken by hand) is the lone target.
    const rat = RANGE.camps;
    expect(w.kind[rat]).toBe(Kind.Camp);
    w.alive[rat] = 1;
    w.hp[rat] = w.maxHp[rat] || 300;
    place(m, PX, w.x[rat] - 5000, w.y[rat], 0);
    w.cooldowns[PX * COOLDOWN_SLOTS + 1] = 100;
    expect(isCast(clearCast(w, PX, rat), 0)).toBe(true);
  });
});
