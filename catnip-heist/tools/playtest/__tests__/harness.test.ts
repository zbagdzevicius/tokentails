import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, getLevel, getSolution } from '../../../src/levels';
import { compileLevel, centerOf } from '../../../src/sim/grid';
import { initSim, stepSim, visibleTiles } from '../../../src/sim/sim';
import { NO_INPUT } from '../../../src/types';
import { Heap, coneTiles, inView, jointSearch, steerDir, buildRegions, doorEdges } from '../nav';
import { Rng } from '../rng';
import { followRoute, routeFromLog, runEpisode } from '../runner';
import { HUMAN_PERSONAS, PERSONAS } from '../personas';
import { median, percentile, summarize } from '../stats';
import { isSoftLocked } from '../softlock';
import { extractNotes, renderReport, NOTES_END, NOTES_START } from '../report';

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const v = r.int(6, 14);
      expect(v >= 6 && v <= 14 && Number.isInteger(v)).toBe(true);
    }
  });
});

describe('nav', () => {
  it('coneTiles matches the sim vision (visibleTiles) for every guard of every level', () => {
    for (const id of LEVEL_IDS) {
      const level = getLevel(id);
      const c = compileLevel(level);
      const s = initSim(level, 1, ['bob', 'oreo']);
      for (const g of s.guards) {
        const gt = { x: g.pos.x >> 4, y: g.pos.y >> 4 };
        const mine = [...coneTiles(c, gt.x, gt.y, g.facing.x, g.facing.y, g.visionTiles, s.doorsOpen)].sort((a, b) => a - b);
        const sim = visibleTiles(level, g, s.doorsOpen)
          .map((t) => t.y * c.w + t.x)
          .sort((a, b) => a - b);
        expect(mine).toEqual(sim);
      }
    }
  });

  it('inView is the rotated camera footprint around the cat', () => {
    const p = centerOf({ x: 20, y: 20 });
    expect(inView(p.x, p.y, 20, 20, 1)).toBe(true);
    // Along a grid axis the screen diagonal reaches further than along the screen axes.
    expect(inView(p.x, p.y, 34, 20, 1)).toBe(true);
    expect(inView(p.x, p.y, 36, 20, 1)).toBe(false);
    expect(inView(p.x, p.y, 27, 13, 1)).toBe(true); // screen-right
    expect(inView(p.x, p.y, 29, 11, 1)).toBe(false);
    expect(inView(p.x, p.y, 34, 20, 0.5)).toBe(false);
  });

  it('heap pops in priority order, ties first-in first-out', () => {
    const h = new Heap();
    [5, 1, 4, 1, 3].forEach((p, i) => h.push(p, i));
    const out: number[] = [];
    while (h.size) out.push(h.pop()!);
    expect(out).toEqual([1, 3, 4, 2, 0]);
  });

  it('steerDir holds a clean cardinal from a tile centre and stops at the target centre', () => {
    const p = centerOf({ x: 3, y: 3 });
    expect(steerDir(p, 4, 3)).toEqual([1, 0]);
    expect(steerDir(p, 3, 2)).toEqual([0, -1]);
    expect(steerDir({ x: p.x + 5, y: p.y - 4 }, 4, 3)).toEqual([1, 1]);
    expect(steerDir(p, 3, 3)).toEqual([0, 0]);
  });

  it('the region search finds the heist-01 tutorial leapfrog (one cat holds, the other walks through)', () => {
    const level = getLevel('heist-01');
    const c = compileLevel(level);
    const plateDoor = (i: number) => c.doorAt[i] > 0 && level.doors[c.doorAt[i] - 1].kind === 'PLATE';
    const regions = buildRegions(c, (i) => c.terrain[i] === 0 && i !== c.crateIdx && !(c.doorAt[i] > 0 && level.doors[c.doorAt[i] - 1].kind === 'VAULT'), plateDoor);
    const edges = doorEdges(c, level, regions, () => true, () => true);
    const r = (t: { x: number; y: number }) => regions.id[t.y * c.w + t.x];
    const tut = r(level.catSpawns[0]);
    const hall = r({ x: 14, y: 11 });
    expect(tut).not.toBe(hall);
    const plateRegion = (p: number) => r(level.plates[p].tile);
    const res = jointSearch([tut, tut], edges, plateRegion, (a, b) => a === hall && b === hall);
    expect(res).not.toBeNull();
    expect(res).not.toBe('here');
    if (res && res !== 'here') {
      expect(res.moves).toBe(2);
      expect(level.doors[res.door].id).toBe('door-tutorial');
    }
  });
});

describe('validation', () => {
  it('following the solver route with the bot steering wins every level with the recorded hash', () => {
    for (const id of LEVEL_IDS) {
      const level = getLevel(id);
      const sol = getSolution(id);
      const end = followRoute(level, routeFromLog(level, sol), sol.seed, sol.catIds);
      expect(end.won, id).toBe(true);
      expect(end.spottedCount, id).toBe(0);
      expect(end.hash, id).toBe(sol.finalHash);
    }
  });

  it('episodes are deterministic per (level, persona, seed)', () => {
    const level = getLevel('heist-02');
    for (const p of HUMAN_PERSONAS) {
      const a = runEpisode(level, p, 3);
      const b = runEpisode(level, p, 3);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    const x = runEpisode(level, 'novice', 1);
    const y = runEpisode(level, 'novice', 2);
    expect(JSON.stringify(x)).not.toBe(JSON.stringify(y));
  });

  it('reaction delays stay inside the human range (200-450 ms) for every human persona', () => {
    for (const p of HUMAN_PERSONAS) {
      const [lo, hi] = PERSONAS[p].reaction;
      expect(lo).toBeGreaterThanOrEqual(6);
      expect(hi).toBeLessThanOrEqual(14);
      for (const seed of [1, 2, 3, 4]) {
        const r = runEpisode(getLevel('heist-01'), p, seed, { maxTicks: 30 });
        expect(r.reaction >= lo && r.reaction <= hi).toBe(true);
      }
    }
  });

  it('the oracle bot (no delay, map known) wins heist-01 and heist-02 without solutions', () => {
    for (const id of ['heist-01', 'heist-02']) {
      const r = runEpisode(getLevel(id), 'oracle', 1);
      expect(r.won, id).toBe(true);
      expect(r.stars & 1).toBe(1);
    }
  });

  it('records results consistent with the sim (stars only on a win, spots listed)', () => {
    const r = runEpisode(getLevel('heist-01'), 'rusher', 5);
    expect(r.spots.length).toBe(r.spotted);
    if (!r.won) expect(r.stars).toBe(0);
    expect(r.coins).toBeLessThanOrEqual(r.coinsTotal);
  });
});

describe('soft-lock check', () => {
  it('a fresh level is not soft-locked; a heist-03 cat stranded behind door A with its partner past door D is', () => {
    const level = getLevel('heist-03');
    const s0 = initSim(level, 1, ['bob', 'oreo']);
    expect(isSoftLocked(level, s0)).toBe(false);
    // Cat 1 back at spawn (west room), cat 2 in the store room behind door D.
    const s = stepSim(level, s0, NO_INPUT);
    const stranded = { ...s, cats: [s.cats[0], { ...s.cats[1], pos: centerOf({ x: 24, y: 4 }) }] as typeof s.cats };
    expect(isSoftLocked(level, stranded)).toBe(true);
  });
});

describe('stats and report', () => {
  it('median and nearest-rank percentile', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });

  it('summarize and render a report that keeps hand-written notes', () => {
    const level = getLevel('heist-01');
    const rs = [1, 2, 3].map((seed) => runEpisode(level, 'rusher', seed));
    const s = summarize(rs);
    expect(s.runs).toBe(3);
    expect(s.completion).toBeCloseTo(rs.filter((r) => r.won).length / 3);
    const md = renderReport({ meta: { runs: 3, seed0: 1, levels: ['heist-01'], personas: ['rusher'], seconds: 1, episodes: 3 }, summaries: [s], validation: null, argv: [], notes: 'keep me' });
    expect(md).toContain('heist-01');
    expect(md).toContain(NOTES_START);
    expect(md).toContain(NOTES_END);
    expect(extractNotes(md)).toBe('keep me');
  });
});
