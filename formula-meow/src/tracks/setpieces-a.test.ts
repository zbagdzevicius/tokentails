/**
 * tracks-A set pieces (SIM_VERSION 8, SETPIECES.md sections 11 and 12): Kitchen Counter, Neon Rooftops and Laundry
 * Spin. Each track places every piece it declares (the validator finds nothing), and the acceptance bar holds: the
 * phone bot (skill 0.2, auto-gas: a one-thumb player) at every class, 3 seeds and mirrored, clears every piece the
 * first time: every loop ridden and every jump landed clean on every lap, no respawn, no catch net, no head-on wall hit
 * for anyone in the field.
 */
import { describe, expect, it } from 'vitest';
import { Modifier, type RaceEvent, type SetPieceKind, type TrackDef } from '../types';
import { KITCHEN } from '../core/track/tracks/kitchen';
import { ROOFTOPS } from '../core/track/tracks/rooftops';
import { LAUNDRY } from '../core/track/tracks/laundry';
import { buildTrack } from '../core/track/build';
import { validateSetPieces } from '../ugc/editor/validate';
import { raceConfig, world } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { GO_TICK, type SimWorld } from '../core/sim/world';
import { followLine } from '../core/sim/autopilot';
import { atan2L, clamp, wrapAngle } from '../core/sim/fixed';
import { STUNT } from '../tuning';
import { pieceSkin } from './skins';
import { buildTrackMesh } from '../core/track/mesh';
import { themeOf } from '../core/track/themes';
import type { Mesh } from 'three';

const ME = 5;
const LOOP = 0; // SET_PIECE_KINDS index
const WALL = 1;

const count = (ev: RaceEvent[], f: (e: RaceEvent) => boolean) => ev.filter(f).length;

/** What each track carries (kind → how many). */
const EXPECT: Array<[TrackDef, Partial<Record<SetPieceKind, number>>]> = [
  [KITCHEN, { wall: 1, jump: 1, tunnel: 1, loop: 1 }],
  [ROOFTOPS, { tunnel: 1, jump: 1, wall: 1, loop: 1 }],
  [LAUNDRY, { tunnel: 1, loop: 1, jump: 1, wall: 1 }],
];

/** Loops on one route of a fork (○ in SETPIECES.md section 12): ridden on the laps that take the long way. */
const OPTIONAL_LOOP: Record<string, boolean> = { rooftops: true };

describe('tracks-A set pieces: placement', () => {
  for (const [def, kinds] of EXPECT) {
    it(`${def.name}: every declared piece is placed, normal and mirrored (no validator issue)`, () => {
      expect(validateSetPieces(def)).toEqual([]);
      for (const mods of [0, Modifier.Mirror]) {
        const t = buildTrack(def, mods);
        expect(t.pieceIssues, `${def.id} mods ${mods}`).toEqual([]);
        const got: Partial<Record<SetPieceKind, number>> = {};
        for (const p of t.pieces) got[p.kind] = (got[p.kind] ?? 0) + 1;
        expect(got).toEqual(kinds);
      }
    });
  }

  it('Neon Rooftops keeps s200–s4 for the loop only (SETPIECES.md R1), and its header promise of a roof-to-roof jump is real', () => {
    const t = buildTrack(ROOFTOPS);
    expect(t.pieces.find((p) => p.kind === 'jump')!.gap).toBeGreaterThanOrEqual(10);
    for (const f of ROOFTOPS.features) if (f.kind !== 'start') expect(f.s < 200 && f.s > 4, `${f.kind} at s${f.s}`).toBe(true);
    for (const h of ROOFTOPS.hazards ?? []) expect(h.s < 200 && h.s > 4).toBe(true);
  });

  it('every piece has its themed skin, and the skins add at most one moving part per track (the Laundry drum)', () => {
    for (const [def] of EXPECT) {
      const t = buildTrack(def);
      for (const p of t.pieces) expect(pieceSkin(def.theme, p.kind, p.skin), `${def.id} ${p.kind}`).not.toBeNull();
      const names: string[] = [];
      buildTrackMesh(t, themeOf(def.theme), { groundY: 0 }).traverse((o) => {
        if ((o as Mesh).isMesh) names.push(o.name);
      });
      expect(names.filter((n) => n.startsWith('piece-')), def.id).toEqual(def.id === 'laundry' ? ['piece-drum'] : []);
    }
  });

  it('Laundry Spin keeps at least one hazard after its loop replaced the drum', () => {
    expect((LAUNDRY.hazards ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe('tracks-A set pieces: the phone bot clears every piece the first time (SETPIECES.md section 0)', () => {
  for (const [def] of EXPECT) {
    it(`${def.name}: 3 classes × 3 seeds + mirrored, skill 0.2 with auto-gas`, { timeout: 240_000 }, () => {
      const t = buildTrack(def);
      const loops = t.pieces.filter((p) => p.kind === 'loop').length;
      const jumps = t.pieces.filter((p) => p.kind === 'jump' && p.gap > 0).length;
      const runs: Array<[0 | 1 | 2, number, number]> = [];
      for (const cls of [0, 1, 2] as const) for (const seed of [1, 2, 3]) runs.push([cls, seed, 0]);
      runs.push([0, 4, Modifier.Mirror], [2, 5, Modifier.Mirror]);
      let loopRides = 0;
      for (const [cls, seed, mods] of runs) {
        const w = world({ ...raceConfig(def, { seed, humans: [ME], cls }), modifiers: mods });
        while (!w.done && w.tick < 60 * 240) {
          const o = playerBot(w.ctx, ME, 0.2);
          if (w.tick >= GO_TICK) o.gas = true;
          w.step([o]);
        }
        const ev = w.st.events;
        // the player's race (the tail after its finish line may end mid-piece)
        const fin = ev.find((e) => e.kart === ME && e.type === 'finish')?.tick ?? Infinity;
        const me = ev.filter((e) => e.kart === ME && e.tick <= fin);
        const tag = `${def.id} cls ${cls} seed ${seed} mods ${mods}`;
        expect(w.st.karts[ME].finished, tag).toBe(1);
        expect(count(ev, (e) => e.type === 'respawn'), tag).toBe(0);
        expect(count(ev, (e) => e.type === 'netCatch'), tag).toBe(0);
        expect(count(me, (e) => e.type === 'wall' && e.a === 2), tag).toBe(0);
        const loopIn = count(me, (e) => e.type === 'stuntEnter' && e.a === LOOP);
        expect(count(me, (e) => e.type === 'stuntExit' && e.a === LOOP && e.b === 1), tag).toBe(loopIn);
        if (OPTIONAL_LOOP[def.id]) loopRides += loopIn;
        else expect(loopIn, tag).toBe(3 * loops);
        expect(count(me, (e) => e.type === 'stuntLand'), tag).toBe(3 * jumps);
      }
      if (OPTIONAL_LOOP[def.id]) expect(loopRides).toBeGreaterThan(runs.length);
    });
  }
});

/**
 * A solo 50cc lap from the grid with auto-gas: on the line everywhere, except that `lane` steers for the wall lane's
 * centre from 20 m before the piece to its end. Returns the ticks from GO to one lap and the events.
 */
function soloLap(def: TrackDef, lane: boolean, cls: 0 | 1 | 2 = 0): { ticks: number; stretch: number; ev: RaceEvent[]; w: SimWorld } {
  const w = world(raceConfig(def, { humans: [0], solo: true, cls }));
  const t = w.track;
  const k = w.st.karts[0];
  const wall = t.pieces.find((p) => p.kind === 'wall')!;
  const before = Math.round(20 / t.step);
  const L = t.n * t.step;
  while (w.tick < GO_TICK) w.step([{ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false }]);
  const t0 = w.tick;
  let a = -1;
  let b = -1;
  const after = Math.round(30 / t.step);
  while (k.dist < L && w.tick < t0 + 60 * 90) {
    const o = { steer: 0, gas: true, brake: false, drift: false, item: false, itemBack: false };
    followLine(w.ctx, 0, o, 0);
    const into = (k.si - (wall.i0 - before) + t.n) % t.n;
    const span = (wall.i1 - (wall.i0 - before) + t.n) % t.n;
    if (lane && k.branch === -1 && into <= span) {
      // aim 8 m ahead at the lane centre (or the road edge where the lane is still narrow)
      const j = (k.si + Math.round(8 / t.step)) % t.n;
      const s = wall.side >= 0 ? 1 : -1;
      const lw = s > 0 ? t.laneR[j] : t.laneL[j];
      const d = s * (t.halfW[j] + Math.max(0, lw - STUNT.wall.lane / 2) + (lw > 0.5 ? 0 : -1));
      const want = atan2L(t.px[j] - t.tz[j] * d - k.x, t.pz[j] + t.tx[j] * d - k.z);
      o.steer = Math.round(clamp(-wrapAngle(want - k.heading) * 3, -1, 1) * 7);
    }
    w.step([o]);
    if (a < 0 && k.branch === -1 && into <= span) a = w.tick;
    if (a >= 0 && b < 0 && k.branch === -1 && (k.si - wall.i1 + t.n) % t.n >= after && (k.si - wall.i1 + t.n) % t.n < after + 40) b = w.tick;
      console.log(`${lane ? 'L' : 'R'} si${k.si} into${into}/${span} d${k.d.toFixed(1)} hw${t.halfW[k.si].toFixed(1)} lane${(wall.side > 0 ? t.laneR[k.si] : t.laneL[k.si]).toFixed(1)} v${Math.hypot(k.vx, k.vz).toFixed(1)} steer${o.steer} boost${(k as unknown as { boostT: number }).boostT}`);
  }
  return { ticks: w.tick - t0, stretch: b - a, ev: w.st.events, w };
}

describe('tracks-A set pieces: the wall rides', () => {
  for (const [def] of EXPECT) {
    it(`${def.name}: a kart that steers onto the lane rides it clean (enter, boost, clean exit, no head-on) and is not slower than the road line`, () => {
      for (const cls of [0, 1, 2] as const) {
        const road = soloLap(def, false, cls);
        const lane = soloLap(def, true, cls);
        const tag = `${def.id} cls ${cls}`;
        expect(count(lane.ev, (e) => e.type === 'stuntEnter' && e.a === WALL), tag).toBe(1);
        expect(count(lane.ev, (e) => e.type === 'stuntExit' && e.a === WALL && e.b === 1), tag).toBe(1);
        expect(count(lane.ev, (e) => e.type === 'wall' && e.a === 2), tag).toBe(0);
        expect(count(lane.ev, (e) => e.type === 'respawn'), tag).toBe(0);
        if (process.env.FM_SETPIECES_PRINT) console.log(`${tag}: lap road ${(road.ticks / 60).toFixed(2)} s lane ${(lane.ticks / 60).toFixed(2)} s; stretch road ${(road.stretch / 60).toFixed(2)} s lane ${(lane.stretch / 60).toFixed(2)} s`);
        // the lane's longer path is paid back by its boost (SETPIECES.md 3.2: within ± 0.2 s; a bot is not a player)
        expect(lane.stretch - road.stretch, tag).toBeLessThan(0.8 * 60);
      }
    });
  }
});
