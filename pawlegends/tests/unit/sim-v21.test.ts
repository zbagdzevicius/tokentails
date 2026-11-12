/**
 * Sim v21 (docs/plans/moba/V21-FUN.md): the Kibble Cannon, Boing Beds, the Mega Yarn Ball and stronger towers.
 * Scripted scenarios (bots off, heroes placed by hand), the command codec, and determinism on both maps.
 */
import { describe, expect, it } from 'vitest';
import { BOING, CANNON, CROSSING_BEDS, CROSSING_CANNON, CROSSING_YARN, HEARTHWOOD_BEDS, HEARTHWOOD_CANNON, HEARTHWOOD_YARN, YARN } from '../../src/data/fun';
import { TOWERS } from '../../src/data/towers';
import { TIMELINE } from '../../src/data/timeline';
import { Op, type Command, type MapId } from '../../src/sim/api';
import { decodeCommand, encodeCommand, quantize } from '../../src/sim/commands';
import { createMatch, createPlayerBotFor, fillPicks, hash, playerBotCommands, result, snapshot, step, type MatchHandle } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { dealDamage } from '../../src/sim/combat/damage';
import { knockback } from '../../src/sim/effects/knockback';
import { stun } from '../../src/sim/effects/stun';
import { moveSpeed } from '../../src/sim/units/kinds';
import { bedOf } from '../../src/sim/units/boing';
import { yarnAt } from '../../src/sim/units/yarn';
import { createGrid, cellOf, walkable } from '../../src/sim/map/grid';
import { bindMap } from '../../src/sim/map/runtime';
import { Buff, CANNON_STATE, FM, G, Kind, RANGE, YARN_STATE, YF } from '../../src/sim/world';
import { SIM_VERSION } from '../../src/sim/version';
import { heroMatch, hold, place, steps, tanky } from './heroes/kit-helpers';
import { putMinion, towerId } from './sim-helpers';

/** Put a fresh cannon on the ground at (x, y). */
function dropCannon(m: MatchHandle, x: number, y: number): void {
  const w = m.world;
  w.globals[G.CannonState] = CANNON_STATE.Ground;
  w.globals[G.CannonBy] = -1;
  w.globals[G.CannonX] = x;
  w.globals[G.CannonY] = y;
  w.globals[G.CannonFuse] = CANNON.fuse;
  w.globals[G.CannonDrop] = 0;
  w.globals[G.CannonAt] = -1;
}

/** A match where hero `carrier` holds the cannon (Clem, Sage, Brutus vs Sage, Brutus, Cacklejaw by default). */
function carrying(carrier = 0, picks = ['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw'] as const): MatchHandle {
  const m = heroMatch(picks);
  // Open ground north of the rat-camp walls (row y = 36 m is clear from x = 2 m to 97 m); the others off the line.
  for (let id = 0; id < 6; id++) place(m, id, 20000 + id * 4000, id === carrier ? LANE_Y : LANE_Y - 4000 - id * 500, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  dropCannon(m, m.world.x[carrier], m.world.y[carrier]);
  step(m);
  return m;
}

/** The test lane: y = 36 m on Crossing, open from wall to wall. */
const LANE_Y = 36000;

const events = (m: MatchHandle, type: string) => m.events.filter((e) => e.type === type);

describe('sim v21 version and data', () => {
  it('SIM_VERSION is 21 or later (sim v22 keeps the v21 rules)', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(21);
  });

  it('stronger towers: 120 a shot, +25% a shot up to +80%, outer and inner +25%, Fortified until 3:00 / 5:00', () => {
    expect([TOWERS.heroDamage, TOWERS.rampBp, TOWERS.rampCapBp]).toEqual([120, 2500, 8000]);
    expect([TOWERS.outer.hp, TOWERS.inner.hp]).toEqual([2250, 2750]);
    expect([TOWERS.fortifyBp, ...TOWERS.fortifyUntil]).toEqual([6500, 5400, 9000]);
  });

  it('every cannon, bed, landing and yarn spot is walkable, and the cannon spots are equally far from both cores', () => {
    for (const [map, cannon, beds, yarn] of [
      ['crossing', CROSSING_CANNON, CROSSING_BEDS, CROSSING_YARN],
      ['hearthwood', HEARTHWOOD_CANNON, HEARTHWOOD_BEDS, HEARTHWOOD_YARN],
    ] as const) {
      const { picks, tricks } = fillPicks(1, 'clem', 'pounce', map);
      const m = createMatch({ seed: 1, picks, tricks, difficulty: 'normal', map });
      bindMap(m.world.map);
      const g = createGrid();
      const ok = (x: number, y: number) => walkable(g, cellOf(x, y));
      const c0 = RANGE.cores;
      for (const [x, y] of cannon.spots) {
        expect(ok(x, y), `${map} cannon ${x},${y}`).toBe(true);
        const d0 = Math.hypot(m.world.x[c0] - x, m.world.y[c0] - y);
        const d1 = Math.hypot(m.world.x[c0 + 1] - x, m.world.y[c0 + 1] - y);
        expect(Math.abs(d0 - d1), `${map} cannon fairness`).toBeLessThan(2);
      }
      const bed = new Int32Array(4);
      for (let i = 0; i < beds.length * 2; i++) {
        bedOf(m.world, i, bed);
        expect(ok(bed[0], bed[1]) && ok(bed[2], bed[3]), `${map} bed ${i}`).toBe(true);
      }
      for (const [x, y] of yarn.homes) expect(ok(x, y), `${map} yarn ${x},${y}`).toBe(true);
    }
    bindMap(0);
  });
});

describe('Op.Fire (sim v21)', () => {
  it('encodes as 5 bytes (x, y quantised like a move) and round-trips', () => {
    const cmd: Command = { op: Op.Fire, x: 41234, y: 29876 };
    const bytes = encodeCommand(cmd);
    expect(bytes.length).toBe(5);
    expect(decodeCommand(bytes)).toEqual(quantize(cmd));
  });

  it('a hero without the cannon is ignored', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    applyOrder(m, 0, { op: Op.Fire, x: 60000, y: 30000 });
    expect(m.world.globals[G.CannonWind]).toBe(0);
  });
});

describe('Kibble Cannon (sim v21)', () => {
  it('spawns on the river at 1:30 after a 10 s warning, spots in turn', () => {
    const { picks, tricks } = fillPicks(3, 'clem', 'pounce');
    const m = createMatch({ seed: 3, picks, tricks, difficulty: 'normal' });
    m.world.globals[G.BotsOff] = 1;
    const seen: string[] = [];
    while (m.world.globals[G.Tick] <= CROSSING_CANNON.first) {
      step(m);
      for (const e of m.events) if (e.type === 'cannonSoon' || e.type === 'cannonSpawn') seen.push(`${e.type}@${e.tick}:${e.x},${e.y}`);
    }
    const [x, y] = CROSSING_CANNON.spots[0];
    expect(seen).toEqual([`cannonSoon@${CROSSING_CANNON.first - CANNON.warn}:${x},${y}`, `cannonSpawn@${CROSSING_CANNON.first}:${x},${y}`]);
    const fun = snapshot(m, 1).fun!;
    expect(fun.cannon.state).toBe('ground');
    expect([fun.cannon.x, fun.cannon.y]).toEqual([x, y]);
  });

  it('walk over it to pick it up: the carrier is 15% slower, revealed and flagged; the fuse burns, then it fizzles', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    for (let id = 0; id < 6; id++) place(m, id, 20000 + id * 4000, 30000, 0);
    hold(m, 0, 1, 2, 3, 4, 5);
    const before = moveSpeed(m.world, 0);
    dropCannon(m, m.world.x[0], m.world.y[0]);
    step(m);
    const w = m.world;
    expect(events(m, 'cannonPick')).toEqual([{ type: 'cannonPick', tick: w.globals[G.Tick] - 1, id: 0, team: 0, steal: false }]);
    expect(w.globals[G.CannonBy]).toBe(0);
    expect(moveSpeed(w, 0)).toBeLessThan(before);
    expect(w.buffs[0] & Buff.Cannon).not.toBe(0);
    expect(w.revealT[0]).toBeGreaterThan(0);
    let fizzled = false;
    for (let t = 0; t < CANNON.fuse + 5 && !fizzled; t++) {
      step(m);
      fizzled = events(m, 'cannonFizzle').length > 0;
    }
    expect(fizzled).toBe(true);
    expect(w.globals[G.CannonState]).toBe(CANNON_STATE.None);
    expect(w.globals[G.CannonAt]).toBe(w.globals[G.Tick] - 1 + CROSSING_CANNON.respawn);
  });

  it('KABOOM: the shot passes a minion and one-shots the first enemy hero, through Nine Lives and a shield', () => {
    const m = carrying(0);
    const w = m.world;
    place(m, 0, 30000, LANE_Y, 0);
    place(m, 3, 40000, LANE_Y, 0);
    tanky(m, 3);
    w.shield[3] = 500;
    w.nineT[3] = 90; // Nine Lives running
    const minion = putMinion(m, 1, 35000, LANE_Y);
    applyOrder(m, 0, { op: Op.Fire, x: 40000, y: LANE_Y });
    expect(w.globals[G.CannonWind]).toBe(CANNON.windup);
    let kaboom = false;
    for (let t = 0; t < CANNON.windup + 30 && !kaboom; t++) {
      step(m);
      kaboom = events(m, 'kaboom').length > 0;
    }
    expect(kaboom).toBe(true);
    expect(w.alive[3]).toBe(0);
    expect(w.hp[minion]).toBeLessThan(w.maxHp[minion]);
    expect(w.alive[minion]).toBe(1);
    expect(m.stats[0].kills).toBe(1);
  });

  it('the carrier is planted during the windup, and a stun in it fumbles the cannon to the ground', () => {
    const m = carrying(0);
    const w = m.world;
    applyOrder(m, 0, { op: Op.Fire, x: 50000, y: LANE_Y });
    expect(events(m, 'windup').at(-1)).toMatchObject({ src: 0, slot: 5, ticks: CANNON.windup });
    step(m);
    const x = w.x[0];
    applyOrder(m, 0, { op: Op.Move, x: 10000, y: LANE_Y });
    step(m);
    expect(w.x[0]).toBe(x);
    stun(w, 0, 30);
    step(m);
    expect(events(m, 'cannonDrop')).toMatchObject([{ id: 0, why: 'fumble' }]);
    expect(w.globals[G.CannonState]).toBe(CANNON_STATE.Ground);
    expect(w.globals[G.CannonFuse]).toBeGreaterThanOrEqual(CANNON.fuseFloor);
  });

  it('death drops it for 8 s; an enemy that walks over it steals it', () => {
    const m = carrying(0);
    const w = m.world;
    dealDamage(m, 3, 1, Kind.Hero, 0, 1, 'ability', { pure: true, execute: true });
    step(m);
    expect(events(m, 'cannonDrop')).toMatchObject([{ id: 0, why: 'death' }]);
    expect(w.globals[G.CannonDrop]).toBe(CANNON.dropTicks);
    place(m, 4, w.globals[G.CannonX], w.globals[G.CannonY], 0);
    step(m);
    expect(events(m, 'cannonPick')).toMatchObject([{ id: 4, team: 1, steal: true }]);
  });

  it("Clem's parry sends it back: the shooter's own hero is KABOOMed", () => {
    const m = carrying(3, ['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    const w = m.world;
    place(m, 3, 40000, LANE_Y, 2048);
    place(m, 0, 32000, LANE_Y, 0);
    place(m, 4, 44000, LANE_Y, 2048);
    tanky(m, 4);
    applyOrder(m, 3, { op: Op.Fire, x: 30000, y: LANE_Y });
    steps(m, CANNON.windup);
    w.kWT[0] = 60; // The Stand: the parry window opens as the kibble flies
    w.kWAge[0] = 0;
    const seen: string[] = [];
    for (let t = 0; t < 90; t++) {
      step(m);
      for (const e of m.events) if (e.type === 'cannonParry' || e.type === 'kaboom') seen.push(e.type === 'kaboom' ? `kaboom ${e.src}>${e.dst}` : 'parry');
    }
    expect(seen[0]).toBe('parry');
    expect(w.alive[0]).toBe(1);
    expect(seen).toContain('kaboom 0>3'); // the parrier gets the credit; the shooter stood first in the way back
  });

  it('a tower takes 12% of its max HP and stops it; a whiff is reported', () => {
    const m = carrying(3);
    const w = m.world;
    const t = towerId(0, 0); // Purrhaven Sunny outer
    place(m, 3, w.x[t] + 8000, w.y[t], 2048);
    putMinion(m, 1, w.x[t] + 2500, w.y[t] - 2500); // no backdoor halving
    applyOrder(m, 3, { op: Op.Fire, x: w.x[t], y: w.y[t] });
    let whiff = false;
    let dealt = 0;
    for (let i = 0; i < CANNON.windup + 40 && !whiff; i++) {
      step(m);
      whiff = events(m, 'cannonWhiff').length > 0;
      for (const e of m.events) if (e.type === 'hit' && e.src === 3 && e.dst === t) dealt += e.amount;
    }
    expect(whiff).toBe(true);
    expect(dealt).toBe(Math.trunc((w.maxHp[t] * CANNON.structureBp) / 10000));
  });

  it('a tie at the spawn alternates between the teams per spawn; otherwise the hero nearest the centre takes it', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    const w = m.world;
    hold(m, 0, 1, 2, 3, 4, 5);
    for (let id = 0; id < 6; id++) place(m, id, 20000 + id * 4000, LANE_Y - 6000, 0);
    const winners: number[] = [];
    for (let spawn = 0; spawn < 2; spawn++) {
      w.globals[G.CannonState] = CANNON_STATE.None;
      w.globals[G.CannonAt] = w.globals[G.Tick] + CANNON.warn + 2;
      while (events(m, 'cannonSoon').length === 0) step(m);
      const x = w.globals[G.CannonX];
      const y = w.globals[G.CannonY];
      // one hero of each team, mirrored about the spot: the same distance to its centre
      place(m, 0, x - 600, y, 0);
      place(m, 3, x + 600, y, 2048);
      while (events(m, 'cannonSpawn').length === 0) step(m);
      const pick = events(m, 'cannonPick');
      expect(pick, `spawn ${spawn}`).toHaveLength(1);
      winners.push((pick[0] as { team: number }).team);
      place(m, 0, 20000, LANE_Y - 6000, 0);
      place(m, 3, 32000, LANE_Y - 6000, 0);
    }
    expect(winners.sort()).toEqual([0, 1]);
    // not a tie: the nearer hero takes it, whatever its slot
    w.globals[G.CannonState] = CANNON_STATE.None;
    w.globals[G.CannonAt] = w.globals[G.Tick] + CANNON.warn + 2;
    while (events(m, 'cannonSoon').length === 0) step(m);
    place(m, 0, w.globals[G.CannonX] - 900, w.globals[G.CannonY], 0);
    place(m, 3, w.globals[G.CannonX] + 300, w.globals[G.CannonY], 2048);
    while (events(m, 'cannonSpawn').length === 0) step(m);
    expect(events(m, 'cannonPick')).toMatchObject([{ id: 3, team: 1 }]);
  });

  it("Brutus's Guard blocks the kibble: he lives, the Guard breaks, and a cannonBlock (not a whiff) is reported", () => {
    const m = carrying(3, ['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    const w = m.world;
    place(m, 3, 40000, LANE_Y, 2048);
    place(m, 2, 33000, LANE_Y, 0); // facing the shooter
    place(m, 0, 20000, LANE_Y - 6000, 0);
    applyOrder(m, 3, { op: Op.Fire, x: 30000, y: LANE_Y });
    steps(m, CANNON.windup - 1);
    w.kWT[2] = 90; // Front Guard up as the kibble flies
    w.kWAge[2] = 0;
    const seen: string[] = [];
    for (let t = 0; t < 60; t++) {
      step(m);
      for (const e of m.events) if (e.type === 'cannonBlock' || e.type === 'cannonWhiff' || e.type === 'kaboom') seen.push(e.type);
      if (seen.length) break;
    }
    expect(seen).toEqual(['cannonBlock']);
    expect(m.events.find((e) => e.type === 'cannonBlock')).toMatchObject({ id: 2, src: 3 });
    expect(w.alive[2]).toBe(1);
    expect(w.kWT[2]).toBe(0);
  });

  it('Fortified: before 3:00 a hero deals 65% to a tower; minions are not reduced', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    const w = m.world;
    const t = towerId(1, 0);
    putMinion(m, 0, w.x[t] - 2000, w.y[t]);
    const a = dealDamage(m, 0, 0, Kind.Hero, t, 1000, 'basic');
    w.globals[G.Tick] = TOWERS.fortifyUntil[0];
    const b = dealDamage(m, 0, 0, Kind.Hero, t, 1000, 'basic');
    expect(a).toBe(Math.trunc((b * TOWERS.fortifyBp) / 10000));
    step(m);
    expect(w.buffs[t] & Buff.Fortified).toBe(0);
    w.globals[G.Tick] = 300;
    step(m);
    expect(w.buffs[t] & Buff.Fortified).not.toBe(0);
  });
});

describe('Boing Beds (sim v21)', () => {
  it('a hero sent onto a bed is launched: a fixed flight nothing stops, then it stays at the landing; a cooldown', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    const w = m.world;
    for (let id = 1; id < 6; id++) place(m, id, 80000, 50000 + id * 1000, 0);
    hold(m, 0, 1, 2, 3, 4, 5);
    const [bx, by, lx, ly] = CROSSING_BEDS[0];
    place(m, 0, bx - 2500, by, 0);
    applyOrder(m, 0, { op: Op.Move, x: bx, y: by });
    let boing = false;
    for (let t = 0; t < 30 && !boing; t++) {
      step(m);
      boing = events(m, 'boing').length > 0;
    }
    expect(boing).toBe(true);
    expect(w.fmKind[0]).toBe(FM.Leap);
    expect(w.buffs[0] & Buff.Leaping).not.toBe(0);
    knockback(m, 0, w.x[0] + 1000, w.y[0], 3000, 0);
    stun(w, 0, 10);
    expect(w.fmKind[0]).toBe(FM.Leap);
    steps(m, BOING.flight);
    expect([w.x[0], w.y[0]]).toEqual([lx, ly]);
    expect(w.boingT[0]).toBeGreaterThan(0);
    expect([w.moveX[0], w.moveY[0]]).toEqual([lx, ly]); // it does not walk back to the bed
  });

  it('walking past a bed toward somewhere behind it does not launch', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    hold(m, 0, 1, 2, 3, 4, 5);
    const [bx, by] = CROSSING_BEDS[0];
    place(m, 0, bx + 500, by, 0);
    applyOrder(m, 0, { op: Op.Move, x: bx - 8000, y: by });
    for (let t = 0; t < 20; t++) {
      step(m);
      expect(events(m, 'boing')).toEqual([]);
    }
  });
});

describe('Mega Yarn Ball (sim v21)', () => {
  it('is kicked away from the kicker, bowls an enemy hero over (damage and knockback) and rests where it stops', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
    const w = m.world;
    for (let id = 1; id < 6; id++) place(m, id, 20000, 10000 + id * 2000, 0);
    hold(m, 0, 1, 2, 3, 4, 5);
    w.globals[G.Tick] = CROSSING_YARN.first;
    step(m);
    const [hx, hy] = CROSSING_YARN.homes[0];
    expect(w.globals[yarnAt(0, YF.State)]).toBe(YARN_STATE.Rest);
    place(m, 3, hx + 8000, hy, 2048);
    tanky(m, 3);
    place(m, 0, hx - 2500, hy, 0);
    applyOrder(m, 0, { op: Op.Move, x: hx + 3000, y: hy });
    let kicked = false;
    for (let t = 0; t < 30 && !kicked; t++) {
      step(m);
      kicked = events(m, 'yarnKick').length > 0;
    }
    expect(kicked).toBe(true);
    const hp = w.hp[3];
    const x3 = w.x[3];
    let rested = false;
    for (let t = 0; t < 90 && !rested; t++) {
      step(m);
      rested = w.globals[yarnAt(0, YF.State)] === YARN_STATE.Rest;
    }
    expect(rested).toBe(true);
    expect(w.hp[3]).toBeLessThan(hp);
    expect(w.x[3]).toBeGreaterThan(x3); // knocked on along the roll (+x)
    expect(w.globals[yarnAt(0, YF.X)]).toBeGreaterThan(hx);
    expect(w.globals[yarnAt(0, YF.T)]).toBeGreaterThan(0);
    expect(YARN.kicks).toBe(3);
  });
});

/** One player-bot match; the hash trail and the v21 events seen. */
function playOut(seed: number, map: MapId): { hash: number; trail: string; fun: number } {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce', map);
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal', map });
  const bot = createPlayerBotFor(m, 'normal', 0);
  let fun = 0;
  while (!result(m) && m.world.globals[G.Tick] < TIMELINE.siegeFrom * 2) {
    step(m, playerBotCommands(m, bot));
    for (const e of m.events) if (e.type === 'cannonFire' || e.type === 'boing' || e.type === 'yarnKick') fun++;
  }
  return { hash: hash(m), trail: (m as MatchHandle).trail.join(','), fun };
}

describe('determinism (sim v21)', () => {
  for (const map of ['crossing', 'hearthwood'] as const) {
    it(`${map}: two runs of the same seed match tick for tick, and the new mechanics are used`, () => {
      const a = playOut(21, map);
      const b = playOut(21, map);
      expect(a.hash).toBe(b.hash);
      expect(a.trail).toBe(b.trail);
      expect(a.fun).toBeGreaterThan(0);
    }, 600000);
  }
});
