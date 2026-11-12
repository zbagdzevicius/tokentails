/**
 * Sim v24 (docs/plans/moba/V21-FUN.md §2.1 "v24: instant beds"; founder report 2026-11-12: "these in Blitz are glitchy,
 * they must be better, more sensitive, as right now it takes time and several attempt to be lifted at all"). A Boing
 * Bed launches a hero that steps onto its disc at once and one stopped on it within BOING.stand ticks; a hero fighting
 * by the rim or walking along the lane past it is not thrown.
 *
 * Sim v25 (founder report 2026-11-12: "fix in-game objects in fun mode (ball, cannonball, trampoline) as it's hard to
 * navigate through them"): only a walk heading within 60° of the throw launches at once; a touch walk that only
 * crosses the cushion (or a fight on it) is never thrown, not even when the thumb lets go on it; a tap on the cushion
 * from the side throws 0.5 s after the hero stops there. Headless sim at 30 Hz, bots off; slot 0's commands go through
 * the input gate (step), as a touch stick's would: a move 2 m ahead every 100 ms.
 */
import { describe, expect, it } from 'vitest';
import { BOING, CROSSING_BEDS, HEARTHWOOD_BEDS } from '../../src/data/fun';
import { HERO_IDS } from '../../src/data/heroes/index';
import { Op, type Command, type HeroId, type MapId } from '../../src/sim/api';
import { createMatch, fillPicks, step, type MatchHandle } from '../../src/sim/index';
import { bindMap } from '../../src/sim/map/runtime';
import { cellOf, createGrid, walkable } from '../../src/sim/map/grid';
import { Rng } from '../../src/sim/rng';
import { bedCount, bedOf } from '../../src/sim/units/boing';
import { FM, G } from '../../src/sim/world';
import { SIM_VERSION } from '../../src/sim/version';
import { hold, place } from './heroes/kit-helpers';

/** Touch stick: STICK.aheadMm and STICK.everyMs (src/input/touch/touchControls.ts). */
const AHEAD = 2000;
const EVERY = 3;
/** The bars: a stick launches within 0.3 s of the hero's centre first entering the disc; a let-go after BOING.stand; a
 * tap on a cushion spot within 2 s (the walk across the cushion, then the stand). */
const WITHIN = { stick: 9, stop: BOING.stand, tap: 60 } as const;
/** The v25 cone (the sim's within60) and the approach band the trials draw from, a little inside it. */
const CONE = 60;
const BAND = 55;

/** A bots-off match on `map` with slot 0 = `hero`, everyone else parked far from every bed. */
function match(map: MapId, hero: HeroId, seed: number): MatchHandle {
  const { picks, tricks } = fillPicks(seed, hero, 'pounce', map);
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal', map });
  const w = m.world;
  w.globals[G.Tick] = 300;
  w.globals[G.BotsOff] = 1;
  w.globals[G.SideEdge] = 0;
  const n = picks.length;
  for (let id = 1; id < n; id++) place(m, id, w.x[id], w.y[id], 0); // at their fountains
  hold(m, ...Array.from({ length: n }, (_, i) => i));
  return m;
}

const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const launched = (m: MatchHandle) => m.events.some((e) => e.type === 'boing' && e.id === 0);

interface Trial {
  map: MapId;
  bed: number;
  hero: HeroId;
  /** Start (mm) and the stick's aim wobble (rad, alternating per send). */
  sx: number;
  sy: number;
  wobble: number;
  /**
   * 'stick': a touch stick held toward the bed (a move 2 m ahead every 100 ms) and on across it;
   * 'tap': one click or tap on a random spot of the cushion;
   * 'stop': the stick walks the hero onto the cushion while its bed cooldown still runs, the thumb lets go there and
   * the cooldown ends (the stand rule).
   */
  style: 'stick' | 'tap' | 'stop';
  /** 'tap': the spot (mm off the bed centre). */
  tx: number;
  ty: number;
}

/** Trial `i`: a bed on either map, a start 2.5–5 m out on a walkable line to the bed from the throw's own side. */
function trial(i: number): Trial {
  const r = new Rng(0xb0196 + i);
  const map: MapId = i % 2 === 0 ? 'crossing' : 'hearthwood';
  const { picks, tricks } = fillPicks(1, 'clem', 'pounce', map);
  const probe = createMatch({ seed: 1, picks, tricks, difficulty: 'normal', map });
  const g = createGrid();
  const bed = r.int(bedCount(probe.world));
  const b = new Int32Array(4);
  bedOf(probe.world, bed, b);
  const throwA = Math.atan2(b[3] - b[1], b[2] - b[0]);
  for (;;) {
    // approach from behind the bed: the walk heads at most BAND° off the throw
    const a = throwA + Math.PI + ((r.int(2201) - 1100) / 1100) * ((BAND * Math.PI) / 180);
    const dist = 2500 + r.int(2500);
    const sx = Math.round(b[0] + Math.cos(a) * dist);
    const sy = Math.round(b[1] + Math.sin(a) * dist);
    let clear = true;
    for (let k = 0; k <= 10 && clear; k++) clear = walkable(g, cellOf(Math.round(sx + ((b[0] - sx) * k) / 10), Math.round(sy + ((b[1] - sy) * k) / 10)));
    if (!clear) continue;
    bindMap(0);
    const style = (['stick', 'tap', 'stop'] as const)[r.int(3)];
    const ta = (r.int(6283) / 1000);
    const tr = r.int(BOING.reach - 100);
    return { map, bed, hero: HERO_IDS[r.int(HERO_IDS.length)], sx, sy, wobble: (r.int(31) - 15) / 100, style, tx: Math.round(Math.cos(ta) * tr), ty: Math.round(Math.sin(ta) * tr) };
  }
}

/** Play a trial: ticks from the hero's centre first in the disc (for 'stop': from the let-go) to the launch. */
function play(t: Trial): number {
  const m = match(t.map, t.hero, 11);
  const w = m.world;
  const b = new Int32Array(4);
  bedOf(w, t.bed, b);
  place(m, 0, t.sx, t.sy, 0);
  const reach2 = BOING.reach * BOING.reach;
  let from = -1;
  try {
    for (let tick = 0; tick < 150; tick++) {
      const cmds: Command[] = [];
      const on = d2(w.x[0], w.y[0], b[0], b[1]) <= reach2;
      if (t.style === 'tap') {
        if (tick === 0) cmds.push({ op: Op.Move, x: b[0] + t.tx, y: b[1] + t.ty });
      } else if (t.style === 'stop' && on && from < 0) {
        cmds.push({ op: Op.Stop });
        w.boingT[0] = 1; // runs out in this step's stepBoing
        from = tick;
      } else if (from < 0 && tick % EVERY === 0) {
        if (t.style === 'stop') w.boingT[0] = 1000;
        const a = Math.atan2(b[1] - w.y[0], b[0] - w.x[0]) + (tick % (2 * EVERY) === 0 ? t.wobble : -t.wobble);
        cmds.push({ op: Op.Move, x: Math.round(w.x[0] + Math.cos(a) * AHEAD), y: Math.round(w.y[0] + Math.sin(a) * AHEAD) });
      } else if (t.style === 'stick' && from >= 0 && tick % EVERY === 0) {
        // the thumb stays on: on across the cushion
        const a = Math.atan2(b[1] - t.sy, b[0] - t.sx);
        cmds.push({ op: Op.Move, x: Math.round(w.x[0] + Math.cos(a) * AHEAD), y: Math.round(w.y[0] + Math.sin(a) * AHEAD) });
      }
      step(m, cmds);
      if (from < 0 && t.style !== 'stop' && d2(w.x[0], w.y[0], b[0], b[1]) <= reach2) from = tick;
      if (launched(m)) return from < 0 ? 0 : tick - from;
    }
    return from < 0 ? -1 : Infinity;
  } finally {
    bindMap(0);
  }
}

describe('Boing Beds v25: deliberate beds', { timeout: 300000 }, () => {
  it('SIM_VERSION is 25 or later; the disc reaches the drawn rim (1.2 m), a stop launches in 0.5 s', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(25);
    expect([BOING.reach, BOING.near, BOING.stand]).toEqual([1200, 3200, 15]);
    // the angle test stays exact (< 2^53) only while every throw is under 16 m
    for (const [bx, by, lx, ly] of [...CROSSING_BEDS, ...HEARTHWOOD_BEDS]) expect(Math.hypot(lx - bx, ly - by)).toBeLessThan(16000);
  });

  it('a touch stick steering onto a bed from behind launches within 0.3 s; a let-go or a tap on it once stopped, 200 of 200', () => {
    const slow: string[] = [];
    const styles = { stick: 0, tap: 0, stop: 0 };
    for (let i = 0; i < 200; i++) {
      const t = trial(i);
      styles[t.style]++;
      const dt = play(t);
      if (dt < 0 || dt > WITHIN[t.style]) slow.push(`#${i} ${t.map} bed ${t.bed} ${t.hero} ${t.style}: ${dt}`);
    }
    expect(slow).toEqual([]);
    for (const n of Object.values(styles)) expect(n).toBeGreaterThan(40);
  });

  it('a hero placed on the cushion and stopped launches after BOING.stand ticks; fighting on it does not', () => {
    const m = match('crossing', 'clem', 3);
    const w = m.world;
    const [bx, by] = CROSSING_BEDS[0];
    place(m, 0, bx + 300, by - 200, 0);
    let at = -1;
    for (let t = 0; t < 20 && at < 0; t++) {
      step(m, t === 0 ? [{ op: Op.Stop }] : []);
      if (launched(m)) at = t + 1;
    }
    expect(at).toBe(BOING.stand);
    expect(w.fmKind[0]).toBe(FM.Leap);
  });

  it('fighting by the rim never launches: Attack, attack-move and kite with the centre just outside the disc', () => {
    for (const map of ['crossing', 'hearthwood'] as const) {
      const probe = match(map, 'clem', 5);
      const n = bedCount(probe.world);
      bindMap(0);
      for (let bed = 0; bed < n; bed++) {
        for (const op of [Op.Attack, Op.AttackMove, Op.Kite] as const) {
          const m = match(map, 'clem', 5);
          const w = m.world;
          const b = new Int32Array(4);
          bedOf(w, bed, b);
          // Clem side-on to the throw, centre 0.15–0.5 m outside the disc (her body overlaps the cushion); a foe 3 m out
          const ax = -(b[3] - b[1]);
          const ay = b[2] - b[0];
          const l = Math.hypot(ax, ay);
          const r = BOING.reach + 150 + (bed % 3) * 150;
          place(m, 0, Math.round(b[0] + (ax / l) * r), Math.round(b[1] + (ay / l) * r), 0);
          const foe = w.team[0] === w.team[3] ? 1 : 3;
          place(m, foe, Math.round(b[0] + (ax / l) * (r + 3000)), Math.round(b[1] + (ay / l) * (r + 3000)), 0);
          w.attackTimer[0] = 0;
          for (let t = 0; t < 90; t++) {
            // keep the fight going on the spot: the order names the foe, the kite's goal is the hero's own spot
            const cmd: Command =
              op === Op.Attack ? { op, id: foe } : op === Op.Kite ? { op, x: w.x[0], y: w.y[0], id: foe } : { op, x: w.x[foe], y: w.y[foe] };
            step(m, t % 6 === 0 ? [cmd] : []);
            w.hp[foe] = w.maxHp[foe];
            w.x[foe] = Math.round(b[0] + (ax / l) * (r + 3000));
            w.y[foe] = Math.round(b[1] + (ay / l) * (r + 3000));
            expect(launched(m), `${map} bed ${bed} op ${op} t ${t}`).toBe(false);
            if (d2(w.x[0], w.y[0], b[0], b[1]) <= BOING.reach * BOING.reach) break; // stepped onto it: not a rim fight
          }
          bindMap(0);
        }
      }
    }
  });

  it('a hero attacking a foe from the cushion is not thrown mid-fight', () => {
    const m = match('crossing', 'clem', 3);
    const w = m.world;
    const [bx, by] = CROSSING_BEDS[0];
    place(m, 0, bx, by, 0);
    place(m, 3, bx, by + 3000, 0);
    w.attackTimer[0] = 0;
    for (let t = 0; t < 60; t++) {
      step(m, t % 6 === 0 ? [{ op: Op.Attack, id: 3 }] : []);
      w.hp[3] = w.maxHp[3];
      expect(launched(m)).toBe(false);
    }
  });

  it('walking along a lane past a bed to a far goal does not launch; walking off it backwards does not either', () => {
    const m = match('crossing', 'clem', 3);
    const [bx, by, lx, ly] = CROSSING_BEDS[0];
    // the throw is +x (east): walk north to south across the cushion toward a far goal off the throw
    expect(ly).toBe(by);
    expect(lx).toBeGreaterThan(bx);
    place(m, 0, bx - 300, by + 2500, 0);
    step(m, [{ op: Op.Move, x: bx - 300, y: by - 9000 }]);
    for (let t = 0; t < 40; t++) {
      step(m);
      expect(launched(m)).toBe(false);
    }
    const n = match('crossing', 'clem', 3);
    place(n, 0, bx + 500, by, 0);
    step(n, [{ op: Op.Move, x: bx - 1500, y: by }]);
    for (let t = 0; t < 20; t++) {
      step(n);
      expect(launched(n)).toBe(false);
    }
  });

  it('a hero thrown while walking past stays at the landing, then the cooldown runs', () => {
    const m = match('crossing', 'clem', 3);
    const w = m.world;
    const [bx, by, lx, ly] = CROSSING_BEDS[0];
    place(m, 0, bx - 2500, by, 0);
    step(m, [{ op: Op.Move, x: bx, y: by }]);
    let up = false;
    for (let t = 0; t < 30 && !up; t++) {
      step(m);
      up = launched(m);
    }
    expect(up).toBe(true);
    for (let t = 0; t < BOING.flight + 5; t++) step(m);
    expect([w.x[0], w.y[0]]).toEqual([lx, ly]);
    expect([w.moveX[0], w.moveY[0]]).toEqual([lx, ly]);
    expect(w.boingT[0]).toBeGreaterThan(0);
  });
  it('a touch stick crossing a bed more than 60° off its throw is never thrown, not even when the thumb lets go on it', () => {
    const thrown: string[] = [];
    let walks = 0;
    for (const map of ['crossing', 'hearthwood'] as const) {
      const probe = match(map, 'clem', 7);
      const n = bedCount(probe.world);
      const g = createGrid();
      for (let bed = 0; bed < n; bed++) {
        const b = new Int32Array(4);
        bedOf(probe.world, bed, b);
        const throwA = Math.atan2(b[3] - b[1], b[2] - b[0]);
        // from 15° outside the cone: commands quantise goals to 250 mm and the stick's look-ahead shrinks to about 1.1 m
        // between sends, so the sim's heading wobbles up to ~10° around the stick's
        for (let deg = CONE + 15; deg <= 180; deg += 15) {
          for (const side of [1, -1]) {
            const a = throwA + side * ((deg * Math.PI) / 180);
            const dx = Math.cos(a);
            const dy = Math.sin(a);
            for (const off of [0, 400, 800, 1100]) {
              const px = b[0] - dy * off;
              const py = b[1] + dx * off;
              const [sx, sy, ex, ey] = [px - dx * 5000, py - dy * 5000, px + dx * 5000, py + dy * 5000].map(Math.round);
              let clear = true;
              bindMap(map === 'hearthwood' ? 1 : 0);
              for (let k = 0; k <= 20 && clear; k++) clear = walkable(g, cellOf(Math.round(sx + ((ex - sx) * k) / 20), Math.round(sy + ((ey - sy) * k) / 20)));
              bindMap(0);
              if (!clear) continue;
              for (const letGo of [false, true]) {
                walks++;
                const m = match(map, HERO_IDS[walks % HERO_IDS.length], 7);
                const w = m.world;
                place(m, 0, sx, sy, 0);
                let stopped = false;
                for (let tick = 0; tick < 150; tick++) {
                  const cmds: Command[] = [];
                  const near = d2(w.x[0], w.y[0], px, py) <= 250 * 250 || d2(w.x[0], w.y[0], b[0], b[1]) > d2(sx, sy, b[0], b[1]);
                  if (letGo && !stopped && d2(w.x[0], w.y[0], px, py) <= 400 * 400) {
                    cmds.push({ op: Op.Stop });
                    stopped = true;
                  } else if (!stopped && tick % EVERY === 0 && !near) {
                    cmds.push({ op: Op.Move, x: Math.round(w.x[0] + dx * AHEAD), y: Math.round(w.y[0] + dy * AHEAD) });
                  }
                  step(m, cmds);
                  if (launched(m)) {
                    thrown.push(`${map} bed ${bed} ${deg * side}° off ${off} ${letGo ? 'let go' : 'walk'}`);
                    break;
                  }
                }
                bindMap(0);
              }
            }
          }
        }
      }
    }
    expect(walks).toBeGreaterThan(150);
    expect(thrown).toEqual([]);
  });

  it('a fight on the cushion, then a pause there, does not throw; a fresh step off and back on from behind does', () => {
    const m = match('crossing', 'clem', 3);
    const w = m.world;
    const [bx, by] = CROSSING_BEDS[0];
    place(m, 0, bx, by, 0);
    place(m, 3, bx, by + 3000, 0);
    w.attackTimer[0] = 0;
    for (let t = 0; t < 30; t++) {
      step(m, t % 6 === 0 ? [{ op: Op.Attack, id: 3 }] : []);
      w.hp[3] = w.maxHp[3];
    }
    place(m, 3, bx - 30000, by + 20000, 0);
    step(m, [{ op: Op.Stop }]);
    for (let t = 0; t < BOING.stand * 4; t++) {
      step(m);
      expect(launched(m)).toBe(false);
    }
    expect(w.bedT[0]).toBe(-1);
    // off the disc (west, behind the eastward throw), then the stick east onto it again: thrown at once
    step(m, [{ op: Op.Move, x: bx - 3000, y: by }]);
    for (let t = 0; t < 40 && d2(w.x[0], w.y[0], bx, by) <= BOING.reach * BOING.reach; t++) step(m);
    expect(w.bedT[0]).toBe(0);
    let up = false;
    for (let t = 0; t < 30 && !up; t++) {
      step(m, t % EVERY === 0 ? [{ op: Op.Move, x: w.x[0] + AHEAD, y: by }] : []);
      up = launched(m);
    }
    expect(up).toBe(true);
  });

  it('a tap on the cushion from the side walks there and is thrown BOING.stand ticks after it stops', () => {
    const m = match('crossing', 'clem', 3);
    const w = m.world;
    const [bx, by] = CROSSING_BEDS[1]; // the sunny-side bed throws south: tap it from the east
    place(m, 0, bx + 4000, by, 0);
    step(m, [{ op: Op.Move, x: bx + 200, y: by }]);
    let stoppedAt = -1;
    let at = -1;
    for (let t = 1; t < 120 && at < 0; t++) {
      step(m);
      if (stoppedAt < 0 && w.order[0] === 0 && d2(w.x[0], w.y[0], bx, by) <= BOING.reach * BOING.reach) stoppedAt = t;
      if (launched(m)) at = t;
    }
    expect(stoppedAt).toBeGreaterThan(0);
    expect(at - stoppedAt).toBeGreaterThanOrEqual(BOING.stand - 1);
    expect(at - stoppedAt).toBeLessThanOrEqual(BOING.stand + 1);
  });
});
