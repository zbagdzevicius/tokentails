import { describe, expect, it } from 'vitest';
import { NO_INPUT, SUBTILE, type Input, type LevelDef, type SimState, type Vec2i } from '../../types';
import {
  CAT_HALF,
  CAT_TICKS_PER_TILE,
  CORNER_ASSIST,
  Sim,
  createSim,
  hashState,
  inCone,
  initSim,
  stepSim,
  type SimCat,
} from '../sim';
import { centerOf, tileOf } from '../grid';
import { validateLevel } from '../level';
import { decodeInputs, encodeInputs, replay } from '../replay';
import { activeHint, objectiveIndex } from '../hud';
import { nextRng } from '../rng';
import { HEIST_01_SOLUTION, getHeist01 } from '../../levels';
import { proveOneCatUnsolvable } from '../../../tools/solver';

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const IN = (p: Partial<Input>): Input => ({ ...NO_INPUT, ...p });
/** Ticks for one centre-to-centre tile move from rest. */
const T = CAT_TICKS_PER_TILE;

function mkLevel(tiles: string[], patch: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test',
    tiles,
    catSpawns: [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    guards: [],
    coins: [],
    key: null,
    doors: [],
    plates: [],
    crate: { id: 'crate', tile: { x: tiles[0].length - 2, y: tiles.length - 2 }, catId: 'bob', catName: 'Bob' },
    exit: { id: 'exit', tiles: [{ x: tiles[0].length - 3, y: tiles.length - 2 }] },
    checkpoints: [],
    meta: { title: 't', parTicks: 3000, meowRadiusTiles: 8, investigateTicks: 60 },
    ...patch,
  };
}

/** Copy of a state with one cat moved to a tile centre (tests only). */
function placeCat(s: SimState, i: 0 | 1, t: Vec2i): SimState {
  return placeCatAt(s, i, centerOf(t));
}

/** Copy of a state with one cat moved to an exact sub-tile position (tests only). */
function placeCatAt(s: SimState, i: 0 | 1, pos: Vec2i): SimState {
  const cats = [{ ...s.cats[0] }, { ...s.cats[1] }] as SimState['cats'];
  cats[i] = { ...cats[i], pos: { x: pos.x, y: pos.y } };
  return { ...s, cats };
}

function run(level: LevelDef, s: SimState, input: Input, n: number): SimState {
  for (let k = 0; k < n; k++) s = stepSim(level, s, input);
  return s;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

// Open room with a pillar at (6,3) and a sealed pocket at (12,1).
const ROOM = [
  '##############',
  '#.........##.#',
  '#.........####',
  '#.....#......#',
  '#............#',
  '#............#',
  '##############',
];

function sentryLevel(facing: Vec2i, at: Vec2i = { x: 2, y: 3 }, vision = 6): LevelDef {
  return mkLevel(ROOM, {
    catSpawns: [
      { x: 12, y: 1 },
      { x: 12, y: 1 },
    ],
    guards: [{ id: 'g', sprite: 'base', waypoints: [at], speed: 1, sniffTicks: 0, visionTiles: vision, facing }],
    checkpoints: [{ id: 'cp', tile: { x: 12, y: 1 } }],
  });
}

// ---------------------------------------------------------------------------------------------
// Determinism and replay
// ---------------------------------------------------------------------------------------------

describe('determinism', () => {
  it('same inputs give the same hash sequence (solution, twice)', () => {
    const level = getHeist01();
    const a = replay(level, HEIST_01_SOLUTION).hashes;
    const b = replay(level, HEIST_01_SOLUTION).hashes;
    expect(a.length).toBeGreaterThan(1000);
    expect(b).toEqual(a);
  });

  it('pseudo-random play is reproducible and hash() matches state.hash', () => {
    const level = getHeist01();
    const play = () => {
      let r = 12345;
      let s = Sim.init(level, 7, ['bob', 'oreo']);
      const hs: number[] = [];
      for (let t = 0; t < 3000; t++) {
        r = nextRng(r);
        const input: Input = {
          dx: (((r >>> 3) % 3) - 1) as Input['dx'],
          dy: (((r >>> 7) % 3) - 1) as Input['dy'],
          swap: (r & 0xff) < 4,
          interact: (r & 0xff00) < 0x0800,
          meow: (r & 0xff0000) < 0x030000,
        };
        s = Sim.step(s, input);
        expect(Sim.hash(s)).toBe(s.hash);
        hs.push(s.hash);
      }
      return hs;
    };
    expect(play()).toEqual(play());
  });

  it('step does not mutate its input state', () => {
    const level = getHeist01();
    const sim = createSim();
    const s0 = sim.init(level, 1, ['bob', 'oreo']);
    const h0 = hashState(s0);
    deepFreeze(s0);
    const s1 = sim.step(s0, IN({ dx: 1, meow: true, swap: true }));
    expect(hashState(s0)).toBe(h0);
    expect(s1.tick).toBe(1);
  });

  it('input logs round-trip through run-length encoding', () => {
    const inputs = decodeInputs(HEIST_01_SOLUTION.runs);
    expect(inputs.length).toBe(HEIST_01_SOLUTION.ticks);
    expect(encodeInputs(inputs)).toEqual(HEIST_01_SOLUTION.runs);
  });
});

describe('heist-01', () => {
  it('is a valid level with 3-4 warehouse guards and ~20 coins', () => {
    const level = getHeist01();
    expect(validateLevel(level)).toEqual([]);
    expect(level.guards.length).toBeGreaterThanOrEqual(4);
    expect(level.coins.length).toBeGreaterThanOrEqual(18);
    expect(level.meta.parTicks).toBeGreaterThanOrEqual(120 * 30);
    expect(level.meta.parTicks).toBeLessThanOrEqual(240 * 30);
  });

  it('replaying the planned solution wins with score > 0 and no spots', () => {
    const level = getHeist01();
    const { final } = replay(level, HEIST_01_SOLUTION);
    expect(final.won).toBe(true);
    expect(final.rescued).toBe(true);
    expect(final.spottedCount).toBe(0);
    expect(final.score).toBeGreaterThan(0);
    expect(final.hash).toBe(HEIST_01_SOLUTION.finalHash);
    expect(final.score).toBe(HEIST_01_SOLUTION.score);
    expect(final.score).toBe(final.coinsCollected * 10 + 50 - Math.floor(final.tick / 300));
    // The solution needs both cats.
    expect(HEIST_01_SOLUTION.runs.some((r) => r[2] & 1)).toBe(true);
  });

  it('the solution finishes under par and walks the objectives in order', () => {
    const level = getHeist01();
    expect(HEIST_01_SOLUTION.ticks).toBeLessThanOrEqual(level.meta.parTicks);
    let s = initSim(level, HEIST_01_SOLUTION.seed, HEIST_01_SOLUTION.catIds);
    expect(objectiveIndex(level, s)).toBe(0);
    expect(activeHint(level, s)).toMatch(/WASD/);
    let last = 0;
    for (const input of decodeInputs(HEIST_01_SOLUTION.runs)) {
      s = stepSim(level, s, input);
      const o = objectiveIndex(level, s);
      expect(o).toBeGreaterThanOrEqual(last);
      last = o;
    }
    expect(last).toBe(level.meta.objectives!.length - 1);
  });

  it('cannot be won with one cat (static proof)', () => {
    const proof = proveOneCatUnsolvable(getHeist01());
    expect(proof.unsolvable).toBe(true);
    for (const c of proof.cats) {
      expect(c.canReachCrate).toBe(false);
      expect(c.canReachExit).toBe(false);
      expect(c.blockingDoors).toContain('door-tutorial');
    }
  });

  it('a lone cat standing next to the tutorial door cannot open it', () => {
    const level = getHeist01();
    let s = initSim(level, 1, ['bob', 'oreo']);
    // Put cat 1 on the plate, then walk right along row 11 to the door: it closes behind it.
    s = placeCat(s, 0, { x: 1, y: 11 });
    s = run(level, s, NO_INPUT, 1);
    expect(s.doorsOpen[0]).toBe(true);
    s = run(level, s, IN({ dx: 1 }), T * 12);
    expect(tileOf(s.cats[0].pos)).toEqual({ x: 9, y: 11 });
    expect(s.doorsOpen[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Sentries
// ---------------------------------------------------------------------------------------------

describe('sentry guards (single waypoint + turn schedule)', () => {
  const tiles = ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#########'];
  const turns = [
    { facing: { x: 1, y: 0 }, ticks: 10 },
    { facing: { x: 0, y: 1 }, ticks: 5 },
    { facing: { x: -1, y: 0 }, ticks: 7 },
  ];
  const level = mkLevel(tiles, {
    catSpawns: [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    guards: [{ id: 's', sprite: 'base', waypoints: [{ x: 4, y: 3 }], speed: 1, sniffTicks: 0, visionTiles: 2, turns }],
  });

  it('validates the schedule', () => {
    expect(validateLevel(level)).toEqual([]);
    const bad = mkLevel(tiles, { guards: [{ ...level.guards[0], waypoints: [{ x: 4, y: 3 }, { x: 5, y: 3 }] }] });
    expect(validateLevel(bad).join()).toMatch(/exactly one waypoint/);
    const bad2 = mkLevel(tiles, { guards: [{ ...level.guards[0], turns: [{ facing: { x: 0, y: 0 }, ticks: 0 }] }] });
    expect(validateLevel(bad2).length).toBe(2);
  });

  it('turns on the global tick clock and never moves', () => {
    let s = initSim(level, 1, ['bob', 'oreo']);
    expect(s.guards[0].facing).toEqual({ x: 1, y: 0 });
    const seen: string[] = [];
    for (let t = 1; t <= 44; t++) {
      s = stepSim(level, s, NO_INPUT);
      expect(s.guards[0].pos).toEqual(centerOf({ x: 4, y: 3 }));
      const r = t % 22;
      const want = r < 10 ? { x: 1, y: 0 } : r < 15 ? { x: 0, y: 1 } : { x: -1, y: 0 };
      expect(s.guards[0].facing).toEqual(want);
      seen.push(`${s.guards[0].facing.x},${s.guards[0].facing.y}`);
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('is deterministic and a guard without turns keeps its hash behaviour', () => {
    const a = run(level, initSim(level, 3, ['bob', 'oreo']), NO_INPUT, 100);
    const b = run(level, initSim(level, 3, ['bob', 'oreo']), NO_INPUT, 100);
    expect(a.hash).toBe(b.hash);
  });
});

// ---------------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------------

describe('guard vision', () => {
  const east = { x: 1, y: 0 };

  it('inCone uses the integer 90-degree cone', () => {
    const g = { x: 0, y: 0 };
    expect(inCone(g, east, { x: 32, y: 0 }, 3)).toBe(true);
    expect(inCone(g, east, { x: 32, y: 32 }, 3)).toBe(true); // exactly 45 degrees
    expect(inCone(g, east, { x: 32, y: 33 }, 3)).toBe(false);
    expect(inCone(g, east, { x: -16, y: 0 }, 3)).toBe(false);
    expect(inCone(g, east, { x: 0, y: 16 }, 3)).toBe(false);
    expect(inCone(g, east, { x: 49, y: 0 }, 3)).toBe(false); // beyond radius
    expect(inCone(g, { x: 1, y: 1 }, { x: 32, y: 0 }, 3)).toBe(true); // diagonal facing
  });

  it('spots a cat in the cone and sends it to its checkpoint', () => {
    const level = sentryLevel(east);
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCat(s, 0, { x: 5, y: 3 });
    s = stepSim(level, s, NO_INPUT);
    expect(s.spottedCount).toBe(1);
    expect(s.events.some((e) => e.type === 'SPOTTED' && e.cat === 0 && e.id === 'g')).toBe(true);
    expect(tileOf(s.cats[0].pos)).toEqual({ x: 12, y: 1 });
    expect(s.cats[0].stunTicks).toBeGreaterThan(0);
    expect(s.guards[0].mode).toBe('ALERT');
  });

  it('does not see through walls', () => {
    const level = sentryLevel(east);
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCat(s, 0, { x: 8, y: 3 }); // pillar at (6,3) in between
    s = run(level, s, NO_INPUT, 5);
    expect(s.spottedCount).toBe(0);
    // Same distance without the pillar in the way: seen.
    s = placeCat(s, 0, { x: 7, y: 4 });
    s = stepSim(level, s, NO_INPUT);
    expect(s.spottedCount).toBe(1);
  });

  it('does not see behind or outside the half-angle', () => {
    const level = sentryLevel(east, { x: 4, y: 4 });
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCat(s, 0, { x: 2, y: 4 }); // behind
    s = placeCat(s, 1, { x: 5, y: 2 }); // ahead but 63 degrees off-axis
    s = run(level, s, NO_INPUT, 10);
    expect(s.spottedCount).toBe(0);
  });

  it('touching a guard spots the cat even from behind', () => {
    const level = sentryLevel(east, { x: 4, y: 4 });
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCat(s, 0, { x: 3, y: 4 });
    s = run(level, s, IN({ dx: 1 }), 4);
    expect(s.spottedCount).toBe(1);
  });

  it('patrols its waypoint loop and sniffs at waypoints', () => {
    const level = mkLevel(ROOM, {
      catSpawns: [
        { x: 12, y: 1 },
        { x: 12, y: 1 },
      ],
      guards: [
        {
          id: 'g',
          sprite: 'base',
          waypoints: [
            { x: 1, y: 5 },
            { x: 5, y: 5 },
          ],
          speed: 2,
          sniffTicks: 20,
          visionTiles: 3,
        },
      ],
    });
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, NO_INPUT, 4 * 8);
    expect(tileOf(s.guards[0].pos)).toEqual({ x: 5, y: 5 });
    s = run(level, s, NO_INPUT, 2);
    expect(s.guards[0].mode).toBe('SNIFF');
    s = run(level, s, NO_INPUT, 30);
    expect(s.guards[0].mode).toBe('PATROL');
    expect(s.guards[0].facing).toEqual({ x: -1, y: 0 });
  });
});

describe('meow lure', () => {
  it('guards in range with line of sight investigate the meow tile, then return to patrol', () => {
    // Guard faces west at (6,5) and sees 3 tiles; the cat meows behind it at (10,5), out of sight
    // range (a guard that turns towards a meow it can see spots the cat).
    const level = sentryLevel({ x: -1, y: 0 }, { x: 6, y: 5 }, 3);
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCat(s, 0, { x: 10, y: 5 });
    s = stepSim(level, s, IN({ meow: true }));
    expect(s.spottedCount).toBe(0);
    expect(s.events.some((e) => e.type === 'MEOW')).toBe(true);
    expect(s.events.some((e) => e.type === 'INVESTIGATE' && e.id === 'g')).toBe(true);
    expect(s.guards[0].mode).toBe('INVESTIGATE');
    expect(s.guards[0].target).toEqual({ x: 10, y: 5 });
    // Hide the cat in the sealed pocket, let the guard walk over.
    s = placeCat(s, 0, { x: 12, y: 1 });
    s = run(level, s, NO_INPUT, 4 * 16 + 1);
    expect(tileOf(s.guards[0].pos)).toEqual({ x: 10, y: 5 });
    expect(s.guards[0].mode).toBe('INVESTIGATE');
    s = run(level, s, NO_INPUT, level.meta.investigateTicks + 1);
    expect(s.guards[0].mode).toBe('PATROL');
    s = run(level, s, NO_INPUT, 4 * 16 + 2);
    expect(tileOf(s.guards[0].pos)).toEqual({ x: 6, y: 5 });
    expect(s.guards[0].facing).toEqual({ x: -1, y: 0 });
    expect(s.spottedCount).toBe(0);
  });

  it('is not heard through walls or beyond the radius', () => {
    const level = sentryLevel({ x: -1, y: 0 }, { x: 6, y: 5 });
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCat(s, 0, { x: 12, y: 1 }); // sealed pocket: no line of sight
    s = stepSim(level, s, IN({ meow: true }));
    expect(s.events.some((e) => e.type === 'MEOW')).toBe(true);
    expect(s.guards[0].mode).toBe('PATROL');
    const far = { ...level, meta: { ...level.meta, meowRadiusTiles: 3 } };
    let t = initSim(far, 1, ['bob', 'oreo']);
    t = placeCat(t, 0, { x: 10, y: 5 });
    t = stepSim(far, t, IN({ meow: true }));
    expect(t.guards[0].mode).toBe('PATROL');
  });
});

// ---------------------------------------------------------------------------------------------
// Plates, doors, checkpoints, swap
// ---------------------------------------------------------------------------------------------

describe('plates and doors', () => {
  const tiles = ['##########', '#....#...#', '#........#', '#....#...#', '##########'];
  const level = mkLevel(tiles, {
    catSpawns: [
      { x: 1, y: 2 },
      { x: 3, y: 2 },
    ],
    doors: [{ id: 'D', tile: { x: 5, y: 2 }, kind: 'PLATE', axis: 'v' }],
    plates: [{ id: 'P', tile: { x: 2, y: 2 }, doors: ['D'] }],
    crate: { id: 'crate', tile: { x: 8, y: 3 }, catId: 'bob', catName: 'Bob' },
    exit: { id: 'exit', tiles: [{ x: 8, y: 1 }] },
  });

  it('holds the door open only while a cat stands on the plate', () => {
    expect(validateLevel(level)).toEqual([]);
    let s = initSim(level, 1, ['bob', 'oreo']);
    expect(s.doorsOpen[0]).toBe(false);
    // Cat 2 cannot walk through the closed door.
    s = stepSim(level, s, IN({ swap: true }));
    s = run(level, s, IN({ dx: 1 }), 40);
    expect(tileOf(s.cats[1].pos)).toEqual({ x: 4, y: 2 });
    // Blocked flush against the door: hitbox edge touches the door tile boundary.
    expect(s.cats[1].pos.x).toBe(5 * SUBTILE - CAT_HALF - 1);
    // Cat 1 steps on the plate.
    s = stepSim(level, s, IN({ swap: true }));
    s = run(level, s, IN({ dx: 1 }), T);
    expect(s.cats[0].pos).toEqual(centerOf({ x: 2, y: 2 }));
    expect(s.platesDown[0]).toBe(true);
    expect(s.doorsOpen[0]).toBe(true);
    // Cat 2 walks through while the plate is held.
    s = stepSim(level, s, IN({ swap: true }));
    s = run(level, s, IN({ dx: 1 }), 8);
    expect(tileOf(s.cats[1].pos)).toEqual({ x: 5, y: 2 });
    // Door never closes on an occupant.
    s = stepSim(level, s, IN({ swap: true }));
    s = run(level, s, IN({ dx: -1 }), T);
    expect(s.platesDown[0]).toBe(false);
    expect(s.doorsOpen[0]).toBe(true);
    // Once cat 2's hitbox leaves the doorway it closes.
    s = stepSim(level, s, IN({ swap: true }));
    let closed = false;
    for (let k = 0; k < T; k++) {
      s = stepSim(level, s, IN({ dx: 1 }));
      if (s.events.some((e) => e.type === 'DOOR' && e.id === 'D' && e.open === false)) closed = true;
    }
    expect(tileOf(s.cats[1].pos)).toEqual({ x: 6, y: 2 });
    expect(s.doorsOpen[0]).toBe(false);
    expect(closed).toBe(true);
    // And cat 2 is locked out.
    s = run(level, s, IN({ dx: -1 }), 16);
    expect(tileOf(s.cats[1].pos)).toEqual({ x: 6, y: 2 });
  });

  it('rejects plates next to their door (would let one cat pass alone)', () => {
    const bad = { ...level, plates: [{ id: 'P', tile: { x: 4, y: 1 }, doors: ['D'] }] };
    expect(validateLevel(bad).some((p) => p.includes('at least 2 tiles'))).toBe(true);
  });
});

describe('checkpoints, key, vault, rescue and win', () => {
  const tiles = ['############', '#..........#', '#......#...#', '#......#...#', '#..........#', '############'];
  const level = mkLevel(tiles, {
    catSpawns: [
      { x: 1, y: 1 },
      { x: 1, y: 4 },
    ],
    key: { id: 'k', tile: { x: 3, y: 1 } },
    coins: [{ id: 'c1', tile: { x: 2, y: 1 } }],
    doors: [{ id: 'V', tile: { x: 7, y: 1 }, kind: 'VAULT' }],
    crate: { id: 'crate', tile: { x: 9, y: 2 }, catId: 'bob', catName: 'Mochi' },
    exit: {
      id: 'exit',
      tiles: [
        { x: 10, y: 3 },
        { x: 10, y: 4 },
      ],
    },
    checkpoints: [{ id: 'cp', tile: { x: 5, y: 1 } }],
    guards: [
      { id: 'g', sprite: 'base', waypoints: [{ x: 5, y: 4 }], speed: 1, sniffTicks: 0, visionTiles: 2, facing: { x: 0, y: -1 } },
    ],
  });

  it('moves the respawn point and resets a spotted cat to it', () => {
    expect(validateLevel(level)).toEqual([]);
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, IN({ dx: 1 }), T * 4);
    expect(s.cats[0].pos).toEqual(centerOf({ x: 5, y: 1 }));
    expect(s.cats[0].checkpoint).toEqual({ x: 5, y: 1 });
    expect(s.coinsCollected).toBe(1);
    expect(s.hasKey).toBe(true);
    // Walk into the guard's view (it looks north from (5,4), 2 tiles).
    s = run(level, s, IN({ dy: 1 }), 8);
    expect(s.spottedCount).toBe(1);
    expect(tileOf(s.cats[0].pos)).toEqual({ x: 5, y: 1 });
    expect(s.cats[0].pose).toBe('HIT');
    // Input is ignored while stunned.
    const stunned = s.cats[0].stunTicks;
    s = stepSim(level, s, IN({ dx: 1 }));
    expect(tileOf(s.cats[0].pos)).toEqual({ x: 5, y: 1 });
    expect(s.cats[0].stunTicks).toBe(stunned - 1);
  });

  it('opens the vault with the key, rescues from next to the crate, wins with both cats on the exit', () => {
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, IN({ dx: 1 }), T * 5); // to (6,1), next to the vault door
    expect(s.cats[0].pos).toEqual(centerOf({ x: 6, y: 1 }));
    s = stepSim(level, s, IN({ interact: true }));
    expect(s.doorsOpen[0]).toBe(true);
    expect(s.hasKey).toBe(false);
    s = run(level, s, IN({ dx: 1 }), T * 2); // (8,1)
    s = run(level, s, IN({ dx: 1 }), T); // (9,1), above the crate
    expect(s.score).toBe(10);
    s = stepSim(level, s, IN({ interact: true }));
    expect(s.rescued).toBe(true);
    expect(s.events.some((e) => e.type === 'RESCUE')).toBe(true);
    s = run(level, s, IN({ dx: 1 }), T); // (10,1)
    s = run(level, s, IN({ dy: 1 }), T * 2); // (10,3) exit
    expect(s.won).toBe(false); // partner not there yet
    s = stepSim(level, s, IN({ swap: true }));
    expect(s.activeIndex).toBe(1);
    s = placeCat(s, 1, { x: 10, y: 4 });
    s = stepSim(level, s, NO_INPUT);
    expect(s.won).toBe(true);
    expect(s.events.some((e) => e.type === 'WIN')).toBe(true);
    const frozen = stepSim(level, s, IN({ dx: -1 }));
    expect(frozen.tick).toBe(s.tick);
    expect(frozen.won).toBe(true);
  });

  it('score formula: coins*10 + rescue 50 - 1 per 10 s, floored at 0', () => {
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, IN({ dy: 1 }), 8); // (1,2), idle cat moves nowhere
    expect(s.score).toBe(0);
    s = placeCat(s, 0, { x: 2, y: 1 });
    s = stepSim(level, s, NO_INPUT);
    expect(s.score).toBe(10);
    s = run(level, s, NO_INPUT, 300 * 3);
    expect(s.score).toBe(7);
    expect(SUBTILE).toBe(16);
  });
});

describe('interact from anywhere near', () => {
  const tiles = ['#########', '#.......#', '#.......#', '#.......#', '#########'];
  const lv = () => mkLevel(tiles, { crate: { id: 'crate', tile: { x: 4, y: 2 }, catId: 'bob', catName: 'Bob' }, catSpawns: [{ x: 3, y: 1 }, { x: 1, y: 3 }] });

  it('rescues on the very tick interact is pressed, mid-move and off-centre', () => {
    const level = lv();
    let s = initSim(level, 1, ['bob', 'oreo']);
    // Walk east from (3,1); stop off-centre and press interact while still moving.
    s = run(level, s, IN({ dx: 1 }), 2);
    expect(s.cats[0].pos.x).not.toBe(centerOf({ x: 3, y: 1 }).x);
    s = stepSim(level, s, IN({ dx: 1, interact: true }));
    expect(s.rescued).toBe(true);
    expect(s.pendingInteract).toBe(false);
    expect(s.events.some((e) => e.type === 'RESCUE')).toBe(true);
  });

  it('works diagonally (Chebyshev 1) and not from 2 tiles away, with no lingering press', () => {
    const level = lv();
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCatAt(s, 0, { x: 1 * SUBTILE + 13, y: 1 * SUBTILE + 3 }); // tile (1,1): 3 tiles from the crate
    s = stepSim(level, s, IN({ interact: true }));
    expect(s.rescued).toBe(false);
    s = run(level, s, NO_INPUT, 10);
    expect(s.rescued).toBe(false);
    s = placeCatAt(s, 0, { x: 5 * SUBTILE + 12, y: 3 * SUBTILE + 4 }); // tile (5,3): diagonal to (4,2)
    s = stepSim(level, s, IN({ interact: true }));
    expect(s.rescued).toBe(true);
  });

  it('swap is instant too: the new cat takes input on the same tick', () => {
    const level = lv();
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, IN({ dx: 1 }), 2);
    const p0 = s.cats[0].pos;
    const p1 = s.cats[1].pos;
    s = stepSim(level, s, IN({ swap: true, dy: -1 }));
    expect(s.activeIndex).toBe(1);
    expect(s.cats[0].pos).toEqual(p0);
    expect(s.cats[1].pos.y).toBeLessThan(p1.y);
  });
});

// ---------------------------------------------------------------------------------------------
// Continuous movement
// ---------------------------------------------------------------------------------------------

describe('continuous cat movement', () => {
  const OPEN = ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'];
  const open = () => mkLevel(OPEN, { catSpawns: [{ x: 4, y: 3 }, { x: 1, y: 5 }] });

  it('moves 5 tiles/s exactly and starts on the first tick', () => {
    const level = open();
    let s = initSim(level, 1, ['bob', 'oreo']);
    const x0 = s.cats[0].pos.x;
    s = stepSim(level, s, IN({ dx: 1 }));
    expect(s.cats[0].pos.x).toBe(x0 + 2);
    expect(s.cats[0].moving).toBe(true);
    expect(s.cats[0].vel).toEqual({ x: 2, y: 0 });
    s = run(level, initSim(level, 1, ['bob', 'oreo']), IN({ dx: 1 }), T);
    expect(s.cats[0].pos).toEqual(centerOf({ x: 5, y: 3 }));
    expect((s.cats[0] as SimCat).moveAcc).toBe(0);
    s = run(level, initSim(level, 1, ['bob', 'oreo']), IN({ dy: -1 }), 3);
    expect(s.cats[0].pos.y).toBe(centerOf({ x: 4, y: 3 }).y - 8);
    // Half a second (15 ticks) is exactly 40 units = 2.5 tiles.
    let t = placeCat(initSim(level, 1, ['bob', 'oreo']), 0, { x: 7, y: 1 });
    t = run(level, t, IN({ dx: -1 }), 15);
    expect(t.cats[0].pos.x).toBe(centerOf({ x: 7, y: 1 }).x - 40);
  });

  it('stops instantly on release: no drift, accumulator and velocity reset', () => {
    const level = open();
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, IN({ dx: 1 }), 4);
    const p = s.cats[0].pos;
    expect(p.x % SUBTILE).not.toBe(8);
    s = stepSim(level, s, NO_INPUT);
    expect(s.cats[0].pos).toEqual(p);
    expect(s.cats[0].moving).toBe(false);
    expect(s.cats[0].vel).toEqual({ x: 0, y: 0 });
    expect((s.cats[0] as SimCat).moveAcc).toBe(0);
    s = run(level, s, NO_INPUT, 20);
    expect(s.cats[0].pos).toEqual(p);
  });

  it('turns instantly, even between tile centres', () => {
    const level = open();
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = run(level, s, IN({ dx: 1 }), 2);
    const p = s.cats[0].pos;
    s = stepSim(level, s, IN({ dy: 1 }));
    expect(s.cats[0].pos.x).toBe(p.x);
    expect(s.cats[0].pos.y).toBeGreaterThan(p.y);
    expect(s.cats[0].facing).toEqual({ x: 0, y: 1 });
    s = stepSim(level, s, IN({ dx: -1 }));
    expect(s.cats[0].pos.x).toBeLessThan(p.x);
    expect(s.cats[0].faceX).toBe(-1);
  });

  it('diagonals are not faster than cardinal moves', () => {
    const level = open();
    const start = placeCat(initSim(level, 1, ['bob', 'oreo']), 0, { x: 1, y: 1 });
    const card = run(level, start, IN({ dx: 1 }), 24);
    const diag = run(level, start, IN({ dx: 1, dy: 1 }), 24);
    const c0 = centerOf({ x: 1, y: 1 });
    const cd = card.cats[0].pos.x - c0.x;
    const ddx = diag.cats[0].pos.x - c0.x;
    const ddy = diag.cats[0].pos.y - c0.y;
    expect(ddx).toBe(ddy);
    expect(cd).toBe(64);
    expect(ddx * ddx + ddy * ddy).toBeLessThanOrEqual(cd * cd);
    expect(ddx * ddx + ddy * ddy).toBeGreaterThan((cd - 3) * (cd - 3));
  });

  it('slides along a wall at full speed when a diagonal is half blocked', () => {
    const level = open();
    let s = placeCat(initSim(level, 1, ['bob', 'oreo']), 0, { x: 2, y: 1 });
    const y0 = SUBTILE + CAT_HALF; // flush against the top wall
    s = placeCatAt(s, 0, { x: s.cats[0].pos.x, y: y0 });
    const x0 = s.cats[0].pos.x;
    s = run(level, s, IN({ dx: 1, dy: -1 }), 12);
    expect(s.cats[0].pos.y).toBe(y0);
    expect(s.cats[0].pos.x).toBe(x0 + 32);
    // Pushing straight into a wall does not move at all.
    const p = s.cats[0].pos;
    s = stepSim(level, s, IN({ dy: -1 }));
    expect(s.cats[0].pos).toEqual(p);
    expect(s.cats[0].moving).toBe(false);
  });

  it('never overlaps a blocking tile (random walk)', async () => {
    const { catBoxFree } = await import('../sim');
    const { compileLevel } = await import('../grid');
    const level = getHeist01();
    const c = compileLevel(level);
    let r = 99;
    let s = initSim(level, 3, ['bob', 'oreo']);
    for (let t = 0; t < 4000; t++) {
      r = nextRng(r);
      s = stepSim(level, s, IN({ dx: (((r >>> 5) % 3) - 1) as Input['dx'], dy: (((r >>> 9) % 3) - 1) as Input['dy'], swap: (r & 0xff) < 3 }));
      for (const cat of s.cats) expect(catBoxFree(c, s.doorsOpen, cat.pos.x, cat.pos.y)).toBe(true);
      for (const cat of s.cats) {
        const t0 = tileOf(cat.pos);
        expect(c.terrain[t0.y * c.w + t0.x]).toBe(0);
      }
    }
  });

  describe('corner assist', () => {
    // A one-tile doorway at (4,2) in a wall between two rooms.
    const DOOR = ['#########', '#.......#', '####.####', '#.......#', '#########'];
    const lv = () => mkLevel(DOOR, { catSpawns: [{ x: 3, y: 1 }, { x: 1, y: 3 }] });

    it('nudges a misaligned cat into the doorway', () => {
      const level = lv();
      // Centre x = 64: the tile boundary, 8 units left of the doorway centre (72); flush with the wall.
      let s = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: 64, y: 2 * SUBTILE - CAT_HALF - 1 });
      s = stepSim(level, s, IN({ dy: 1 }));
      expect(s.cats[0].pos.x).toBeGreaterThan(64);
      s = run(level, s, IN({ dy: 1 }), 20);
      expect(tileOf(s.cats[0].pos)).toEqual({ x: 4, y: 3 });
    });

    it('from the other side too, and not when the opening is too far away', () => {
      const level = lv();
      let s = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: 80, y: 24 });
      s = run(level, s, IN({ dy: 1 }), 20);
      expect(tileOf(s.cats[0].pos)).toEqual({ x: 4, y: 3 });
      const far = 69 - CORNER_ASSIST - 1; // needs a 7-unit nudge
      let t = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: far, y: 24 });
      t = run(level, t, IN({ dy: 1 }), 20);
      expect(t.cats[0].pos.x).toBe(far);
      expect(tileOf(t.cats[0].pos).y).toBe(1);
    });

    it('a diagonal press on the doorway column goes through it (doorway magnet, SIM_VERSION 4)', () => {
      // Two-tile-deep room above a wall with a gap at (4,3).
      const level = mkLevel(['#########', '#.......#', '#.......#', '####.####', '#.......#', '#########'], { catSpawns: [{ x: 3, y: 1 }, { x: 1, y: 4 }] });
      // Every start on the doorway's column, either diagonal that leans into the wall: the cat used to
      // slide along the wall past the gap from its centre.
      for (const x of [65, 68, 72, 76, 79]) {
        for (const dx of [-1, 1] as const) {
          let s = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x, y: 40 });
          s = run(level, s, IN({ dx, dy: 1 }), 24);
          expect(tileOf(s.cats[0].pos).y, `x ${x} dx ${dx}`).toBe(4);
        }
      }
      // Off the doorway column the diagonal still slides along the wall (away from the gap here).
      let s = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: 56, y: 40 });
      s = run(level, s, IN({ dx: -1, dy: 1 }), 12);
      expect(tileOf(s.cats[0].pos).y).toBe(2);
    });

    it('sliding along a 1-tile corridor, a diagonal takes the side gap it passes', () => {
      const level = lv();
      // Flush with the bottom wall of the corridor (row 1), east of the gap, pressing south-west.
      let s = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: 110, y: 2 * SUBTILE - CAT_HALF - 1 });
      s = run(level, s, IN({ dx: -1, dy: 1 }), 40);
      expect(tileOf(s.cats[0].pos).y).toBe(3);
    });
  });

  describe('respawn grace (SIM_VERSION 4)', () => {
    // A sentry at (5,3) looking west along row 3; the checkpoint (2,3) is in its cone.
    const tiles = ['#########', '#.......#', '#.......#', '#.......#', '#########'];
    const level = mkLevel(tiles, {
      catSpawns: [{ x: 2, y: 3 }, { x: 1, y: 1 }],
      guards: [{ id: 'g', sprite: 'base', waypoints: [{ x: 5, y: 3 }], speed: 1, sniffTicks: 0, visionTiles: 4, facing: { x: -1, y: 0 } }],
    });

    it('a respawned cat is hidden while it stays by its checkpoint, and the grace ends when it leaves', async () => {
      const { GRACE_TICKS, STUN_TICKS } = await import('../sim');
      let s = initSim(level, 1, ['bob', 'oreo']);
      s = stepSim(level, s, NO_INPUT);
      expect(s.spottedCount).toBe(1);
      s = run(level, s, NO_INPUT, STUN_TICKS);
      expect(s.cats[0].stunTicks).toBe(0);
      expect(s.cats[0].graceTicks).toBeGreaterThan(0);
      s = run(level, s, NO_INPUT, GRACE_TICKS - 2);
      expect(s.spottedCount).toBe(1);
      // Grace over: seen again where it stands.
      s = run(level, s, NO_INPUT, 3);
      expect(s.spottedCount).toBe(2);
      // Leaving the checkpoint area ends the grace at once.
      s = run(level, s, NO_INPUT, STUN_TICKS);
      s = run(level, s, IN({ dx: 1 }), T * 2);
      expect(s.spottedCount).toBe(3);
    });
  });

  it('a cat counts as at the exit within EXIT_SLOP of an exit tile', async () => {
    const { catAtExit, EXIT_SLOP } = await import('../sim');
    const level = mkLevel(['#####', '#...#', '#####'], { exit: { id: 'e', tiles: [{ x: 2, y: 1 }] } });
    expect(catAtExit(level, { x: 2 * SUBTILE - EXIT_SLOP, y: 24 })).toBe(true);
    expect(catAtExit(level, { x: 2 * SUBTILE - EXIT_SLOP - 1, y: 24 })).toBe(false);
    expect(catAtExit(level, { x: 3 * SUBTILE + EXIT_SLOP - 1, y: 24 })).toBe(true);
  });

  it('vault opens when pushed into with the key', () => {
    const tiles = ['#######', '#.....#', '#######'];
    const level = mkLevel(tiles, {
      catSpawns: [{ x: 1, y: 1 }, { x: 1, y: 1 }],
      key: { id: 'k', tile: { x: 2, y: 1 } },
      doors: [{ id: 'V', tile: { x: 4, y: 1 }, kind: 'VAULT' }],
      crate: { id: 'crate', tile: { x: 5, y: 1 }, catId: 'bob', catName: 'Bob' },
      exit: { id: 'exit', tiles: [{ x: 3, y: 1 }] },
    });
    let s = initSim(level, 1, ['bob', 'oreo']);
    let opened = -1;
    for (let k = 0; k < T * 3; k++) {
      s = stepSim(level, s, IN({ dx: 1 }));
      if (s.events.some((e) => e.type === 'DOOR' && e.id === 'V' && e.open)) opened = k;
    }
    expect(opened).toBeGreaterThan(0);
    expect(s.keyTaken).toBe(true);
    expect(s.hasKey).toBe(false);
    expect(s.doorsOpen[0]).toBe(true);
    // Without the key, pushing does nothing.
    let t = placeCat(initSim(level, 1, ['bob', 'oreo']), 0, { x: 3, y: 1 });
    t = run(level, t, IN({ dx: 1 }), T * 2);
    expect(t.doorsOpen[0]).toBe(false);
  });

  it('plates stay pressed while the cat centre is on the plate tile, off-centre included', () => {
    const tiles = ['##########', '#....#...#', '#........#', '#....#...#', '##########'];
    const level = mkLevel(tiles, {
      catSpawns: [{ x: 1, y: 2 }, { x: 1, y: 1 }],
      doors: [{ id: 'D', tile: { x: 5, y: 2 }, kind: 'PLATE', axis: 'v' }],
      plates: [{ id: 'P', tile: { x: 2, y: 2 }, doors: ['D'] }],
      crate: { id: 'crate', tile: { x: 8, y: 3 }, catId: 'bob', catName: 'Bob' },
      exit: { id: 'exit', tiles: [{ x: 8, y: 1 }] },
    });
    let s = initSim(level, 1, ['bob', 'oreo']);
    s = placeCatAt(s, 0, { x: 2 * SUBTILE + 1, y: 2 * SUBTILE + 14 });
    s = stepSim(level, s, IN({ dx: 1 }));
    expect(s.platesDown[0]).toBe(true);
    s = placeCatAt(s, 0, { x: 2 * SUBTILE - 1, y: 2 * SUBTILE + 14 });
    s = stepSim(level, s, IN({ dy: -1 }));
    expect(s.platesDown[0]).toBe(false);
  });

  it('a cat let go just off a plate walks onto its centre (plate snap, SIM_VERSION 4)', async () => {
    const { PLATE_SNAP } = await import('../sim');
    const tiles = ['##########', '#....#...#', '#........#', '#....#...#', '##########'];
    const level = mkLevel(tiles, {
      catSpawns: [{ x: 1, y: 2 }, { x: 1, y: 1 }],
      doors: [{ id: 'D', tile: { x: 5, y: 2 }, kind: 'PLATE', axis: 'v' }],
      plates: [{ id: 'P', tile: { x: 2, y: 2 }, doors: ['D'] }],
      crate: { id: 'crate', tile: { x: 8, y: 3 }, catId: 'bob', catName: 'Bob' },
      exit: { id: 'exit', tiles: [{ x: 8, y: 1 }] },
    });
    let s = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: 2 * SUBTILE - PLATE_SNAP, y: 2 * SUBTILE + 3 });
    s = run(level, s, NO_INPUT, 12);
    expect(s.cats[0].pos).toEqual(centerOf({ x: 2, y: 2 }));
    expect(s.platesDown[0]).toBe(true);
    // Further off: it stays put.
    let t = placeCatAt(initSim(level, 1, ['bob', 'oreo']), 0, { x: 2 * SUBTILE - PLATE_SNAP - 1, y: 40 });
    t = run(level, t, NO_INPUT, 12);
    expect(t.cats[0].pos).toEqual({ x: 2 * SUBTILE - PLATE_SNAP - 1, y: 40 });
  });
});

describe('line of sight corner cracks', () => {
  it('guards cannot see through two walls touching at a corner', async () => {
    const { compileLevel, lineOfSight } = await import('../grid');
    const level = mkLevel(['#########', '#.#.....#', '##......#', '#.......#', '#.......#', '#########']);
    const c = compileLevel(level);
    expect(lineOfSight(c, { x: 1, y: 1 }, { x: 3, y: 3 }, [])).toBe(false);
    // One of the two corner tiles open: the diagonal is clear.
    expect(lineOfSight(c, { x: 3, y: 1 }, { x: 5, y: 3 }, [])).toBe(true);
  });
});
