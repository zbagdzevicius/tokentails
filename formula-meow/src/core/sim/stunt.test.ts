/**
 * Set-piece sim rules (SIM_VERSION 8, SETPIECES.md section 11) on the deterministic "stunt lab" (src/test/fixtures.ts):
 * a 50cc kart with auto-gas clears every piece with zero steering, with noisy steering, and as the phone bot; the loop
 * keeps laps exact and is lap-time neutral; the aimed arc lands on target; the net costs ≤ 0.8 s; hits pass by.
 */
import { describe, expect, it } from 'vitest';
import { Modifier, type RaceEvent, type TickInput, type TrackDef } from '../../types';
import { PHYS, STUNT } from '../../tuning';
import { raceConfig, stuntLab, world } from '../../test/fixtures';
import { createSimPlugins } from '../../items-ai';
import { playerBot } from '../../items-ai/balance/bots';
import { GO_TICK, type SimWorld } from './world';
import { applyHit, placeOnTrack, speedOf } from './kart';
import { followLine } from './autopilot';
import { simulate, ReplayRecorder } from './replay';
import type { BuiltPiece } from '../track/stunt';
import { KITCHEN } from '../track/tracks/kitchen';

const input = (p: Partial<TickInput> = {}): TickInput => ({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false, ...p });

/** A solo 50cc kart on `def`, past GO, set down `back` m before main sample `at` at speed v0. */
function soloAt(def: TrackDef, at: number, back: number, v0: number, cls: 0 | 1 | 2 = 0, mods = 0): SimWorld {
  const w = world({ ...raceConfig(def, { humans: [0], solo: true, cls }), modifiers: mods });
  while (w.tick < GO_TICK) w.step([input()]);
  const t = w.track;
  const k = w.st.karts[0];
  const i = (at - Math.round(back / t.step) + t.n) % t.n;
  placeOnTrack(w.ctx, k, i, 0);
  k.vx = t.tx[i] * v0;
  k.vz = t.tz[i] * v0;
  k.dist = i * t.step;
  k.progDist = k.dist;
  return w;
}

/** Drive until the kart is `past` m beyond the piece's last sample (or a time limit); the events of the run. */
function driveThrough(w: SimWorld, pc: BuiltPiece, past: number, steer: (w: SimWorld, tick: number) => TickInput): { events: RaceEvent[]; ok: boolean; ticks: number } {
  const t = w.track;
  const k = w.st.karts[0];
  const from = w.st.events.length;
  const endDist = k.dist + ((pc.end - ((k.si + t.n) % t.n) + t.n) % t.n) * t.step + past;
  let n = 0;
  while (k.dist < endDist && n < 60 * 20) {
    w.step([steer(w, n)]);
    n++;
  }
  return { events: w.st.events.slice(from), ok: k.dist >= endDist, ticks: n };
}

const count = (ev: RaceEvent[], type: RaceEvent['type'], f: (e: RaceEvent) => boolean = () => true) => ev.filter((e) => e.type === type && f(e)).length;

/** A cheap seeded noise for the "noisy thumb" bot (test only). */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const KINDS = ['jump', 'tunnel', 'wall', 'loop'] as const;

describe('set pieces: a 50cc kart with auto-gas clears every piece (SIM_VERSION 8)', () => {
  for (const kind of KINDS)
    it(`${kind}: zero steering, no respawn, no net, no head-on, out the far side`, () => {
      const lab = stuntLab();
      const w0 = world(raceConfig(lab, { solo: true }));
      const pc = w0.track.pieces.find((p) => p.kind === kind)!;
      for (const v0 of [6, 18, 24]) {
        const w = soloAt(lab, pc.kind === 'loop' ? pc.strip : pc.i0, 30, v0);
        const r = driveThrough(w, pc, 15, () => input({ gas: true }));
        expect(r.ok, `${kind} v0 ${v0}`).toBe(true);
        expect(count(r.events, 'respawn'), `${kind} v0 ${v0}`).toBe(0);
        expect(count(r.events, 'netCatch')).toBe(0);
        expect(count(r.events, 'wall', (e) => e.a === 2)).toBe(0);
        if (kind === 'loop') {
          expect(count(r.events, 'stuntEnter', (e) => e.a === 0)).toBe(1);
          expect(count(r.events, 'stuntExit', (e) => e.a === 0 && e.b === 1)).toBe(1);
        }
        if (kind === 'jump') expect(count(r.events, 'stuntLand')).toBe(1);
        if (kind === 'wall') expect(count(r.events, 'stuntEnter', (e) => e.a === 1)).toBe(1);
      }
    });

  for (const kind of KINDS)
    it(`${kind}: noisy steering (a wobbly thumb), 3 seeds, still clean`, () => {
      const lab = stuntLab();
      const w0 = world(raceConfig(lab, { solo: true }));
      const pc = w0.track.pieces.find((p) => p.kind === kind)!;
      for (const seed of [1, 2, 3]) {
        const rnd = noise(seed * 7919);
        let st = 0;
        const w = soloAt(lab, pc.kind === 'loop' ? pc.strip : pc.i0, 40, 20);
        const r = driveThrough(w, pc, 15, (ww) => {
          // a thumb that follows the road but wanders ±3 of 7 around it
          const o = input();
          followLine(ww.ctx, 0, o, 0);
          st += (rnd() - 0.5) * 2;
          st = Math.max(-3, Math.min(3, st));
          o.steer = Math.max(-7, Math.min(7, Math.round(o.steer + st)));
          o.gas = true;
          return o;
        });
        expect(r.ok, `${kind} seed ${seed}`).toBe(true);
        expect(count(r.events, 'respawn'), `${kind} seed ${seed}`).toBe(0);
        expect(count(r.events, 'netCatch')).toBe(0);
        expect(count(r.events, 'wall', (e) => e.a === 2), `${kind} seed ${seed}`).toBe(0);
      }
    });

  it('the phone bot (auto-gas, one-thumb drift, skill 0.2) laps the lab 3 times: every piece entered and exited, nothing failed', () => {
    for (const seed of [1, 2, 3]) {
      const cfg = raceConfig(stuntLab(), { seed, humans: [5] });
      const w = world(cfg);
      while (!w.done && w.tick < 60 * 200) {
        const o = playerBot(w.ctx, 5, 0.2);
        if (w.tick >= GO_TICK) o.gas = true;
        w.step([o]);
      }
      // the race up to the finish line (a kart drives on after it, and may take the gap once more)
      const finAt = (kk: number) => w.st.events.find((e) => e.kart === kk && e.type === 'finish')?.tick ?? Infinity;
      const ev = w.st.events.filter((e) => e.kart === 5 && e.tick <= finAt(5));
      expect(w.st.karts[5].finished, `seed ${seed}`).toBe(1);
      expect(count(ev, 'respawn'), `seed ${seed}`).toBe(0);
      expect(count(ev, 'netCatch')).toBe(0);
      expect(count(ev, 'stuntExit', (e) => e.a === 0 && e.b === 1)).toBe(3);
      expect(count(ev, 'stuntLand')).toBe(3);
      // every kart in the field went round the loop and over the gap every lap
      for (let k = 0; k < 8; k++) {
        const fin = w.st.karts[k].finished;
        if (!fin) continue;
        expect(count(w.st.events.filter((e) => e.kart === k && e.tick <= finAt(k)), 'stuntExit', (e) => e.a === 0)).toBe(3);
      }
      expect(count(w.st.events, 'netCatch')).toBe(0);
    }
  });
});

describe('set pieces: loop rail', () => {
  it('on the rail: speed floor, |sd| ≤ 2, no wrong way or watchdog even with no gas and full steer, exit boost', () => {
    const lab = stuntLab();
    const w = soloAt(lab, 0, 0, 0);
    const pc = w.track.pieces.find((p) => p.kind === 'loop')!;
    const w2 = soloAt(lab, pc.i0, 3, 10);
    const k = w2.st.karts[0];
    const from = w2.st.events.length;
    let railTicks = 0;
    let n = 0;
    while (n++ < 400) {
      w2.step([input({ steer: 7, gas: false })]);
      if (k.rail > 0) {
        railTicks++;
        expect(Math.hypot(k.vx, k.vz)).toBeGreaterThanOrEqual(STUNT.loop.floor * 24 - 1e-9);
        expect(Math.abs(k.sd)).toBeLessThanOrEqual(STUNT.loop.maxSd);
        expect(k.air).toBe(0);
      } else if (railTicks > 0) break;
    }
    const ev = w2.st.events.slice(from);
    expect(railTicks).toBeGreaterThan(60);
    expect(count(ev, 'wrongWay') + count(ev, 'respawn')).toBe(0);
    expect(count(ev, 'stuntExit', (e) => e.b === 1)).toBe(1);
    expect(k.boostTicks).toBeGreaterThan(0);
    expect(k.rail).toBe(0);
    void pc;
  });

  it('a drift entering the loop ends and pays its mini-turbo at once; hits and contacts pass by on the rail', () => {
    const lab = stuntLab();
    const w = soloAt(lab, 0, 0, 0);
    const pc = w.track.pieces.find((p) => p.kind === 'loop')!;
    const w2 = soloAt(lab, pc.i0, 2, 20);
    const k = w2.st.karts[0];
    k.driftDir = 1;
    k.driftTier = 2;
    k.driftCharge = 100;
    const from = w2.st.events.length;
    let n = 0;
    while (k.rail === 0 && n++ < 30) w2.step([input({ gas: true, drift: true, steer: 6 })]);
    expect(k.rail).toBe(pc.id + 1);
    expect(k.driftDir).toBe(0);
    expect(count(w2.st.events.slice(from), 'miniTurbo')).toBe(1);
    expect(applyHit(w2.ctx, 0, 'spin', 3)).toBe(false);
    expect(k.spinTicks).toBe(0);
  });

  it('laps stay exact across loops (3 laps, the lap count and distance agree)', () => {
    const w = world(raceConfig(stuntLab(), { humans: [0], solo: true }));
    let n = 0;
    while (!w.done && n++ < 60 * 150) {
      const o = input();
      if (w.tick >= GO_TICK) followLine(w.ctx, 0, o, 0);
      w.step([o]);
    }
    const k = w.st.karts[0];
    expect(k.finished).toBe(1);
    expect(count(w.st.events, 'lap')).toBe(2);
    expect(count(w.st.events, 'stuntExit', (e) => e.a === 0)).toBe(3);
    expect(k.dist).toBeGreaterThanOrEqual(3 * w.track.length);
  });

  it('is lap-time neutral (±0.3 s) against the same straight without the loop', () => {
    const lab = stuntLab();
    const flat = stuntLab({ setPieces: lab.setPieces!.filter((p) => p.kind !== 'loop') });
    const time = (def: TrackDef, v0: number): number => {
      const w = soloAt(def, Math.round((150 / 256) * 1224), 0, v0);
      const k = w.st.karts[0];
      const target = k.dist + (55 / 256) * w.track.length;
      const t0 = w.tick;
      while (k.dist < target && w.tick - t0 < 3000) w.step([input({ gas: true })]);
      return (w.tick - t0) / 60;
    };
    for (const v0 of [18, 24]) expect(Math.abs(time(lab, v0) - time(flat, v0))).toBeLessThanOrEqual(0.3);
  });
});

describe('set pieces: jump gap', () => {
  /** Launch over the lab's jump at speed v (gas held), with the far deck `drop` lower: where it lands, metres past the far lip. */
  function landAt(v: number, drop: number, cls: 0 | 1 | 2 = 0): { past: number; events: RaceEvent[]; pc: BuiltPiece; apex: number; vLand: number } {
    const def = stuntLab({ setPieces: [{ kind: 'jump', s: 24, gap: 10, drop }] });
    const w = soloAt(def, 0, 0, 0, cls);
    const pc = w.track.pieces[0];
    const w2 = soloAt(def, pc.i0, 1.5, v, cls);
    const k = w2.st.karts[0];
    const from = w2.st.events.length;
    let n = 0;
    let wasAir = false;
    let past = NaN;
    let apex = -99;
    let vLand = 0;
    while (n++ < 300) {
      w2.step([input({ gas: true })]);
      if (k.air) {
        wasAir = true;
        apex = Math.max(apex, k.y - pc.lipY);
      } else if (wasAir) {
        past = ((k.si - pc.i1 + w2.track.n) % w2.track.n) * w2.track.step;
        vLand = speedOf(k);
        break;
      }
    }
    return { past, events: w2.st.events.slice(from), pc, apex, vLand };
  }

  it('SIM_VERSION 9 hang time: every flight peaks STUNT.jump.apex over the lip and lands where its air speed puts it, inside the window', () => {
    for (const drop of [0, 1.5, 2.5])
      for (const v of [0, 8, 18, 24, 32, 43]) {
        const { past, events, apex } = landAt(v, drop, v > 32 ? 2 : 0);
        expect(count(events, 'netCatch'), `v ${v} drop ${drop}`).toBe(0);
        expect(count(events, 'stuntLand'), `v ${v} drop ${drop}`).toBe(1);
        expect(Math.abs(apex - STUNT.jump.apex), `v ${v} drop ${drop} apex ${apex}`).toBeLessThanOrEqual(0.15);
        const top = v > 32 ? 32 : 24;
        const vh = Math.max(v, STUNT.jump.floor * top);
        const g = PHYS.gravity;
        const vy0 = Math.sqrt(2 * g * STUNT.jump.apex);
        const T = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * drop)) / g;
        const lo = (10 + STUNT.jump.landMin) / T;
        const hi = (10 + STUNT.jump.aim + STUNT.jump.land - STUNT.jump.landMargin) / T;
        const vAir = Math.max(lo, Math.min(hi, vh));
        // (the lip is detected up to a tick late and the touchdown sample rounds forward: within 4 m)
        expect(Math.abs(past - (vAir * T - 10)), `v ${v} drop ${drop}: ${past}`).toBeLessThanOrEqual(4);
        expect(past, `v ${v} drop ${drop}`).toBeGreaterThan(0);
        expect(past, `v ${v} drop ${drop}`).toBeLessThan(STUNT.jump.aim + STUNT.jump.land);
      }
  });

  it('SIM_VERSION 9: a fast kart gets its run-up speed back on landing', () => {
    const { events, vLand } = landAt(43, 0, 2);
    expect(count(events, 'stuntLand')).toBe(1);
    expect(vLand).toBeGreaterThan(40);
  });

  it('the catch net costs at most 0.8 s against a clean jump, and the kart is set down past the far lip', () => {
    const def = stuntLab({ setPieces: [{ kind: 'jump', s: 24, gap: 10, drop: 1.5 }] });
    const run = (fail: boolean): { t: number; nets: number; past: number } => {
      const w = soloAt(def, 0, 0, 0);
      const pc = w.track.pieces[0];
      const w2 = soloAt(def, pc.i0, 20, 18);
      const k = w2.st.karts[0];
      const target = k.dist + 20 + 40;
      const from = w2.st.events.length;
      const t0 = w2.tick;
      let past = -1;
      while (k.dist < target && w2.tick - t0 < 1200) {
        w2.step([input({ gas: true })]);
        // a failed jump: the kart drops out of the arc right after the lip (as if it had been knocked down)
        if (fail && k.gapLaunch > 0 && k.airTicks === 3) k.vy = -6;
        if (past < 0 && w2.st.events.slice(from).some((e) => e.type === 'netCatch') && k.netTicks === 0) past = ((k.si - pc.i1 + w2.track.n) % w2.track.n) * w2.track.step;
      }
      return { t: (w2.tick - t0) / 60, nets: count(w2.st.events.slice(from), 'netCatch'), past };
    };
    const clean = run(false);
    const failed = run(true);
    expect(clean.nets).toBe(0);
    expect(failed.nets).toBe(1);
    expect(failed.past).toBeGreaterThan(0);
    expect(failed.t - clean.t).toBeLessThanOrEqual(0.8);
    expect(failed.t).toBeGreaterThan(clean.t);
  });

  it('in the air after a gap launch nothing hits the kart', () => {
    const def = stuntLab({ setPieces: [{ kind: 'jump', s: 24, gap: 10, drop: 0 }] });
    const w = soloAt(def, 0, 0, 0);
    const pc = w.track.pieces[0];
    const w2 = soloAt(def, pc.i0, 1.5, 20);
    const k = w2.st.karts[0];
    let n = 0;
    while (k.gapLaunch === 0 && n++ < 20) w2.step([input({ gas: true })]);
    expect(k.gapLaunch).toBe(pc.id + 1);
    expect(applyHit(w2.ctx, 0, 'leap', 2)).toBe(false);
  });
});

describe('set pieces: wall ride', () => {
  it('holding the turn rides the lane: boosted, held by the magnet, a soft rail (no head-on, no speed loss on it)', () => {
    const lab = stuntLab();
    const w = soloAt(lab, 0, 0, 0);
    const pc = w.track.pieces.find((p) => p.kind === 'wall')!;
    const w2 = soloAt(lab, pc.i0, 10, 22);
    const k = w2.st.karts[0];
    const from = w2.st.events.length;
    let onLane = 0;
    let n = 0;
    while (n++ < 240) {
      // steer outward onto the lane, then do nothing: the magnet keeps the kart there
      w2.step([input({ gas: true, steer: n < 30 ? 4 : 0 })]);
      if (k.surface === 6) {
        onLane++;
        expect(k.boostTicks).toBeGreaterThan(0);
      }
    }
    const ev = w2.st.events.slice(from);
    expect(onLane).toBeGreaterThan(60);
    expect(count(ev, 'wall', (e) => e.a === 2)).toBe(0);
    expect(count(ev, 'stuntEnter', (e) => e.a === 1)).toBe(1);
    expect(count(ev, 'stuntExit', (e) => e.a === 1)).toBe(1);
  });
  it('steering hard onto the lane mouth costs no speed (the taper and the rail are soft)', () => {
    const w = soloAt(KITCHEN, 0, 0, 0);
    const pc = w.track.pieces.find((p) => p.kind === 'wall')!;
    const w2 = soloAt(KITCHEN, pc.i0, 25, 22);
    const k = w2.st.karts[0];
    let vIn = 0;
    let minV = Infinity;
    for (let n = 0; n < 150; n++) {
      w2.step([input({ gas: true, steer: n < 60 ? 4 * pc.side : 0 })]);
      if (k.surface === 6) {
        if (!vIn) vIn = Math.hypot(k.vx, k.vz);
        minV = Math.min(minV, Math.hypot(k.vx, k.vz));
      }
    }
    expect(vIn).toBeGreaterThan(0);
    expect(minV).toBeGreaterThan(vIn - 1);
    expect(count(w2.st.events, 'wall', (e) => e.a === 2)).toBe(0);
  });
});

describe('set pieces: Kitchen Counter reference pieces', () => {
  it('the phone bot (skill 0.2, auto-gas) at every class and 3 seeds: 3 loops, 3 clean landings, no respawn or net for anyone', () => {
    for (const cls of [0, 1, 2] as const)
      for (const seed of [1, 2, 3]) {
        const w = world(raceConfig(KITCHEN, { seed, humans: [5], cls }));
        while (!w.done && w.tick < 60 * 240) {
          const o = playerBot(w.ctx, 5, 0.2);
          if (w.tick >= GO_TICK) o.gas = true;
          w.step([o]);
        }
        const ev = w.st.events;
        const me = ev.filter((e) => e.kart === 5);
        const tag = `cls ${cls} seed ${seed}`;
        expect(w.st.karts[5].finished, tag).toBe(1);
        expect(count(ev, 'respawn'), tag).toBe(0);
        expect(count(ev, 'netCatch'), tag).toBe(0);
        expect(count(ev, 'wall', (e) => e.a === 2 && e.kart === 5), tag).toBe(0);
        expect(count(me, 'stuntExit', (e) => e.a === 0 && e.b === 1), tag).toBe(3);
        expect(count(me, 'stuntLand'), tag).toBe(3);
      }
  });
});

describe('set pieces: determinism (GDD 3.1)', () => {
  it('golden hash: stunt lab, seed 42, AI-only, 30 s after GO (every piece driven; lanes may update it, the integrator regenerates it)', () => {
    const w = world(raceConfig(stuntLab(), { seed: 42 }));
    while (w.tick < GO_TICK + 1800) w.step();
    expect(w.st.events.filter((e) => e.type === 'stuntExit' && e.a === 0).length).toBeGreaterThan(4);
    expect(w.hash()).toMatchInlineSnapshot(`4013595172`);
  });

  it('same seed and inputs → the same hashes, three times, also mirrored; a replay re-simulates exactly', () => {
    for (const mods of [0, Modifier.Mirror]) {
      const cfg = { ...raceConfig(stuntLab(), { seed: 21, humans: [5] }), modifiers: mods };
      const a = simulate(cfg, createSimPlugins(cfg));
      const b = simulate(cfg, createSimPlugins(cfg));
      const c = simulate(cfg, createSimPlugins(cfg));
      expect(a.hashes.length).toBeGreaterThan(30);
      expect(b.hashes).toEqual(a.hashes);
      expect(c.hashes).toEqual(a.hashes);
    }
    const cfg = raceConfig(stuntLab(), { seed: 9, humans: [5] });
    const w = world(cfg);
    const rec = new ReplayRecorder();
    while (!w.done) {
      const i = playerBot(w.ctx, 5, 0.5);
      rec.push(i);
      w.step([i]);
    }
    const again = simulate(cfg, createSimPlugins(cfg), rec.replay());
    expect(again.result.player.time).not.toBeNull();
    expect(again.result.player.time).toBe(w.result().player.time);
    expect(again.world.hash()).toBe(w.hash());
  });
});

describe('set pieces: SIM_VERSION 9 playtest fixes', () => {
  it('a kart in the outer part of the road with no steering is drawn onto the wall lane and exits it clean', () => {
    const def = stuntLab();
    const w0 = soloAt(def, 0, 0, 0);
    const pc = w0.track.pieces.find((p) => p.kind === 'wall')!;
    const side = pc.side || 1;
    const w = soloAt(def, pc.i0, 12, 22);
    const t = w.track;
    const k = w.st.karts[0];
    // the outer 40 % of the road on the lane's side, then hands off
    const i = k.si;
    const d = side * t.halfW[i] * 0.55;
    k.x += -t.tz[i] * d;
    k.z += t.tx[i] * d;
    const from = w.st.events.length;
    let onLane = 0;
    for (let n = 0; n < 60 * 5; n++) {
      w.step([input({ gas: true })]);
      if (k.surface === 6) onLane++;
    }
    const ev = w.st.events.slice(from);
    expect(onLane).toBeGreaterThan(30);
    expect(ev.some((e) => e.type === 'stuntExit' && e.a === 1 && e.b === 1)).toBe(true);
  });

  it('SIM_VERSION 10: a half-pipe (side 0) draws a hands-off kart onto the lane on its own side, left and right', () => {
    const def = stuntLab({ setPieces: [{ kind: 'wall', s: 20, len: 24, side: 0 }] });
    const w0 = soloAt(def, 0, 0, 0);
    expect(w0.track.pieceIssues).toEqual([]);
    const pc = w0.track.pieces.find((p) => p.kind === 'wall')!;
    expect(pc.side).toBe(0);
    for (const side of [-1, 1]) {
      const w = soloAt(def, pc.i0, 6, 14);
      const t = w.track;
      const k = w.st.karts[0];
      const i = k.si;
      const d = side * t.halfW[i] * 0.7;
      k.x += -t.tz[i] * d;
      k.z += t.tx[i] * d;
      let onLane = 0;
      let wrongSide = 0;
      for (let n = 0; n < 60 * 3; n++) {
        w.step([input({ gas: true })]);
        if (k.surface === 6) {
          onLane++;
          if (k.d * side < 0) wrongSide++;
        }
      }
      expect(onLane, `side ${side}`).toBeGreaterThan(30);
      expect(wrongSide, `side ${side}`).toBe(0);
    }
  });

  it('SIM_VERSION 10: a kart on a loop rail never picks up a box placed on the loop\'s shadow', () => {
    // an item row inside the loop zone (the validator now refuses it; an old track code can still carry one)
    const def = stuntLab({ features: [{ s: 0, kind: 'start' }, { s: 140, kind: 'items' }, { s: 168, kind: 'items' }] });
    let railed = 0;
    let total = 0;
    for (const seed of [1, 2, 3]) {
      const w = world(raceConfig(def, { seed }));
      const t = w.track;
      const loop = t.pieces.find((p) => p.kind === 'loop')!;
      expect(t.features.some((f) => f.kind === 'items' && (f.i - loop.i0 + t.n) % t.n <= (loop.i1 - loop.i0 + t.n) % t.n)).toBe(true);
      let seen = 0;
      while (!w.done && w.tick < 60 * 90) {
        w.step();
        for (; seen < w.st.events.length; seen++) {
          const e = w.st.events[seen];
          if (e.type !== 'itemPickup') continue;
          total++;
          if (w.st.karts[e.kart!].rail > 0) railed++;
        }
      }
    }
    expect(total).toBeGreaterThan(10);
    expect(railed).toBe(0);
  });

  it('tunnels emit stuntEnter and a clean stuntExit (a = 3), and have a boost pad', () => {
    const def = stuntLab();
    const w0 = soloAt(def, 0, 0, 0);
    const pc = w0.track.pieces.find((p) => p.kind === 'tunnel')!;
    const w = soloAt(def, pc.i0, 20, 20);
    const from = w.st.events.length;
    for (let n = 0; n < 60 * 4; n++) {
      const o = input();
      followLine(w.ctx, 0, o, 0);
      o.gas = true;
      w.step([o]);
    }
    const ev = w.st.events.slice(from);
    expect(ev.filter((e) => e.type === 'stuntEnter' && e.a === 3).length).toBe(1);
    expect(ev.filter((e) => e.type === 'stuntExit' && e.a === 3 && e.b === 1).length).toBe(1);
    expect(ev.some((e) => e.type === 'pad')).toBe(true);
  });

  it('holding brake past a gap never reverses the kart into the net', () => {
    const def = stuntLab({ setPieces: [{ kind: 'jump', s: 24, gap: 10, drop: 1.5 }] });
    const w0 = soloAt(def, 0, 0, 0);
    const pc = w0.track.pieces[0];
    const w = soloAt(def, pc.i0, 30, 20);
    const k = w.st.karts[0];
    let landedAt = -1;
    for (let n = 0; n < 60 * 4 && landedAt < 0; n++) {
      w.step([input({ gas: true })]);
      if (k.gapLaunch === 0 && !k.air && (k.si - pc.i1 + w.track.n) % w.track.n < 60) landedAt = n;
    }
    const from = w.st.events.length;
    for (let n = 0; n < 60 * 15; n++) w.step([input({ brake: true })]);
    expect(count(w.st.events.slice(from), 'netCatch')).toBe(0);
  });

  it('a pack of railed karts spreads along the ribbon when the lateral limit cannot separate them', async () => {
    const { railNudge } = await import('./stunt');
    const ks = [0, 0.4, 0.8].map((su) => ({ rail: 1, su: 10 + su, sd: 0 }) as unknown as Parameters<typeof railNudge>[0]);
    for (let n = 0; n < 60; n++) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) railNudge(ks[a], ks[b]);
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 3; b++) {
        const apart = Math.abs(ks[a].su - ks[b].su) >= 2.39 || Math.abs(ks[a].sd - ks[b].sd) >= 1.69;
        expect(apart, `${a}-${b}`).toBe(true);
      }
  });
});

describe('tricks you can actually do (SIM_VERSION 11, ITERATION-4.md F3)', () => {
  /** One run toward a lip from 30 m back at v0; a single tap at `tapAt` ticks relative to the launch tick (null = no
   * tap; the launch tick comes from a no-tap run of the same start, which is deterministic). */
  function lipRun(def: TrackDef, at: number, v0: number, tapAt: number | null, launchTick: number | null) {
    const w = soloAt(def, at, 30, v0);
    const k = w.st.karts[0];
    const from = w.st.events.length;
    let launch = -1;
    let land: { x: number; z: number } | null = null;
    let airAtTap = false;
    for (let n = 0; n < 60 * 4 && !land; n++) {
      const tap = tapAt != null && launchTick != null && n === launchTick + tapAt;
      if (tap) airAtTap = !!k.air;
      const before = w.st.events.length;
      w.step([input({ gas: true, drift: tap })]);
      for (let e = before; e < w.st.events.length; e++) {
        const ev = w.st.events[e];
        if (ev.kart !== 0) continue;
        if (ev.type === 'ramp' && launch < 0) launch = n;
        if (ev.type === 'land' && launch >= 0) land = { x: k.x, z: k.z };
      }
    }
    const ev = w.st.events.slice(from).filter((e) => e.kart === 0);
    return { launch, land, airAtTap, tricks: count(ev, 'trick'), trickLands: count(ev, 'trickLand'), hops: count(ev, 'hop') };
  }

  const lips = (): Array<[string, TrackDef, number]> => {
    const lab = stuntLab();
    const tl = world(raceConfig(lab, { solo: true })).track;
    const tk = world(raceConfig(KITCHEN, { solo: true })).track;
    const ramp = tk.ramps.find((r) => r.piece == null && r.d === 0)!;
    return [
      ['stunt lab jump gap', lab, tl.pieces.find((p) => p.kind === 'jump')!.i0],
      ['Kitchen ramp', KITCHEN, ramp.i],
    ];
  };

  it('a single tap anywhere from 0.1 s before the lip to 0.4 s after it is a trick (≥ 90 %), and pays on landing', () => {
    let tries = 0;
    let tricks = 0;
    for (const [name, def, at] of lips())
      for (const v0 of [16, 22]) {
        const base = lipRun(def, at, v0, null, null);
        expect(base.launch, `${name} v0 ${v0}`).toBeGreaterThan(0);
        expect(base.tricks).toBe(0);
        for (let o = -6; o <= 24; o += 2) {
          const r = lipRun(def, at, v0, o, base.launch);
          if (o > 0 && !r.airAtTap) continue; // a short ramp hop may land before 0.4 s
          tries++;
          if (r.tricks === 1 && r.trickLands === 1) tricks++;
        }
      }
    expect(tries).toBeGreaterThan(40);
    expect(tricks / tries).toBeGreaterThanOrEqual(0.9);
  });

  it('a tap just before the lip is buffered and swallows its hop: the kart lands where it lands with no tap (±0.5 m)', () => {
    for (const [name, def, at] of lips())
      for (const v0 of [16, 22]) {
        const base = lipRun(def, at, v0, null, null);
        for (const o of [-6, -4, -2, 0]) {
          const r = lipRun(def, at, v0, o, base.launch);
          const tag = `${name} v0 ${v0} tap ${o}`;
          expect(r.launch, tag).toBe(base.launch);
          expect(r.tricks, tag).toBe(1);
          expect(r.hops, tag).toBe(0);
          expect(Math.hypot(r.land!.x - base.land!.x, r.land!.z - base.land!.z), tag).toBeLessThanOrEqual(0.5);
        }
      }
  });

  it('the window closes 0.45 s after the lip; a tap well before the lip is only a hop', () => {
    const [, def, at] = lips()[0];
    const base = lipRun(def, at, 22, null, null);
    const late = lipRun(def, at, 22, 31, base.launch);
    if (late.airAtTap) expect(late.tricks).toBe(0);
    const early = lipRun(def, at, 22, -30, base.launch);
    expect(early.tricks).toBe(0);
    expect(early.hops).toBe(1);
  });
});
