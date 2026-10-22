/**
 * Ghost duels end to end in the sim (iteration 4, F9): a run recorded as a time trial, as a field race and as a duel
 * (the lone kart) replays in `traceGhost` to the same finish (within a tick), its progress log is non-decreasing, and
 * the live gap against itself reads zero. The `dare10` fixture (an older build's link) opens as a target-time race.
 */
import { describe, expect, it } from 'vitest';
import { packInput, SIM_VERSION, type RaceMode, type TrackDef } from '../types';
import { SimWorld } from '../core/sim/world';
import { createSimPlugins } from '../items-ai';
import { playerBot } from '../items-ai/balance/bots';
import { registerModesRules } from '../modes/sim-rules';
import { ovalTrack } from '../test/fixtures';
import { decodeGhost, encodeGhostSync, peekGhost, trackKey, type GhostHeader } from './codec/ghost-codec';
import { duelable, duelGap, shadowConfig, traceGhost } from './links/duel';
import { dareRace } from './links/dare-flow';
import { LEGACY } from '../../review/v3-legacy-codes';

registerModesRules();

const track: TrackDef = { ...ovalTrack([{ s: 140, kind: 'items' }]), laps: 3 };

/** Race `h` with the phone bot in the recorded slot; the inputs up to the finish and the recomputed finish (s). */
function record(h: Omit<GhostHeader, 'ticks' | 'simVersion'>): { inputs: number[]; finish: number } {
  const cfg = shadowConfig({ ...h, simVersion: SIM_VERSION, ticks: 0 }, track, 'Rec', null);
  const w = new SimWorld(cfg, createSimPlugins(cfg));
  const me = cfg.humans[0];
  const inputs: number[] = [];
  while (!w.done && w.tick < 60 * 240) {
    const o = playerBot(w.ctx, me, 0.6);
    inputs.push(packInput(o));
    w.step([o]);
    if (w.st.karts[me].finished) break;
  }
  const k = w.st.karts[me];
  expect(k.finished).toBeTruthy();
  return { inputs: [...inputs, 0x17, 0x17], finish: k.finishTime / 60 };
}

describe('ghost duels replay (F9)', () => {
  const cases: Array<[string, Omit<GhostHeader, 'ticks' | 'simVersion'>]> = [
    ['a time trial', { trackKey: trackKey(track.id), seed: 1, cls: 1, modifiers: 0, forgiving: false, slot: 0, mode: 'tt' as RaceMode }],
    ['a field race', { trackKey: trackKey(track.id), seed: 9, cls: 1, modifiers: 0, forgiving: false, slot: 5, mode: 'race' as RaceMode, rival: 2 }],
    ['a duel run sent back', { trackKey: trackKey(track.id), seed: 9, cls: 1, modifiers: 0, forgiving: false, slot: 0, mode: 'dare' as RaceMode, solo: true }],
  ];
  for (const [name, h] of cases)
    it(`${name}: the traced ghost finishes at the recorded time (±1 tick) and its gap to itself is zero`, async () => {
      const rec = record(h);
      const g = await decodeGhost(encodeGhostSync(h, rec.inputs));
      expect(g).not.toBeNull();
      expect(duelable(g!)).toBe(true);
      const tr = await traceGhost(g!, track, { chunk: Infinity });
      expect(tr).not.toBeNull();
      expect(Math.abs(tr!.finish! - rec.finish)).toBeLessThanOrEqual(1 / 60);
      for (let i = 1; i < tr!.ticks; i++) expect(tr!.dist[i]).toBeGreaterThanOrEqual(tr!.dist[i - 1]);
      const mid = tr!.go + 600;
      expect(Math.abs(duelGap(tr!, mid, tr!.dist[mid])!)).toBeLessThanOrEqual(1 / 60);
    });

  it('dare10 (an older build) opens as a target-time race; a dare of this build opens as a duel', () => {
    const old = peekGhost(LEGACY.dare10)!;
    expect(old.simVersion).toBe(10);
    expect(duelable(old)).toBe(false);
    expect(dareRace(old, false)).toEqual({ mode: 'dare', solo: false });
    const now = peekGhost(LEGACY.dare11)!;
    if (now.simVersion === SIM_VERSION) {
      expect(dareRace(now, false)).toEqual({ mode: 'dare', solo: true });
      expect(dareRace({ ...now, mode: 'tt' }, false)).toEqual({ mode: 'tt', solo: true });
    }
  });

  it('the dare11 fixture is a real run of this build: its ghost finishes (it used to be a v10 run restamped, a DNF)', async () => {
    const g = (await decodeGhost(LEGACY.dare11))!;
    expect(g.simVersion).toBe(SIM_VERSION);
    const { KITCHEN } = await import('../core/track/tracks/kitchen');
    const tr = await traceGhost(g, KITCHEN);
    expect(tr?.finish).not.toBeNull();
  });
});
