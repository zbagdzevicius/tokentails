import { describe, expect, it } from 'vitest';
import { Modifier, Surface, type TrackDef } from '../../types';
import { STUNT } from '../../tuning';
import { buildTrack } from './build';
import { queryTrack, type TrackHit } from './query';
import { LOOP_K, LOOP_LP, LOOP_SHAPE, respawnSampleOf } from './stunt';
import { TRACKS, KITCHEN } from './tracks';
import { stuntLab } from '../../test/fixtures';

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };

describe('set pieces: build (SIM_VERSION 8)', () => {
  it('the loop ribbon is longer than its shadow (k ≤ 1) and ends where the shadow ends', () => {
    expect(LOOP_K).toBeLessThanOrEqual(1);
    expect(LOOP_K).toBeGreaterThan(0.5);
    expect(LOOP_LP).toBeGreaterThan(STUNT.loop.zone);
    expect(2 * LOOP_SHAPE.lead + 2 * Math.PI * LOOP_SHAPE.c).toBeCloseTo(STUNT.loop.zone, 6);
    // the way up and the way down pass each other with the decks apart (corkscrew sway): find the crossing in side view
    const { R, c, A } = LOOP_SHAPE;
    let th = 0.5;
    for (let k = 0; k < 60; k++) {
      const f = R * Math.sin(th) - c * (Math.PI - th);
      const df = R * Math.cos(th) + c;
      th -= f / df;
    }
    const sep = 2 * A * Math.sin(th);
    expect(sep).toBeGreaterThan(2 * STUNT.loop.deckHalfW + 1);
  });

  it('stunt lab: masks, footprints, lanes, strips and the jump drop are built', () => {
    const t = buildTrack(stuntLab());
    expect(t.pieceIssues).toEqual([]);
    expect(t.pieces.map((p) => p.kind)).toEqual(['jump', 'tunnel', 'wall', 'loop']);
    const [jump, tunnel, wall, loop] = t.pieces;
    // footprints
    for (const p of t.pieces) {
      expect(t.pieceAt[p.i0]).toBe(p.id + 1);
      expect(t.pieceAt[p.i1]).toBe(p.id + 1);
    }
    expect(t.pieceAt[loop.strip]).toBe(loop.id + 1);
    // the loop: zone length, strip = a full-width pad before it
    expect(loop.lenM).toBeCloseTo(STUNT.loop.zone, 0);
    const strip = t.pads.find((p) => Math.abs(p.i - (loop.strip + loop.i0) / 2) <= 1);
    expect(strip).toBeTruthy();
    expect(strip!.halfW).toBeGreaterThan(t.halfW[strip!.i]);
    // the jump: gap mask between the lips, deck lower past it, canyon floor in the query
    let gaps = 0;
    for (let i = 0; i < t.n; i++) gaps += t.gapMask[i];
    expect(gaps * t.step).toBeGreaterThan(jump.gap - 1.2);
    expect(gaps * t.step).toBeLessThan(jump.gap + 0.2);
    expect(t.gapMask[jump.i0]).toBe(0);
    expect(t.gapMask[jump.i1]).toBe(0);
    expect(jump.lipY - jump.landY).toBeCloseTo(jump.drop, 1);
    const mid = (jump.i0 + jump.i1) >> 1;
    queryTrack(t, t.px[mid], t.pz[mid], mid, hit);
    expect(hit.y).toBeLessThan(t.py[mid] - 10);
    // the tunnel: mask only
    for (let i = tunnel.i0; i <= tunnel.i1; i++) expect(t.tunnelMask[i]).toBe(1);
    expect(t.tunnelMask[tunnel.i0 - 1]).toBe(0);
    // the wall ride: a lane on the outer side (the first bend turns left: its outside is the right), wall moved out
    expect(wall.side).toBe(1);
    const c = (wall.i0 + wall.i1) >> 1;
    expect(t.laneR[c]).toBeCloseTo(STUNT.wall.lane, 5);
    expect(t.laneL[c]).toBe(0);
    expect(t.wallR[c]).toBeCloseTo(t.halfW[c] + STUNT.wall.lane + STUNT.wall.rail, 5);
    const d = t.halfW[c] + 3;
    queryTrack(t, t.px[c] - t.tz[c] * d, t.pz[c] + t.tx[c] * d, c, hit);
    expect(hit.surface).toBe(Surface.WallRide);
    queryTrack(t, t.px[c] + t.tz[c] * d, t.pz[c] - t.tx[c] * d, c, hit);
    expect(hit.surface).not.toBe(Surface.WallRide);
    // tapers: the lane grows from 0 at its ends
    expect(t.laneR[wall.i0]).toBe(0);
    expect(t.laneR[wall.i1]).toBe(0);
    // no line coins on a loop or over a gap
    for (const coin of t.coins) {
      const pc = t.pieceAt[coin.i];
      if (pc) expect(t.pieces[pc - 1].kind).toMatch(/wall|tunnel/);
    }
  });

  it('Mirror flips the wall side (the corkscrew follows the mirrored right vector)', () => {
    const a = buildTrack(stuntLab());
    const b = buildTrack(stuntLab(), Modifier.Mirror);
    expect(b.pieceIssues).toEqual([]);
    expect(b.pieces[2].side).toBe(-a.pieces[2].side);
    const c = (b.pieces[2].i0 + b.pieces[2].i1) >> 1;
    expect(b.laneL[c]).toBeGreaterThan(5);
  });

  it('respawns never land inside a loop or a gap', () => {
    const t = buildTrack(stuntLab());
    const [jump, , , loop] = t.pieces;
    const [r1, f1] = respawnSampleOf(t, (loop.i0 + loop.i1) >> 1);
    expect(t.pieceAt[r1]).toBe(0);
    expect(f1).toBe(STUNT.loop.floor);
    const [r2] = respawnSampleOf(t, (jump.i0 + jump.i1) >> 1);
    expect(t.gapMask[r2]).toBe(0);
    expect((r2 - jump.i1 + t.n) % t.n).toBeGreaterThan(0);
    const [r3, f3] = respawnSampleOf(t, 10);
    expect(r3).toBe(10);
    expect(f3).toBe(0);
  });

  it('bad placements are skipped and reported, never built', () => {
    const def = (p: TrackDef['setPieces']): TrackDef => stuntLab({ setPieces: p });
    expect(buildTrack(def([{ kind: 'loop', s: 2 }])).pieceIssues[0]).toMatch(/start/);
    expect(buildTrack(def([{ kind: 'loop', s: 100 }])).pieceIssues[0]).toMatch(/bends/);
    expect(buildTrack(def([{ kind: 'tunnel', s: 40, len: 16 }, { kind: 'jump', s: 45 }])).pieceIssues[0]).toMatch(/overlaps/);
    const withFork = buildTrack({ ...KITCHEN, setPieces: [{ kind: 'tunnel', s: 56, len: 10 }] });
    expect(withFork.pieceIssues[0]).toMatch(/fork/);
    expect(buildTrack(def([])).pieces).toEqual([]);
  });

  it('every authored track builds its set pieces with no issues', () => {
    for (const def of TRACKS)
      for (const mods of [0, Modifier.Mirror]) {
        const t = buildTrack(def, mods);
        expect(t.pieceIssues, `${def.id} ${mods}`).toEqual([]);
        expect(t.pieces.length, def.id).toBe(def.setPieces?.length ?? 0);
      }
    // the Engine step's reference: one of each kind on Kitchen Counter
    expect(buildTrack(KITCHEN).pieces.map((p) => p.kind).sort()).toEqual(['jump', 'loop', 'tunnel', 'wall']);
  });
});
