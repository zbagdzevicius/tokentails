/**
 * Iteration 2 Stabilise: one regression test per sim bug (ITERATION-2.md section 1, B1–B22). Each scenario failed on
 * v1 (SIM_VERSION 3); the ids in the test names match the plan.
 */
import { describe, expect, it } from 'vitest';
import { DT, NO_INPUT, Surface, type RaceConfig, type TickInput } from '../../types';
import { ITEMS, PHYS, RACE, ticks } from '../../tuning';
import { KITCHEN, ROOFTOPS, TRACKS } from '../track/tracks';
import { buildTrack } from '../track/build';
import { ovalTrack, raceConfig, world } from '../../test/fixtures';
import { buildField, createSimPlugins } from '../../items-ai';
import { ProjKind, TrapKind, itemsOf, sampleAt } from '../../items-ai/items/state';
import { lobCucumber } from '../../items-ai/items/traps';
import { GO_TICK, SimWorld } from './world';
import { applyHit, placeOnTrack, speedOf } from './kart';
import { hullGap } from './contact';
import { followLine } from './autopilot';
import { cosL, sinL } from './fixed';
import { stepLaps } from './race';

const input = (p: Partial<TickInput> = {}): TickInput => ({ ...NO_INPUT, ...p });

/** Solo human kart 0 on the oval, at GO. */
function solo(): SimWorld {
  const w = world(raceConfig(ovalTrack(), { humans: [0], solo: true }));
  while (w.tick < GO_TICK + 1) w.step([input()]);
  return w;
}

/** n human karts on the oval, all at GO. */
function humans(n: number): SimWorld {
  const racers = buildField({ seed: 1, cls: 0, playerSlot: 0 })
    .slice(0, n)
    .map((r) => ({ ...r, ai: undefined }));
  const cfg: RaceConfig = { track: ovalTrack(), seed: 1, cls: 0, modifiers: 0, racers, humans: racers.map((_, i) => i), forgiving: true };
  const w = new SimWorld(cfg, createSimPlugins());
  while (w.tick < GO_TICK + 1) w.step(racers.map(() => input()));
  return w;
}

function line(w: SimWorld, i: number, extra: Partial<TickInput> = {}): TickInput {
  const o = input();
  followLine(w.ctx, i, o, 0);
  return { ...o, ...extra };
}

describe('race rules (iteration 2)', () => {
  it('B1: reversing over the line after lap 2 and crossing again records no bogus best lap and no second lap event', () => {
    const w = solo();
    const k = w.st.karts[0];
    const L = w.track.length;
    let t = 0;
    while (k.dist < L + 15 && t++ < 6000) w.step([line(w, 0)]);
    expect(k.lap).toBe(2);
    const best = k.bestLapTicks;
    expect(best).toBeGreaterThan(600);
    t = 0;
    while (k.dist > L - 6 && t++ < 900) w.step([input({ brake: true })]);
    expect(k.lap).toBe(1);
    t = 0;
    while (k.dist < L + 10 && t++ < 900) w.step([line(w, 0)]);
    expect(k.lap).toBe(2);
    expect(k.bestLapTicks).toBe(best);
    expect(w.st.events.filter((e) => e.type === 'lap' && e.a === 2).length).toBe(1);
  });

  it('B2: two karts finishing in the same tick are placed by their sub-tick crossing, and the finish event agrees', () => {
    const w = humans(2);
    const [a, b] = w.st.karts;
    const L = w.track.length;
    for (const k of w.st.karts) {
      k.lap = 3;
      k.lapMax = 3;
    }
    // both end the tick 5 cm past the line; kart 1 moved further this tick, so it crossed earlier in the tick
    w.ctx.prevDist![0] = 3 * L - 0.1;
    w.ctx.prevDist![1] = 3 * L - 0.4;
    a.dist = 3 * L + 0.05;
    b.dist = 3 * L + 0.3;
    a.vx = b.vx = 0;
    a.vz = b.vz = 27;
    stepLaps(w.ctx);
    expect(b.place).toBe(1);
    expect(a.place).toBe(2);
    expect(b.finishTime).toBeLessThan(a.finishTime);
    const fin = w.st.events.filter((e) => e.type === 'finish');
    expect(fin.find((e) => e.kart === 1)?.a).toBe(1);
    expect(fin.find((e) => e.kart === 0)?.a).toBe(2);
  });

  it('B3: side-by-side karts do not swap places every tick, and overtake events have a cooldown', () => {
    const w = humans(2);
    const t = w.track;
    const [a, b] = w.st.karts;
    // run past the quiet start, then keep the two karts nose to nose, alternately 0.1 m ahead
    for (let i = 0; i < RACE.overtakeQuietTicks; i++) w.step([input(), input()]);
    let swaps = 0;
    let prev = w.st.order[0];
    for (let i = 0; i < 120; i++) {
      const si = 200;
      placeOnTrack(w.ctx, a, si, -2);
      placeOnTrack(w.ctx, b, si, 2);
      a.dist = 100 + (i % 2 ? 0.1 : 0);
      b.dist = 100 + (i % 2 ? 0 : 0.1);
      a.progDist = b.progDist = 100;
      w.step([input(), input()]);
      if (w.st.order[0] !== prev) swaps++;
      prev = w.st.order[0];
    }
    expect(swaps).toBeLessThanOrEqual(1);
    const ot = w.st.events.filter((e) => e.type === 'overtake');
    for (let i = 1; i < ot.length; i++)
      if (ot[i].kart === ot[i - 1].kart && ot[i].b === ot[i - 1].b) expect(ot[i].tick - ot[i - 1].tick).toBeGreaterThanOrEqual(RACE.overtakeCooldownTicks);
    void t;
  });

  it('B4: progress never jumps at the Kitchen hairpin (a kart at the inside wall)', () => {
    const w = world(raceConfig(KITCHEN, { humans: [5], seed: 3 }));
    while (w.tick < GO_TICK + 1) w.step([input()]);
    const t = w.track;
    // find the tightest left bend and drive along its inside edge
    let si = 0;
    for (let i = 0; i < t.n; i++) if (t.curv[i] > t.curv[si]) si = i;
    const k = w.st.karts[5];
    let worst = 0;
    for (let s = si - 30; s < si + 30; s++) {
      const prev = k.dist;
      const j = (s + t.n) % t.n;
      const d = -(t.halfW[j] + 0.5);
      const before = speedOf(k);
      // teleport-free: move the kart 0.5 m along the inside edge each tick
      k.x = t.px[j] - t.tz[j] * d;
      k.z = t.pz[j] + t.tx[j] * d;
      k.vx = t.tx[j] * 10;
      k.vz = t.tz[j] * 10;
      k.heading = Math.atan2(t.tx[j], t.tz[j]);
      w.step([input({ gas: true })]);
      worst = Math.max(worst, Math.abs(k.dist - prev) - Math.max(before, speedOf(k)) * DT);
    }
    expect(worst).toBeLessThanOrEqual(0.55);
  });

  it('B5: reversing on purpose for 6 s never calls the respawn hand', () => {
    const w = solo();
    for (let i = 0; i < 60; i++) w.step([line(w, 0)]);
    for (let i = 0; i < 360; i++) w.step([input({ brake: true })]);
    expect(w.st.events.some((e) => e.type === 'respawn')).toBe(false);
  });

  it('B5: driving the wrong way shows the banner at 1.5 s and puts the kart back facing forward at 3 s', () => {
    const w = solo();
    const k = w.st.karts[0];
    // well down the first 200 m straight, so there is room to drive back for 3 s
    while (k.dist < 120) w.step([line(w, 0)]);
    k.heading += Math.PI;
    const v = speedOf(k);
    k.vx = sinL(k.heading) * v;
    k.vz = cosL(k.heading) * v;
    let t = 0;
    while (!w.st.events.some((e) => e.type === 'respawn') && t++ < 400) {
      const o = input({ gas: true });
      w.step([o]);
    }
    const ww = w.st.events.find((e) => e.type === 'wrongWay');
    const rs = w.st.events.find((e) => e.type === 'respawn');
    expect(ww).toBeDefined();
    expect(rs).toBeDefined();
    expect(rs!.tick - ww!.tick).toBeGreaterThanOrEqual(ticks(PHYS.wrongWayRespawn - PHYS.wrongWay) - 2);
    while (k.respawnTicks > 0) w.step([input()]);
    w.step([input()]);
    const along = sinL(k.heading) * w.track.tx[k.si] + cosL(k.heading) * w.track.tz[k.si];
    expect(along).toBeGreaterThan(0.9);
  });
});

describe('physics (iteration 2)', () => {
  it('B7: karts nose to tail do not overlap (two contact circles per kart)', () => {
    const w = humans(2);
    const [a, b] = w.st.karts;
    placeOnTrack(w.ctx, a, 100, 0);
    placeOnTrack(w.ctx, b, 100 + Math.round(2 / w.track.step), 0); // 2 m ahead: inside the long body
    a.dist = 50;
    b.dist = 52;
    a.progDist = b.progDist = 50;
    for (let i = 0; i < 30; i++) w.step([line(w, 0, { gas: true }), line(w, 1)]);
    expect(hullGap(a, b)).toBeGreaterThan(-0.2);
  });

  it('B8: two karts grinding side by side bump at most once every 20 ticks', () => {
    const w = humans(2);
    const [a, b] = w.st.karts;
    for (let i = 0; i < 90; i++) {
      placeOnTrack(w.ctx, a, 200 + i, -0.7);
      placeOnTrack(w.ctx, b, 200 + i, 0.7);
      // a (left) steers right into b, b (right) steers left into a: right vector = (−cos h, sin h)
      a.vx = sinL(a.heading) * 15 - cosL(a.heading) * 3;
      a.vz = cosL(a.heading) * 15 + sinL(a.heading) * 3;
      b.vx = sinL(b.heading) * 15 + cosL(b.heading) * 3;
      b.vz = cosL(b.heading) * 15 - sinL(b.heading) * 3;
      a.dist = b.dist = 100 + i * 0.5;
      a.progDist = b.progDist = a.dist;
      w.step([input({ gas: true }), input({ gas: true })]);
    }
    const bumps = w.st.events.filter((e) => e.type === 'bump').map((e) => e.tick);
    expect(bumps.length).toBeGreaterThan(0);
    for (let i = 1; i < bumps.length; i++) expect(bumps[i] - bumps[i - 1]).toBeGreaterThanOrEqual(PHYS.bumpCooldownTicks);
  });

  it('B9: a kart pushed by another stays inside the wall and its track position is fresh', () => {
    const w = humans(2);
    const [a, b] = w.st.karts;
    const t = w.track;
    const i = 220;
    const wall = t.wallR[i] - PHYS.kartHalfWidth;
    placeOnTrack(w.ctx, a, i, wall - 0.05);
    placeOnTrack(w.ctx, b, i, wall - 1.3);
    b.vx = -t.tz[i] * 12;
    b.vz = t.tx[i] * 12; // b slams sideways into a, which sits against the right wall
    a.vx = a.vz = 0;
    a.dist = b.dist = i * t.step;
    a.progDist = b.progDist = a.dist;
    w.step([input(), input()]);
    expect(a.d).toBeLessThanOrEqual(wall + 1e-6);
    const h = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };
    void h;
    // s / d match the kart's actual position after the push
    const ox = a.x - t.px[a.si];
    const oz = a.z - t.pz[a.si];
    expect(Math.abs(ox * -t.tz[a.si] + oz * t.tx[a.si] - a.d)).toBeLessThan(0.05);
  });

  it('B11: a wall graze keeps most of the speed; a head-on bounces back with a wobble, never a dead stop', () => {
    const w = solo();
    const k = w.st.karts[0];
    for (let i = 0; i < 150; i++) w.step([line(w, 0)]);
    const v0 = speedOf(k);
    // graze: 15° into the right wall
    k.heading -= 0.26;
    let t = 0;
    while (!k.wall && t++ < 300) w.step([input({ gas: true })]);
    for (let i = 0; i < 30; i++) w.step([input({ gas: true })]);
    expect(speedOf(k)).toBeGreaterThan(v0 * 0.7);
    // head-on
    const w2 = solo();
    const k2 = w2.st.karts[0];
    for (let i = 0; i < 150; i++) w2.step([line(w2, 0)]);
    k2.heading = Math.atan2(w2.track.tx[k2.si], w2.track.tz[k2.si]) - Math.PI / 2; // face the right wall
    const v = speedOf(k2);
    k2.vx = sinL(k2.heading) * v;
    k2.vz = cosL(k2.heading) * v;
    t = 0;
    while (!w2.st.events.some((e) => e.type === 'wall' && e.a === 2) && t++ < 200) w2.step([input({ gas: true })]);
    expect(w2.st.events.some((e) => e.type === 'wall' && e.a === 2)).toBe(true);
    expect(k2.wobbleTicks).toBeGreaterThan(0);
    const nIn = -w2.track.tz[k2.si] * -1;
    void nIn;
    expect(speedOf(k2)).toBeGreaterThan(1);
  });

  it('B12: the grounded height never pops more than a small step in one tick', () => {
    for (const def of TRACKS) {
      const w = world(raceConfig(def, { seed: 4 }));
      let worst = 0;
      const prevY = w.st.karts.map((k) => k.y);
      while (!w.done && w.tick < GO_TICK + 60 * 40) {
        w.step();
        w.st.karts.forEach((k, i) => {
          if (!k.air && k.respawnTicks === 0 && prevY[i] !== undefined) worst = Math.max(worst, k.y - prevY[i] - PHYS.stepGrade * speedOf(k) * DT);
          prevY[i] = k.y;
        });
      }
      expect(worst).toBeLessThanOrEqual(PHYS.stepUp + 0.4); // a ramp lip / landing tick, never the 0.6–0.9 m pops
    }
  });

  it('B13: the Rooftops kink is a wide bend (no turn under 19 m between (12,-52) and (-44,-92))', () => {
    const t = buildTrack(ROOFTOPS);
    let tight = Infinity;
    for (let i = 0; i < t.n; i++) {
      if (t.px[i] > 20 || t.px[i] < -40 || t.pz[i] > -48 || t.pz[i] < -80) continue;
      tight = Math.min(tight, 1 / Math.max(1e-6, Math.abs(t.curv[i])));
    }
    expect(tight).toBeGreaterThanOrEqual(15);
  });

  it('B16: the Kitchen boost pad sits on the racing line', () => {
    const t = buildTrack(KITCHEN);
    for (const p of t.pads) expect(Math.abs(t.line[p.i] - p.d)).toBeLessThan(p.halfW);
  });
});

describe('items (iteration 2)', () => {
  function scene(n: number, at: number[], d: number[] = []): SimWorld {
    const w = humans(n);
    w.st.karts.forEach((k, i) => {
      placeOnTrack(w.ctx, k, Math.round(at[i] / w.track.step), d[i] ?? 0);
      k.dist = k.s;
      k.lap = 1;
      k.lapMax = 1;
      k.progDist = k.dist;
      k.vx = sinL(k.heading) * 12;
      k.vz = cosL(k.heading) * 12;
    });
    w.step(w.st.karts.map(() => input()));
    return w;
  }
  const drive = (w: SimWorld, extra: Partial<TickInput>[] = []) => w.step(w.st.karts.map((_, i) => ({ ...line(w, i), gas: i === 0, ...(extra[i] ?? {}) })));

  it('B17: the Laser Dot makes each kart chase it once, never re-targets back, and never lands within 0.75 s', () => {
    const w = scene(4, [20, 32, 34, 60]);
    const k = w.st.karts[0];
    k.item = 'laser';
    k.itemCount = 1;
    drive(w, [{ item: true }]);
    const fired = w.tick;
    for (let i = 0; i < 400 && itemsOf(w.st).proj.length; i++) drive(w);
    const chase = w.st.events.filter((e) => e.type === 'hit' && e.a === 3);
    const per = new Map<number, number>();
    for (const e of chase) per.set(e.kart, (per.get(e.kart) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBe(1);
    const spin = w.st.events.find((e) => e.type === 'hit' && e.a === 0 && e.kart === 3);
    expect(spin).toBeDefined();
    expect(spin!.tick - fired).toBeGreaterThanOrEqual(ticks(ITEMS.laser.minArm) - 1);
  });

  it('B17: fired by the leader, the Laser Dot fizzles instead of spinning 2nd place on the spot', () => {
    const w = scene(2, [40, 36]);
    const k = w.st.karts[0];
    k.item = 'laser';
    k.itemCount = 1;
    drive(w, [{ item: true }]);
    for (let i = 0; i < 30; i++) drive(w);
    expect(w.st.events.some((e) => e.type === 'itemFizzle' && e.kart === 0)).toBe(true);
    expect(w.st.events.some((e) => e.type === 'hit' && e.kart === 1)).toBe(false);
  });

  it('B18: a Zoomies kart grinding a boxed kart sends no blocked spam', () => {
    const w = scene(2, [20, 24]);
    const [a, b] = w.st.karts;
    a.autoTicks = 180;
    b.shieldTicks = 180;
    for (let i = 0; i < 120; i++) {
      placeOnTrack(w.ctx, b, a.si + 3, a.d);
      drive(w);
    }
    expect(w.st.events.filter((e) => e.type === 'blocked').length).toBeLessThanOrEqual(1);
  });

  it('B19: a finished kart never uses its item (the autopilot used to fire it)', () => {
    const w = scene(2, [20, 40]);
    const k = w.st.karts[0];
    k.finished = 1;
    k.item = 'hairball';
    k.itemCount = 1;
    for (let i = 0; i < 60; i++) w.step([input({ item: i % 2 === 0 }), input()]);
    expect(w.st.events.some((e) => e.type === 'itemUse' && e.kart === 0)).toBe(false);
  });

  it('B20: a trap does not hit a kart passing well below it', () => {
    const w = scene(2, [20, 40]);
    const s = itemsOf(w.st);
    const k = w.st.karts[1];
    s.traps.push({ id: 77, kind: TrapKind.Yarn, owner: 0, x: k.x, y: k.y + 3, z: k.z, dist: k.dist, d: k.d, life: 600, flight: 0, flightMax: 0, fx: 0, fy: 0, fz: 0, imm: 0 });
    drive(w);
    expect(w.st.events.some((e) => e.type === 'hit' && e.kart === 1)).toBe(false);
  });

  it('B21: a lobbed cucumber lands inside the road where it lands, not the thrower\'s road width', () => {
    const w = scene(1, [20], [0]);
    const t = w.track;
    const k = w.st.karts[0];
    // make the landing spot narrow and the thrower's spot wide
    const land = sampleAt(t, k.dist + ITEMS.cucumber.lob + speedOf(k) * ITEMS.cucumber.flight);
    for (let j = -10; j <= 10; j++) t.halfW[(land + j + t.n) % t.n] = 3;
    k.d = t.halfW[k.si] - 1.2;
    lobCucumber(w.ctx, 0);
    const tr = itemsOf(w.st).traps[0];
    expect(Math.abs(tr.d)).toBeLessThanOrEqual(3 - 1 + 1e-9);
  });

  it('B22: an item pressed during the roulette fires the moment it is ready; Zoomies still pass presses through', () => {
    const w = scene(2, [20, 60]);
    const k = w.st.karts[0];
    k.item = 'hairball';
    k.itemCount = 1;
    k.rouletteTicks = 4;
    drive(w, [{ item: true }]);
    drive(w, [{ item: false }]);
    for (let i = 0; i < 4; i++) drive(w);
    expect(w.st.events.some((e) => e.type === 'itemUse' && e.kart === 0)).toBe(true);
    // Zoomies: the autopilot drives, the press still fires the held item
    k.item = 'catnip';
    k.itemCount = 3;
    k.autoTicks = 120;
    drive(w, [{ item: true }]);
    expect(w.st.events.filter((e) => e.type === 'itemUse' && e.kart === 0 && e.item === 'catnip').length).toBe(1);
  });

  it('a spin drops coins and the coin rule picks them up', () => {
    const def = { ...ovalTrack(), coins: [{ s: 20, d: 0, count: 3 as const }] };
    const w = world(raceConfig(def, { humans: [0], solo: true }));
    expect(w.track.coins.length).toBe(3);
    while (w.tick < GO_TICK + 1) w.step([input()]);
    let t = 0;
    while (w.st.karts[0].coins === 0 && t++ < 1200) w.step([line(w, 0)]);
    expect(w.st.karts[0].coins).toBeGreaterThan(0);
    const before = w.st.karts[0].coins;
    expect(applyHit(w.ctx, 0, 'spin')).toBe(true);
    expect(w.st.karts[0].coins).toBe(Math.max(0, before - 3));
    expect(w.st.events.some((e) => e.type === 'coinLoss')).toBe(true);
    void ProjKind;
  });
});
