// Balance: style points are raw, so even a trick-heavy run moves the score only a little and the star targets stay
// fair. A synthetic heavy run through Sunny Meadow: a clean DOUBLE SPIN on every jump (every log, rock, gap edge,
// chasm and air bell), every fish, pickup and bell in the chain, a near miss under every branch, both vaults in style,
// and the chain held until it reaches 60 (then banked) - must add less than 12% of meadow's scoreTarget.
import { describe, expect, it } from 'vitest';
import { PathBuilder } from '../core/path';
import { makeRng } from '../core/rng';
import { Track } from '../core/track';
import type { PieceSpec } from '../core/types';
import { gorge } from '../stages/gorge';
import { meadow } from '../stages/meadow';
import { sunset } from '../stages/sunset';
import { ComboChain } from './chain';
import { setPiecePoints, trickPoints, trickWeight, WEIGHTS } from './points';
import { rankFor } from './rank';

const SHOW = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.STYLE_BALANCE;
type Ev = { s: number; kind: 'jump' | 'fish' | 'pickup' | 'bell' | 'near' | 'set' };

function heavyRun(stage: typeof meadow, chainCap = 60): { points: number; jumps: number; distance: number; bestChain: number } {
  const t = new Track();
  const pieces: PieceSpec[] = stage.build!(new PathBuilder(t, stage.start), makeRng(1));
  const evs: Ev[] = [];
  for (const p of pieces) {
    if (p.type === 'log' || p.type === 'rock' || p.type === 'edge' || p.type === 'bell' || p.type === 'riverrock' || p.type === 'driftlog' || p.type === 'bamboo')
      evs.push({ s: p.s, kind: 'jump' });
    if (p.type === 'bell') evs.push({ s: p.s, kind: 'bell' });
    if (p.type === 'fish') for (let i = 0; i < Number(p.params?.n ?? 5); i++) evs.push({ s: p.s + i, kind: 'fish' });
    if (p.type === 'yarn' || p.type === 'treat' || p.type === 'ring') evs.push({ s: p.s, kind: 'pickup' });
    if (p.type === 'branch') evs.push({ s: p.s, kind: 'near' });
    if (['vault', 'wallrun', 'river', 'cloud', 'dog', 'yarnchase'].includes(p.type)) evs.push({ s: p.s + (p.len ?? 0), kind: 'set' });
  }
  for (const seg of t.segments) if (seg.kind === 'gap') evs.push({ s: seg.s0, kind: 'jump' });
  evs.sort((a, b) => a.s - b.s);
  const c = new ComboChain();
  let jumps = 0;
  for (const e of evs) {
    if (e.kind === 'jump') {
      jumps++;
      const p = trickPoints('DOUBLE', c.tier);
      c.addStyle(p);
      c.tricks++;
      c.add(trickWeight('DOUBLE'));
    } else if (e.kind === 'fish') c.add(WEIGHTS.fish, false);
    else if (e.kind === 'pickup') c.add(WEIGHTS.pickup, false);
    else if (e.kind === 'bell') c.add(WEIGHTS.bell);
    else if (e.kind === 'near') c.add(WEIGHTS.nearMiss);
    else {
      c.addStyle(setPiecePoints(c.tier));
      c.add(WEIGHTS.setPiece);
    }
    if (c.n >= chainCap) c.bank();
  }
  c.bank();
  return { points: c.stylePoints, jumps, distance: t.length, bestChain: c.bestChain };
}

/** a run with no tricks at all, in time order (the 3 s window drains between events): every fish, pickup and bell, a
 *  near miss under every branch, both set pieces cleared; returns the best tier reached */
function noTrickRun(stage: typeof meadow): { bestTier: number; bestChain: number } {
  const t = new Track();
  const pieces: PieceSpec[] = stage.build!(new PathBuilder(t, stage.start), makeRng(1));
  const evs: Ev[] = [];
  for (const p of pieces) {
    if (p.type === 'bell') evs.push({ s: p.s, kind: 'bell' });
    if (p.type === 'fish') for (let i = 0; i < Number(p.params?.n ?? 5); i++) evs.push({ s: p.s + i * 1.6, kind: 'fish' });
    if (p.type === 'yarn' || p.type === 'treat' || p.type === 'ring') evs.push({ s: p.s, kind: 'pickup' });
    if (p.type === 'branch') evs.push({ s: p.s, kind: 'near' });
    if (['vault', 'wallrun', 'river', 'cloud', 'dog', 'yarnchase'].includes(p.type)) evs.push({ s: p.s + (p.len ?? 0), kind: 'set' });
  }
  evs.sort((a, b) => a.s - b.s);
  const sp = stage.speed;
  const speedAt = (s: number) => sp.start + (sp.max - sp.start) * Math.min(1, s / sp.rampDist);
  const c = new ComboChain();
  let bestTier = 0;
  let lastS = 0;
  for (const e of evs) {
    c.tick((e.s - lastS) / speedAt(e.s), false);
    lastS = e.s;
    if (e.kind === 'fish') c.add(WEIGHTS.fish, false);
    else if (e.kind === 'pickup') c.add(WEIGHTS.pickup, false);
    else if (e.kind === 'bell') c.add(WEIGHTS.bell);
    else if (e.kind === 'near') c.add(WEIGHTS.nearMiss);
    else c.add(WEIGHTS.setPiece);
    bestTier = Math.max(bestTier, c.tier);
  }
  return { bestTier, bestChain: c.bestChain };
}

describe('style balance', () => {
  it('without tricks, a perfect meadow run peaks at CLAW-SOME! at most (tier 3)', () => {
    const r = noTrickRun(meadow);
    if (SHOW) console.log(`no-trick meadow: best tier ${r.bestTier}, best chain ${r.bestChain}`);
    expect(r.bestTier).toBeLessThanOrEqual(3);
    expect(r.bestTier).toBeGreaterThanOrEqual(1);
  });
  it('a trick-heavy meadow run adds < 12% of the score target (and ranks S)', () => {
    const r = heavyRun(meadow);
    const share = r.points / meadow.scoreTarget;
    const info = `heavy meadow: ${r.points} style points over ${r.jumps} double spins, best chain ${r.bestChain}, ${(share * 100).toFixed(1)}% of ${meadow.scoreTarget}`;
    if (SHOW) console.log(info);
    expect(r.jumps, info).toBeGreaterThan(20);
    expect(r.bestChain, info).toBeGreaterThanOrEqual(60);
    expect(share, info).toBeLessThan(0.12);
    expect(rankFor(r.points, r.distance), info).toBe('S');
  });
  it('gorge and sunset stay under 12% too', () => {
    for (const st of [gorge, sunset]) {
      const r = heavyRun(st);
      if (SHOW) console.log(`heavy ${st.id}: ${r.points} (${((r.points / st.scoreTarget) * 100).toFixed(1)}% of ${st.scoreTarget}), ${r.jumps} jumps`);
      expect(r.points / st.scoreTarget, `${st.id}: ${r.points}`).toBeLessThan(0.12);
    }
  });
  it('the stage targets are unchanged', () => {
    expect([meadow.scoreTarget, gorge.scoreTarget, sunset.scoreTarget]).toEqual([490000, 940000, 860000]);
  });
});
