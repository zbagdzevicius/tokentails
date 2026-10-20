/**
 * tracks-B set pieces (SIM_VERSION 8, SETPIECES.md sections 11–12): Yarn Canyon, Cat Café Chaos, Pink Paw Shelter
 * Sprint and the Living Room Rug kicker.
 * - every piece is placed (the build's checks and the validator pass), with the kinds and order of the placement table;
 * - the phone player (the player bot at skill 0.2 with auto-gas) at 50, 100 and 150cc on 3 seeds clears every piece
 *   first time: every loop ridden out clean, every jump landed, no respawn or net for the player, no net for anyone,
 *   no head-on wall hit for the player inside a piece (at most one anywhere);
 * - the Yarn yarn-ball gap catches a kart that comes up short and sets it down past the far lip (never at the fork);
 * - every piece has a tracks-B skin, the meshes stay finite and the set pieces still add at most the nets' draw call.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import type { RaceEvent, TickInput, TrackDef } from '../types';
import { STUNT } from '../tuning';
import { raceConfig, world } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { GO_TICK } from '../core/sim/world';
import { kartTuning, speedOf, type KartTuning } from '../core/sim/kart';
import { atan2L, cosL, sinL } from '../core/sim/fixed';
import { buildTrack } from '../core/track/build';
import { buildTrackMesh } from '../core/track/mesh';
import { themeOf } from '../core/track/themes';
import { branchFoot } from '../core/track/branch';
import { YARN } from '../core/track/tracks/yarn';
import { CAFE } from '../core/track/tracks/cafe';
import { SHELTER } from '../core/track/tracks/shelter';
import { RUG } from '../core/track/tracks/rug';
import { validateSetPieces } from '../ugc/editor/validate';
import { pieceSkin } from './skins';

const count = (ev: RaceEvent[], type: RaceEvent['type'], f: (e: RaceEvent) => boolean = () => true) => ev.filter((e) => e.type === type && f(e)).length;
const input = (p: Partial<TickInput> = {}): TickInput => ({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false, ...p });

const CIRCUITS: Array<[TrackDef, string[]]> = [
  [YARN, ['tunnel', 'jump', 'wall']],
  [CAFE, ['jump', 'wall', 'tunnel', 'loop']],
  [SHELTER, ['loop', 'tunnel', 'wall', 'jump']],
];

describe('tracks-B set pieces: placement', () => {
  for (const [def, kinds] of CIRCUITS)
    it(`${def.name}: ${kinds.join(', ')} placed in order, the validator passes, also mirrored`, () => {
      for (const mods of [0, 1]) {
        const t = buildTrack(def, mods);
        expect(t.pieceIssues, def.id).toEqual([]);
        expect(t.pieces.map((p) => p.kind)).toEqual(kinds);
        expect(validateSetPieces(def, t)).toEqual([]);
      }
    });

  it('the walls ride the outside of their bends', () => {
    for (const [def] of CIRCUITS) {
      const t = buildTrack(def, 0);
      for (const pc of t.pieces.filter((p) => p.kind === 'wall')) {
        let c = 0;
        for (let k = pc.i0; k !== pc.i1; k = (k + 1) % t.n) c += t.curv[k];
        // curvature + = a left turn: its outside is the right (+1)
        expect(pc.side, def.id).toBe(c >= 0 ? 1 : -1);
      }
    }
  });

  it('Yarn: the needle bridge stays open only before the strand jump (the jump has rails, the net is never pre-empted by a fall)', () => {
    const t = buildTrack(YARN, 0);
    const jump = t.pieces.find((p) => p.kind === 'jump')!;
    for (let k = jump.i0 - Math.round(8 / t.step); k !== jump.land1; k = (k + 1) % t.n) expect(t.voidMask[(k + t.n) % t.n], `sample ${k}`).toBe(0);
    expect(t.voidMask.some((v) => v === 1)).toBe(true);
  });

  it('Rug: one aimed kicker (a jump with no gap) on the frame ring, no void', () => {
    const t = buildTrack(RUG, 0);
    expect(t.pieceIssues).toEqual([]);
    expect(t.pieces.map((p) => [p.kind, p.gap])).toEqual([['jump', 0]]);
    expect(t.gapMask.every((v) => v === 0)).toBe(true);
    expect(t.ramps.filter((r) => r.piece === 0).length).toBe(1);
  });
});

describe('tracks-B set pieces: the phone player clears every piece first time', () => {
  for (const [def] of CIRCUITS)
    it(`${def.name}: skill 0.2 bot, auto-gas, 3 classes × 3 seeds`, { timeout: 600_000 }, () => {
      const t0 = buildTrack(def, 0);
      const loops = t0.pieces.filter((p) => p.kind === 'loop').length;
      const jumps = t0.pieces.filter((p) => p.kind === 'jump' && p.gap > 0).length;
      for (const cls of [0, 1, 2] as const)
        for (const seed of [1, 2, 3]) {
          const w = world(raceConfig(def, { seed, humans: [5], cls }));
          // head-on wall hits by the player inside a piece's footprint on the main road (SETPIECES.md section 11)
          let headOnInPiece = 0;
          while (!w.done && w.tick < 60 * 240) {
            const o = playerBot(w.ctx, 5, 0.2);
            if (w.tick >= GO_TICK) o.gas = true;
            const before = w.st.events.length;
            w.step([o]);
            const k = w.st.karts[5];
            for (let e = before; e < w.st.events.length; e++) {
              const ev = w.st.events[e];
              if (ev.kart === 5 && ev.type === 'wall' && ev.a === 2 && k.branch < 0 && w.track.pieceAt[k.si]) headOnInPiece++;
            }
          }
          const ev = w.st.events;
          const me = ev.filter((e) => e.kart === 5);
          const tag = `${def.id} cls ${cls} seed ${seed}`;
          expect(w.st.karts[5].finished, tag).toBe(1);
          expect(count(me, 'respawn'), tag).toBe(0);
          expect(count(ev, 'netCatch'), tag).toBe(0);
          expect(headOnInPiece, tag).toBe(0);
          // anywhere else (the play-room branch's drift corner, a bump) at most one
          expect(count(me, 'wall', (e) => e.a === 2), tag).toBeLessThanOrEqual(1);
          expect(count(me, 'stuntExit', (e) => e.a === 0 && e.b === 1), tag).toBe(loops * def.laps);
          expect(count(me, 'stuntLand'), tag).toBeGreaterThanOrEqual(jumps * def.laps);
        }
    });
});

describe('tracks-B: the Yarn yarn-ball gap catches a short kart (Y0)', () => {
  it('a slow kart on the branch drops into the hammock and is set down past the far lip at the net speed, on the branch', () => {
    const w = world(raceConfig(YARN, { humans: [0], solo: true }));
    while (w.tick < GO_TICK) w.step([input()]);
    const t = w.track;
    const b = t.branches[0];
    const g = b.gap!;
    expect(g).toBeTruthy();
    const k = w.st.karts[0];
    // set down on the branch just before the gap at a crawl (past the pad), coasting
    const j = Math.max(0, g.j0 - 2);
    k.x = b.px[j];
    k.z = b.pz[j];
    k.y = b.py[j];
    k.heading = atan2L(b.tx[j], b.tz[j]);
    k.vx = sinL(k.heading) * 4;
    k.vz = cosL(k.heading) * 4;
    k.si = b.mapI[j];
    k.branch = b.id;
    k.s = b.s0 + j * b.step * b.sk;
    k.dist = k.s;
    k.progDist = k.dist;
    let caught = false;
    let after = -1;
    for (let n = 0; n < 60 * 6; n++) {
      w.step([input({ gas: caught })]);
      if (!caught && w.st.events.some((e) => e.type === 'respawn')) caught = true;
      if (caught && after < 0 && k.respawnTicks === 0 && speedOf(k) > 1) {
        after = n;
        break;
      }
    }
    expect(caught).toBe(true);
    expect(after).toBeGreaterThan(0);
    // on the branch, past the far lip (not back at the fork), at about the net speed
    expect(k.branch).toBe(b.id);
    const foot = { j: 0, along: 0, d: 0 };
    expect(branchFoot(b, k.x, k.z, foot)).toBe(true);
    expect(foot.j).toBeGreaterThanOrEqual(g.j1);
    const kt: KartTuning = { top: 0, a0: 0, yawLow: 0, yawHigh: 0, weight: 0 };
    expect(speedOf(k)).toBeGreaterThan(STUNT.jump.netSpeed * kartTuning(w.ctx, 0, kt).top * 0.8);
  });
});

describe('tracks-B set pieces: skins and meshes', () => {
  it('every piece has a tracks-B skin; meshes are finite; still only the nets add a draw call', () => {
    for (const def of [YARN, CAFE, SHELTER, RUG]) {
      const t = buildTrack(def, 0);
      for (const pc of t.pieces) expect(pieceSkin(def.theme, pc.kind, pc.skin), `${def.id} ${pc.kind}`).not.toBeNull();
      const group = buildTrackMesh(t, themeOf(def.theme), { groundY: 0 });
      const ms: Mesh[] = [];
      group.traverse((o) => {
        if ((o as Mesh).isMesh) ms.push(o as Mesh);
      });
      let verts = 0;
      let bad = 0;
      for (const m of ms) {
        const a = m.geometry.getAttribute('position').array;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
        verts += a.length / 3;
      }
      expect(bad, def.id).toBe(0);
      const names = ms.map((m) => m.name).sort();
      expect(names.filter((n) => n !== 'track-nets').every((n) => n === 'track-solid' || n === 'track-glow'), def.id).toBe(true);
      // a bounded mesh (phone budget): the whole track with its skinned pieces under 400 k vertices
      expect(verts, def.id).toBeLessThan(400_000);
    }
  });
});
