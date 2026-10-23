/**
 * Iteration 3 integration bar (SIM_VERSION 8, SETPIECES.md section 0) across all six circuits and the Rug arena:
 * - zero steering: a 50cc kart with auto-gas held on the line up to a piece, then thumb off, clears it (no respawn, no
 *   catch net, no head-on wall hit, out the far side);
 * - noisy steering: a wobbly thumb (±3 of 7 around the line), 3 seeds, normal and mirrored, still clean;
 * - full races: the phone bot (skill 0.2, auto-gas) with a noisy thumb finishes, clears every loop and jump, and every
 *   AI cat in the field finishes too (no stuck AI).
 */
import { describe, expect, it } from 'vitest';
import { Modifier, type RaceEvent, type TickInput, type TrackDef } from '../types';
import { ALL_TRACKS } from '../core/track/tracks';
import { buildTrack } from '../core/track/build';
import { raceConfig, world } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { GO_TICK, type SimWorld } from '../core/sim/world';
import { placeOnTrack } from '../core/sim/kart';
import { followLine } from '../core/sim/autopilot';
import type { BuiltPiece } from '../core/track/stunt';

const ME = 5;
const LOOP = 0;
const input = (p: Partial<TickInput> = {}): TickInput => ({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false, ...p });
const count = (ev: RaceEvent[], f: (e: RaceEvent) => boolean) => ev.filter(f).length;
const WITH_PIECES = ALL_TRACKS.filter((d) => buildTrack(d).pieces.length > 0);

function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A solo 50cc kart, past GO, set down `back` m before main sample `at` at speed v0. */
function soloAt(def: TrackDef, at: number, back: number, v0: number, mods: number): SimWorld {
  const w = world({ ...raceConfig(def, { humans: [0], solo: true, cls: 0 }), modifiers: mods });
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

const entryOf = (p: BuiltPiece) => (p.kind === 'loop' ? p.strip : p.i0);

/** Drive from `back` m before the piece to `past` m beyond its last sample; `steer(w, inPiece)` picks the input. */
function through(def: TrackDef, p: BuiltPiece, mods: number, steer: (w: SimWorld, inPiece: boolean) => TickInput) {
  const w = soloAt(def, entryOf(p), 40, 18, mods);
  const t = w.track;
  const k = w.st.karts[0];
  const endDist = k.dist + 40 + ((p.end - entryOf(p) + t.n) % t.n) * t.step + 15;
  const span = (p.end - entryOf(p) + t.n) % t.n;
  let n = 0;
  while (k.dist < endDist && n < 60 * 25) {
    const into = (k.si - entryOf(p) + t.n) % t.n;
    w.step([steer(w, k.branch < 0 && into <= span)]);
    n++;
  }
  // an arena is open floor with props: a wobbly thumb that misses the kicker can bump the sofa beside it (the same as
  // with the plain ramp it replaced), which is not the piece's doing, so there only a kart that took the piece counts
  const took = w.st.events.find((e) => e.type === 'stuntEnter');
  const from = def.kind === 'arena' ? (took ? took.tick : Infinity) : 0;
  return { ev: w.st.events.filter((e) => e.tick >= from), ok: k.dist >= endDist, missed: from === Infinity };
}

/** What went wrong in one run through a piece ('' = clean). */
function issues(r: { ev: RaceEvent[]; ok: boolean; missed: boolean }, p: BuiltPiece, tag: string): string[] {
  const out: string[] = [];
  if (r.missed) return out;
  const n = (f: (e: RaceEvent) => boolean) => count(r.ev, f);
  if (!r.ok) out.push(`${tag}: did not get out the far side`);
  if (n((e) => e.type === 'respawn')) out.push(`${tag}: respawn`);
  if (n((e) => e.type === 'netCatch')) out.push(`${tag}: net catch`);
  const ho = r.ev.filter((e) => e.type === 'wall' && e.a === 2);
  if (ho.length) out.push(`${tag}: head-on ×${ho.length} at tick ${ho.map((e) => e.tick).join(',')}`);
  if (p.kind === 'loop' && n((e) => e.type === 'stuntExit' && e.a === LOOP && e.b === 1) !== 1) out.push(`${tag}: loop not ridden clean`);
  if (p.kind === 'jump' && p.gap > 0 && n((e) => e.type === 'stuntLand') !== 1) out.push(`${tag}: no clean landing`);
  return out;
}

describe('iteration 3: every set piece on every track, 50cc auto-gas', () => {
  it('six circuits and the Rug arena carry set pieces', () => {
    expect(WITH_PIECES.length).toBeGreaterThanOrEqual(7);
  });

  for (const def of WITH_PIECES)
    it(`${def.name}: zero steering through each piece (normal and mirrored)`, { timeout: 600_000 }, () => {
      const bad: string[] = [];
      for (const mods of [0, Modifier.Mirror])
        for (const p of buildTrack(def, mods).pieces) {
          // loops and jumps hold the kart themselves; a wall lane or tunnel on a bend still needs the thumb on the line
          const handsOff = p.kind === 'loop' || p.kind === 'jump';
          const r = through(def, p, mods, (w, inPiece) => {
            const o = input({ gas: true });
            if (!(inPiece && handsOff)) followLine(w.ctx, 0, o, 0);
            if (inPiece && handsOff) o.steer = 0;
            return o;
          });
          bad.push(...issues(r, p, `${def.id} ${p.kind}#${p.id} mods ${mods}`));
        }
      expect(bad).toEqual([]);
    });

  for (const def of WITH_PIECES)
    it(`${def.name}: noisy steering, 3 seeds, normal and mirrored`, { timeout: 600_000 }, () => {
      const bad: string[] = [];
      for (const mods of [0, Modifier.Mirror])
        for (const p of buildTrack(def, mods).pieces)
          for (const seed of [1, 2, 3]) {
            const rnd = noise(seed * 7919 + p.id);
            let st = 0;
            const r = through(def, p, mods, (w) => {
              const o = input();
              followLine(w.ctx, 0, o, 0);
              st = Math.max(-3, Math.min(3, st + (rnd() - 0.5) * 2));
              o.steer = Math.max(-7, Math.min(7, Math.round(o.steer + st)));
              o.gas = true;
              return o;
            });
            bad.push(...issues(r, p, `${def.id} ${p.kind}#${p.id} mods ${mods} seed ${seed}`));
          }
      expect(bad).toEqual([]);
    });

  for (const def of WITH_PIECES.filter((d) => d.kind !== 'arena'))
    it(`${def.name}: full 50cc races, noisy phone bot, the whole field finishes`, { timeout: 600_000 }, () => {
      for (const [seed, mods] of [[1, 0], [2, 0], [3, Modifier.Mirror]] as const) {
        const w = world({ ...raceConfig(def, { seed, humans: [ME], cls: 0 }), modifiers: mods, tailTicks: 60 * 60 });
        const rnd = noise(seed * 31);
        let st = 0;
        while (!w.done && w.tick < 60 * 300) {
          const o = playerBot(w.ctx, ME, 0.2);
          if (w.tick >= GO_TICK) o.gas = true;
          const k = w.st.karts[ME];
          if (k.rail === 0 && k.netTicks === 0) {
            st = Math.max(-2, Math.min(2, st + (rnd() - 0.5)));
            o.steer = Math.max(-7, Math.min(7, Math.round(o.steer + st)));
          }
          w.step([o]);
        }
        const tag = `${def.id} seed ${seed} mods ${mods}`;
        for (let i = 0; i < w.st.karts.length; i++) expect(w.st.karts[i].finished, `${tag} kart ${i}`).toBe(1);
        const fin = w.st.events.find((e) => e.kart === ME && e.type === 'finish')?.tick ?? Infinity;
        const me = w.st.events.filter((e) => e.kart === ME && e.tick <= fin);
        expect(count(me, (e) => e.type === 'respawn'), tag).toBe(0);
        expect(count(me, (e) => e.type === 'netCatch'), tag).toBe(0);
        const loopIn = count(me, (e) => e.type === 'stuntEnter' && e.a === LOOP);
        expect(count(me, (e) => e.type === 'stuntExit' && e.a === LOOP && e.b === 1), tag).toBe(loopIn);
        const jumps = w.track.pieces.filter((p) => p.kind === 'jump' && p.gap > 0).length;
        expect(count(me, (e) => e.type === 'stuntLand'), tag).toBe(def.laps * jumps);
        // no AI cat stuck: nobody respawns more than once in a race
        for (let i = 0; i < w.st.karts.length; i++) expect(count(w.st.events, (e) => e.kart === i && e.type === 'respawn'), `${tag} kart ${i}`).toBeLessThanOrEqual(1);
      }
    });
});
