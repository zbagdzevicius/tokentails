import { describe, expect, it } from 'vitest';
import { NO_INPUT, type LevelDef, type SimState } from '../../types';
import { LEVEL_IDS, getLevel } from '../../levels';
import { centerOf, compileLevel, lineOfSight, tileOf } from '../grid';
import { contextPrompt, hudHint } from '../hud';
import { guardSeesPoint, initSim, sentryFacing, stepSim } from '../sim';
import { TELEGRAPH_TICKS, nextSentryTurn, onSentryDuty, partnerCatchAhead, partnerDanger, sentryReturnTurn, sentryWarnings } from '../telegraph';
import { decodeInputs } from '../replay';
import { getSolution } from '../../levels';
import { activeHint } from '../hud';

const CATS: [string, string] = ['bob', 'oreo'];

/** Steps with no input; the cats are parked out of play (stunned) so nothing disturbs the guards. */
function guardsOnly(level: LevelDef, ticks: number, each: (s: SimState) => void): void {
  let s = initSim(level, 1, CATS);
  s = { ...s, cats: s.cats.map((c) => ({ ...c, stunTicks: 1e9 })) as SimState['cats'] };
  for (let t = 0; t < ticks; t++) {
    s = stepSim(level, s, NO_INPUT);
    each(s);
  }
}

describe('sentry turn telegraph', () => {
  it('predicts every scheduled turn exactly (ticks left and new facing) on every level', () => {
    for (const id of LEVEL_IDS) {
      const level = getLevel(id);
      level.guards.forEach((def) => {
        if (!def.turns) return;
        for (let tick = 0; tick < 1200; tick++) {
          const turn = nextSentryTurn(def, tick)!;
          expect(turn).not.toBeNull();
          const now = sentryFacing(def, tick)!;
          // Same facing until the turn, the announced facing on the turn tick.
          for (let k = 1; k < turn.ticksLeft; k++) expect(sentryFacing(def, tick + k)).toEqual(now);
          expect(sentryFacing(def, tick + turn.ticksLeft)).toEqual(turn.next);
          expect(turn.next).not.toEqual(now);
        }
      });
    }
    // Exhaustive (every level, 1200 ticks, hundreds of thousands of expects): about 2 s alone, so
    // the 5 s default times out on a loaded machine or CI runner. A budget, not a skip (task 7b).
  }, 30_000);

  it('warns TELEGRAPH_TICKS before the sim turns a sentry, and the sim then faces the announced way', () => {
    const level = getLevel('heist-05');
    const pending = new Map<number, { at: number; fx: number; fy: number }>();
    let warnings = 0;
    let turns = 0;
    let prev: SimState | null = null;
    guardsOnly(level, 900, (s) => {
      for (const w of sentryWarnings(level, s)) {
        expect(w.ticksLeft).toBeLessThanOrEqual(TELEGRAPH_TICKS);
        expect(w.progress).toBeGreaterThan(0);
        expect(w.progress).toBeLessThanOrEqual(1);
        if (w.ticksLeft === TELEGRAPH_TICKS) warnings++;
        pending.set(w.guard, { at: s.tick + w.ticksLeft, fx: w.next.x, fy: w.next.y });
      }
      if (prev) {
        s.guards.forEach((g, gi) => {
          const p = prev!.guards[gi];
          if (!onSentryDuty(level.guards[gi], g) || (p.facing.x === g.facing.x && p.facing.y === g.facing.y)) return;
          const w = pending.get(gi);
          expect(w, `${g.id} turned at ${s.tick} without a warning`).toBeDefined();
          expect([w!.at, w!.fx, w!.fy]).toEqual([s.tick, g.facing.x, g.facing.y]);
          turns++;
        });
      }
      prev = s;
    });
    expect(turns).toBeGreaterThan(20);
    expect(warnings).toBeGreaterThanOrEqual(turns);
  });

  it('shows nothing for patrols, and nothing for a sentry that left its post', () => {
    const level = getLevel('heist-01');
    guardsOnly(level, 300, (s) => expect(sentryWarnings(level, s)).toEqual([]));
    const l5 = getLevel('heist-05');
    const s = initSim(l5, 1, CATS);
    const g = { ...s.guards[0], mode: 'INVESTIGATE' as const };
    expect(onSentryDuty(l5.guards[0], g)).toBe(false);
  });
});

describe('checkpoints', () => {
  it('no guard on its normal rounds ever sees a cat standing on a checkpoint centre', () => {
    for (const id of LEVEL_IDS) {
      const level = getLevel(id);
      const c = compileLevel(level);
      guardsOnly(level, 1800, (s) => {
        for (const cp of level.checkpoints)
          for (const g of s.guards) expect(guardSeesPoint(c, g, centerOf(cp.tile), s.doorsOpen), `${id} ${g.id} sees ${cp.id} at tick ${s.tick}`).toBe(false);
      });
    }
  });

  it('the plate doors of the leapfrog levels have a checkpoint on the tile just past them', () => {
    // Otherwise a cat caught past a door respawns behind it, where nobody can open it (soft-lock).
    // heist-07 door W is the exception on purpose: a cat caught after W respawns in the south wing
    // and its partner, already in the east room on plate w, opens W again.
    for (const id of ['heist-03', 'heist-07']) {
      const level = getLevel(id);
      for (const d of level.doors.filter((x) => x.kind === 'PLATE' && x.id !== 'door-s3')) {
        const near = level.checkpoints.some((cp) => Math.abs(cp.tile.x - d.tile.x) + Math.abs(cp.tile.y - d.tile.y) === 1);
        expect(near, `${id} ${d.id}`).toBe(true);
      }
    }
  });
});

describe('HUD prompts', () => {
  it('asks the active cat to step closer to the crate, then to press interact', () => {
    const level = getLevel('heist-02');
    const s = initSim(level, 1, CATS);
    const crate = level.crate.tile;
    const at = (x: number, y: number): SimState => ({ ...s, cats: [{ ...s.cats[0], pos: centerOf({ x, y }) }, s.cats[1]] as SimState['cats'] });
    expect(contextPrompt(level, at(crate.x - 1, crate.y))).toEqual({ text: 'Press E to free Biscuit!', kind: 'act' });
    expect(contextPrompt(level, at(crate.x - 1, crate.y), true)?.text).toBe('Press ACT to free Biscuit!');
    expect(contextPrompt(level, at(crate.x - 2, crate.y))?.text).toMatch(/Step right next to the crate/);
    expect(contextPrompt(level, at(crate.x - 3, crate.y))).toBeNull();
    // The crate prompt outranks the authored hint zone around it.
    expect(hudHint(level, at(crate.x - 1, crate.y))).toBe('Press E to free Biscuit!');
  });

  it('confirms a held plate with the swap prompt only once the plate is really pressed', () => {
    const level = getLevel('heist-03');
    let s = initSim(level, 1, CATS);
    const plate = level.plates.find((p) => p.id === 'plate-f1')!.tile;
    const put = (x: number, y: number): SimState => ({ ...s, cats: [{ ...s.cats[0], pos: centerOf({ x, y }) }, s.cats[1]] as SimState['cats'] });
    s = stepSim(level, put(plate.x, plate.y), NO_INPUT);
    expect(s.platesDown[level.plates.findIndex((p) => p.id === 'plate-f1')]).toBe(true);
    expect(contextPrompt(level, s)).toEqual({ text: 'Plate held, door open. Press Q / Tab to move your other cat through.', kind: 'plate' });
    const off = stepSim(level, put(plate.x + 1, plate.y), NO_INPUT);
    expect(contextPrompt(level, off)).toBeNull();
  });
});

describe('partner danger', () => {
  it('flags the parked cat when a cone is about to reach it, and not when it is out of sight', () => {
    const level = getLevel('heist-02');
    const s0 = initSim(level, 1, CATS);
    const c = compileLevel(level);
    const g = s0.guards[0];
    const gt = tileOf(g.pos);
    // Two tiles straight ahead of the doorman (it faces south).
    const ahead = { x: gt.x, y: gt.y + 2 };
    expect(lineOfSight(c, gt, ahead, s0.doorsOpen)).toBe(true);
    const parked = (t: { x: number; y: number }): SimState => ({ ...s0, cats: [s0.cats[0], { ...s0.cats[1], pos: centerOf(t) }] as SimState['cats'] });
    expect(partnerDanger(level, parked(ahead))).toBe(0);
    expect(partnerDanger(level, parked(level.catSpawns[1]))).toBe(-1);
    // A cat that has just respawned (stunned) is invisible, so it is not flagged.
    const stunned = parked(ahead);
    stunned.cats[1] = { ...stunned.cats[1], stunTicks: 10 };
    expect(partnerDanger(level, stunned)).toBe(-1);
  });
});

describe('sentry telegraph: coming back to the post', () => {
  it('warns before every schedule-driven facing change in every solution replay, including the snap on arriving back at the post', () => {
    for (const id of LEVEL_IDS) {
      const level = getLevel(id);
      if (!level.guards.some((g) => g.turns)) continue;
      const log = getSolution(id);
      let s = initSim(level, log.seed, log.catIds);
      let arrivals = 0;
      for (const inp of decodeInputs(log.runs)) {
        const warned = sentryWarnings(level, s);
        const n = stepSim(level, s, inp);
        level.guards.forEach((def, gi) => {
          if (!def.turns) return;
          const a = s.guards[gi];
          const b = n.guards[gi];
          if (a.facing.x === b.facing.x && a.facing.y === b.facing.y) return;
          // Only the schedule's turns (on the post, in PATROL): walking and investigating turn freely.
          if (a.mode !== 'PATROL' || b.mode !== 'PATROL' || b.moving) return;
          if (a.moving) arrivals++;
          const w = warned.find((x) => x.guard === gi);
          expect(w, `${id} ${def.id} tick ${n.tick}`).toBeDefined();
          expect(w!.ticksLeft).toBe(1);
          expect(w!.next).toEqual(b.facing);
        });
        s = n;
      }
      if (id === 'heist-08') expect(arrivals).toBeGreaterThan(0);
    }
  });

  it('counts down to the arrival snap from a few tiles out', () => {
    const level = getLevel('heist-08');
    const gi = level.guards.findIndex((g) => g.id === 'g-doorman');
    const def = level.guards[gi];
    const post = def.waypoints[0];
    let s = initSim(level, 1, CATS);
    // Two tiles west of the post, walking back (PATROL, at a tile centre).
    const g = { ...s.guards[gi], pos: centerOf({ x: post.x - 2, y: post.y }), facing: { x: 1, y: 0 }, mode: 'PATROL' as const, moving: true };
    s = { ...s, guards: s.guards.map((x, i) => (i === gi ? g : x)) };
    const t = sentryReturnTurn(level, s, def, g)!;
    // 2 tiles at speed 1 = 32 ticks, then the snap on the next tick.
    expect(t.ticksLeft).toBe(33);
    expect(t.next).toEqual(sentryFacing(def, s.tick + 33));
  });
});

describe('look-ahead partner warning', () => {
  it('flags a parked cat that a patrol will walk into view of within 2 s, and not a safe one', () => {
    const level = getLevel('heist-06');
    let s = initSim(level, 1, CATS);
    // Park cat 2 in corridor 1, in front of the pacer's beat.
    s = { ...s, cats: [s.cats[0], { ...s.cats[1], pos: centerOf({ x: 20, y: 3 }) }] as SimState['cats'] };
    let hit: ReturnType<typeof partnerCatchAhead> = null;
    for (let k = 0; k < 600 && !hit; k++) {
      hit = partnerCatchAhead(level, s);
      if (!hit) s = stepSim(level, s, NO_INPUT);
    }
    expect(hit).not.toBeNull();
    expect(hit!.ticks).toBeGreaterThan(1);
    expect(level.guards[hit!.guard].id).toBe('g-hall-1');
    // On its spawn the parked cat is safe.
    expect(partnerCatchAhead(level, initSim(level, 1, CATS))).toBeNull();
  });
});

describe('hint zones', () => {
  it('fromObjective holds a hint back until that objective (heist-08 doorman hint)', () => {
    const level = getLevel('heist-08');
    const s0 = initSim(level, 1, CATS);
    const at = (x: number, y: number, keyTaken: boolean): SimState => ({ ...s0, keyTaken, cats: [{ ...s0.cats[0], pos: centerOf({ x, y }) }, s0.cats[1]] as SimState['cats'] });
    expect(activeHint(level, at(18, 23, false))).toMatch(/gap in the wall/);
    expect(activeHint(level, at(18, 23, true))).toMatch(/doorman/);
  });
});
