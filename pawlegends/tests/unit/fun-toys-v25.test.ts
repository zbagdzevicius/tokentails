/**
 * Sim v25 (founder report 2026-11-12: "fix in-game objects in fun mode (ball, cannonball, trampoline) as it's hard to
 * navigate through them"). The Kibble Cannon and the Mega Yarn Ball react only to a hero that means it, and only once
 * its body touches what is drawn:
 * - Cannon: the hero's centre within CANNON.reach + RADIUS.hero (2.0 m: its body on the gold ring) and stopped there,
 *   or walking with its goal within CANNON.aim of the cannon (a tap on it, a stick pushed at it, a bot fetching it).
 * - Yarn: the hero's centre within YARN.kickReach (1.35 m: its body on the ball), heading within 60° of the ball and
 *   its goal within YARN.near of it; the ball rolls along the walk.
 * Plus the lane check: a champion walking a toy-dense line (Crossing's river crossing, cannon and both balls on it) or
 * past every toy of both maps never stalls, is never grabbed, and arrives as fast as with the toys gone.
 * Headless sim at 30 Hz, bots off; a touch stick is a move 2 m ahead every 100 ms through the input gate.
 */
import { describe, expect, it } from 'vitest';
import { BOING, CANNON, FUN_BY_MAP, YARN } from '../../src/data/fun';
import { HERO_IDS } from '../../src/data/heroes/index';
import { RADIUS } from '../../src/data/map';
import { Op, type Command, type HeroId, type MapId } from '../../src/sim/api';
import { createMatch, fillPicks, result, step, type MatchHandle } from '../../src/sim/index';
import { bindMap } from '../../src/sim/map/runtime';
import { cellOf, createGrid, walkable } from '../../src/sim/map/grid';
import { bedCount, bedOf } from '../../src/sim/units/boing';
import { cannonData } from '../../src/sim/units/cannon';
import { yarnAt, yarnCount } from '../../src/sim/units/yarn';
import { CANNON_STATE, FM, G, Order, YARN_STATE, YF } from '../../src/sim/world';
import { SIM_VERSION } from '../../src/sim/version';
import { CANNON_RING } from '../../src/render/views/funView';
import { hold, place } from './heroes/kit-helpers';

const AHEAD = 2000;
const EVERY = 3;
/** The stall bar: a walking champion never stands still this many ticks in a row. */
const STALL = 3;

const mapIndex = (map: MapId) => (map === 'hearthwood' ? 1 : 0);
const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

/** A bots-off match on `map` with slot 0 = `hero`; every other hero holds at its fountain. Toys all off. */
function match(map: MapId, hero: HeroId = 'clem', seed = 11): MatchHandle {
  const { picks, tricks } = fillPicks(seed, hero, 'pounce', map);
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal', map });
  const w = m.world;
  w.globals[G.Tick] = 300;
  w.globals[G.BotsOff] = 1;
  w.globals[G.SideEdge] = 0;
  w.globals[G.CannonAt] = -1;
  for (let b = 0; b < 2; b++) {
    w.globals[yarnAt(b, YF.State)] = YARN_STATE.Away;
    w.globals[yarnAt(b, YF.T)] = 1 << 28;
  }
  hold(m, ...Array.from({ length: picks.length }, (_, i) => i));
  w.order[0] = Order.None;
  return m;
}

function groundCannon(m: MatchHandle, x: number, y: number): void {
  const w = m.world;
  w.globals[G.CannonState] = CANNON_STATE.Ground;
  w.globals[G.CannonBy] = -1;
  w.globals[G.CannonX] = x;
  w.globals[G.CannonY] = y;
  w.globals[G.CannonFuse] = CANNON.fuse;
  w.globals[G.CannonDrop] = 0;
}

function restBall(m: MatchHandle, b: number, x: number, y: number): void {
  const w = m.world;
  w.globals[yarnAt(b, YF.State)] = YARN_STATE.Rest;
  w.globals[yarnAt(b, YF.X)] = x;
  w.globals[yarnAt(b, YF.Y)] = y;
  w.globals[yarnAt(b, YF.T)] = 0;
  w.globals[yarnAt(b, YF.Kicks)] = 0;
}


interface Walk {
  ticks: number;
  grabs: string[];
  /** Longest run of ticks the hero stood still before arriving. */
  stall: number;
}

/** Walk slot 0 from (sx, sy) to (ex, ey) by touch stick or one click; `setup` puts the toys down (or not). */
function walk(map: MapId, hero: HeroId, sx: number, sy: number, ex: number, ey: number, style: 'stick' | 'click', setup: (m: MatchHandle) => void): Walk {
  const m = match(map, hero);
  const w = m.world;
  place(m, 0, sx, sy, 0);
  setup(m);
  const grabs: string[] = [];
  let still = 0;
  let stall = 0;
  try {
    for (let t = 0; t < 900; t++) {
      w.hp[0] = w.maxHp[0];
      const cmds: Command[] = [];
      if (style === 'click') {
        if (t === 0) cmds.push({ op: Op.Move, x: ex, y: ey });
      } else if (t % EVERY === 0) {
        const rem = Math.sqrt(d2(w.x[0], w.y[0], ex, ey));
        const k = Math.min(AHEAD, rem) / Math.max(1, rem);
        cmds.push({ op: Op.Move, x: Math.round(w.x[0] + (ex - w.x[0]) * k), y: Math.round(w.y[0] + (ey - w.y[0]) * k) });
      }
      const px = w.x[0];
      const py = w.y[0];
      step(m, cmds);
      for (const e of m.events) if ((e.type === 'cannonPick' || e.type === 'yarnKick' || e.type === 'boing') && e.id === 0) grabs.push(`${e.type}@${t}`);
      if (d2(w.x[0], w.y[0], ex, ey) <= 500 * 500) return { ticks: t + 1, grabs, stall };
      still = w.x[0] === px && w.y[0] === py ? still + 1 : 0;
      stall = Math.max(stall, still);
    }
    return { ticks: 900, grabs, stall };
  } finally {
    bindMap(0);
  }
}

function clearLine(map: MapId, ax: number, ay: number, bx: number, by: number): boolean {
  bindMap(mapIndex(map));
  const g = createGrid();
  let ok = true;
  for (let k = 0; k <= 40 && ok; k++) ok = walkable(g, cellOf(Math.round(ax + ((bx - ax) * k) / 40), Math.round(ay + ((by - ay) * k) / 40)));
  bindMap(0);
  return ok;
}

describe('sim v25: the Kibble Cannon is taken on purpose', () => {
  it('SIM_VERSION is 25 or later; the pick-up is the hero body on the drawn ring (2.0 m), a goal within 0.8 m', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(25);
    expect([CANNON.reach + RADIUS.hero, CANNON.aim]).toEqual([2000, 800]);
    // the drawn ring ends where the body reaches (render: funView CANNON_RING)
    expect((CANNON_RING.outer * 1000 - 50) + RADIUS.hero).toBe(CANNON.reach + RADIUS.hero);
    expect([YARN.kickReach, YARN.near]).toEqual([1350, 3200]);
  });

  it('a hero stopped on it takes it within the ring; 2.1 m off it does not', () => {
    for (const [off, want] of [
      [1900, true],
      [2100, false],
    ] as const) {
      const m = match('crossing');
      place(m, 0, 30000, 36000, 0);
      groundCannon(m, 30000 + off, 36000);
      step(m);
      expect(m.events.some((e) => e.type === 'cannonPick'), `${off} mm`).toBe(want);
    }
  });

  it('a walk past (a click to a far goal straight over it, a stick 1 m or more beside it) leaves it on the ground', () => {
    for (const [style, off] of [
      ['click', 0],
      ['click', 1000],
      ['stick', 1000],
      ['stick', 1200],
      ['stick', 1400],
    ] as const) {
      const r = walk('crossing', 'clem', 30000, 36000 + off, 70000, 36000 + off, style, (m) => groundCannon(m, 50000, 36000));
      expect(r.grabs, `${style} ${off}`).toEqual([]);
    }
  });

  it('a stick pushed at it, a tap on it, or a stop on it takes it; a fight beside it does not until the hero stops', () => {
    const stick = walk('crossing', 'clem', 44000, 36000, 52000, 36000, 'stick', (m) => groundCannon(m, 50000, 36000));
    expect(stick.grabs.some((g) => g.startsWith('cannonPick'))).toBe(true);
    const tap = walk('crossing', 'clem', 44000, 33000, 50000, 36500, 'click', (m) => groundCannon(m, 50000, 36000));
    expect(tap.grabs.some((g) => g.startsWith('cannonPick'))).toBe(true);
    const m = match('crossing');
    const w = m.world;
    place(m, 0, 49000, 36000, 0);
    place(m, 3, 52500, 36000, 2048);
    groundCannon(m, 50000, 36000);
    w.attackTimer[0] = 0;
    w.order[0] = Order.Attack;
    w.target[0] = 3;
    for (let t = 0; t < 20; t++) {
      step(m, t % 6 === 0 ? [{ op: Op.Attack, id: 3 }] : []);
      w.hp[3] = w.maxHp[3];
      w.x[3] = 52500;
      expect(m.events.some((e) => e.type === 'cannonPick'), `t ${t}`).toBe(false);
    }
    step(m, [{ op: Op.Stop }]);
    expect(m.events.some((e) => e.type === 'cannonPick' && e.id === 0)).toBe(true);
  });
});

describe('sim v25: the Mega Yarn Ball is kicked on purpose, along the walk', () => {
  it('a click to a far goal through it, or a stick brushing past 1.3 m off, leaves it resting', () => {
    for (const [style, off] of [
      ['click', 0],
      ['click', 800],
      ['stick', 1300],
    ] as const) {
      const r = walk('crossing', 'clem', 50000 - 8000, 36000 + off, 50000 + 8000, 36000 + off, style, (m) => restBall(m, 0, 50000, 36000));
      expect(r.grabs, `${style} ${off}`).toEqual([]);
    }
  });

  it('a stick into it at an angle kicks it along the stick, not centre to centre', () => {
    const m = match('crossing');
    const w = m.world;
    // the hero 1.6 m west and 0.6 m south of the ball, the stick due east: the centre line is 20.6° off the stick
    place(m, 0, 48400, 35400, 0);
    restBall(m, 0, 50000, 36000);
    let p = -1;
    for (let t = 0; t < 30 && p < 0; t++) {
      step(m, t % EVERY === 0 ? [{ op: Op.Move, x: w.x[0] + AHEAD, y: 35400 }] : []);
      if (m.events.some((e) => e.type === 'yarnKick' && e.id === 0)) p = w.globals[yarnAt(0, YF.P)];
    }
    expect(p).toBeGreaterThanOrEqual(0);
    const x0 = w.pX[p];
    const y0 = w.pY[p];
    for (let t = 0; t < 10; t++) step(m);
    const ang = (Math.atan2(w.pY[p] - y0, w.pX[p] - x0) * 180) / Math.PI;
    expect(Math.abs(ang)).toBeLessThan(6);
  });
});

describe('sim v25: a champion crossing the toys never stalls', { timeout: 600000 }, () => {
  it("Crossing's river crossing with the cannon and both balls on it: walked by stick and by click, never grabbed or stalled", () => {
    const toys = (m: MatchHandle) => {
      const homes = FUN_BY_MAP[0].yarn.homes;
      for (let b = 0; b < homes.length; b++) restBall(m, b, homes[b][0], homes[b][1]);
      groundCannon(m, 50000, 36000);
    };
    const none = () => {};
    // 1.4 m east of the centre line: past the drawn ball (1.35 m), so a stick passes; a click walks the line itself
    for (const [style, x] of [
      ['stick', 51400],
      ['click', 50000],
      ['click', 51400],
    ] as const) {
      for (const [sy, ey] of [
        [10000, 51000],
        [51000, 10000],
      ]) {
        expect(clearLine('crossing', x, sy, x, ey), `line x ${x}`).toBe(true);
        for (const hero of ['clem', 'brutus', 'rocket'] as const) {
          const base = walk('crossing', hero, x, sy, x, ey, style, none);
          const r = walk('crossing', hero, x, sy, x, ey, style, toys);
          const tag = `${style} x ${x} ${sy}→${ey} ${hero}`;
          expect(r.grabs, tag).toEqual([]);
          expect(r.stall, tag).toBeLessThan(STALL);
          expect(r.ticks, tag).toBe(base.ticks);
        }
      }
    }
  });

  it('every toy of both maps, walked past in 24 headings by stick and by click: no grab, no stall, no time lost', () => {
    let walks = 0;
    const bad: string[] = [];
    for (const map of ['crossing', 'hearthwood'] as const) {
      const probe = match(map);
      const w = probe.world;
      const centres: { toy: 'bed' | 'yarn' | 'cannon'; idx: number; x: number; y: number; throwA?: number }[] = [];
      const b = new Int32Array(4);
      for (let i = 0; i < bedCount(w); i++) {
        bedOf(w, i, b);
        centres.push({ toy: 'bed', idx: i, x: b[0], y: b[1], throwA: Math.atan2(b[3] - b[1], b[2] - b[0]) });
      }
      FUN_BY_MAP[w.map].yarn.homes.forEach((h, i) => i < yarnCount(w) && centres.push({ toy: 'yarn', idx: i, x: h[0], y: h[1] }));
      cannonData(w).spots.forEach((s, i) => centres.push({ toy: 'cannon', idx: i, x: s[0], y: s[1] }));
      bindMap(0);
      for (const c of centres) {
        const setup = (m: MatchHandle) => {
          if (c.toy === 'yarn') restBall(m, c.idx, c.x, c.y);
          if (c.toy === 'cannon') groundCannon(m, c.x, c.y);
        };
        const off = (m: MatchHandle) => {
          if (c.toy === 'bed') m.world.boingT[0] = 1 << 20;
        };
        for (let h = 0; h < 24; h++) {
          const a = (h * Math.PI * 2) / 24;
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          // a bed: any walk more than 75° off its throw, straight over the paw print (closer to the throw is a use);
          // the cannon and the ball: a stick just clear of the drawn ring or ball, a click straight over the middle
          let headOff = 180;
          if (c.throwA !== undefined) headOff = Math.abs(((a - c.throwA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (180 / Math.PI);
          if (c.toy === 'bed' && headOff < 75) continue;
          for (const style of ['stick', 'click'] as const) {
            const lateral = c.toy === 'bed' ? 0 : style === 'click' ? 0 : c.toy === 'yarn' ? 1400 : 1600;
            const px = c.x - dy * lateral;
            const py = c.y + dx * lateral;
            const [sx, sy, ex, ey] = [px - dx * 7000, py - dy * 7000, px + dx * 7000, py + dy * 7000].map(Math.round);
            if (!clearLine(map, sx, sy, ex, ey)) continue;
            const hero = HERO_IDS[walks++ % HERO_IDS.length];
            const base = walk(map, hero, sx, sy, ex, ey, style, off);
            // a straight line can still end where a hero cannot stand (a camp wall's face): skip what fails without toys
            if (base.ticks >= 900) continue;
            const r = walk(map, hero, sx, sy, ex, ey, style, setup);
            const tag = `${map} ${c.toy} ${c.idx} ${style} ${Math.round((a * 180) / Math.PI)}° ${hero}`;
            if (r.grabs.length || r.stall >= STALL || r.ticks > base.ticks) bad.push(`${tag}: ${r.grabs.join(' ')} stall ${r.stall} ticks ${r.ticks}/${base.ticks}`);
          }
        }
      }
    }
    expect(walks).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  });

  it('bots still use every toy: all-bot Blitz matches pick the cannon up, kick a ball and take a bed', () => {
    const seen = { cannonPick: 0, yarnKick: 0, boing: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { picks, tricks } = fillPicks(seed, HERO_IDS[seed % HERO_IDS.length], 'pounce', 'crossing');
      const m = createMatch({ seed, picks, tricks, difficulty: 'hard', map: 'crossing', mutator: 'blitz' });
      m.world.humans = 0; // every slot a bot
      while (!result(m) && m.world.globals[G.Tick] < 30 * 60 * 25) {
        step(m);
        for (const e of m.events) if (e.type === 'cannonPick' || e.type === 'yarnKick' || e.type === 'boing') seen[e.type]++;
      }
    }
    expect(seen.cannonPick).toBeGreaterThan(0);
    expect(seen.yarnKick).toBeGreaterThan(0);
    expect(seen.boing).toBeGreaterThan(0);
    expect(BOING.stand).toBe(15);
    expect(FM.Leap).toBeGreaterThan(0);
  });
});
