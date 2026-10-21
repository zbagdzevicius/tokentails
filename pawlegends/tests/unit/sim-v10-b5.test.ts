/**
 * Sim v10, GAPS B5 (Purr-ify, the 4th Paw Trick): it removes stun, root, slow, fear and charm, even mid-stun, then
 * gives TRICKS.purrify.immune ticks of crowd-control immunity; bots cast it when crowd-controlled.
 */
import { describe, expect, it } from 'vitest';
import { BOTS } from '../../src/data/bots';
import { TRICKS, TRICK_IDS } from '../../src/data/tricks';
import { charm, fear, knockback, root, slow, stun } from '../../src/sim/effects';
import { purrifyCast } from '../../src/sim/bots/casts';
import { fillPicks } from '../../src/sim/index';
import { Buff, FM } from '../../src/sim/world';
import { trickHint } from '../../src/ui/heroText';
import { MID, cast, cd, heroMatch, hold, place, steps } from './heroes/kit-helpers';

const match = () => {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw'], ['purrify', 'purrify', 'pounce', 'pounce', 'pounce', 'pounce']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -30000 : 30000), MID.y + id * 3000, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
};

describe('sim v10 (GAPS B5): Purr-ify', () => {
  it('is the 4th trick, drawn for bots too', () => {
    expect(TRICK_IDS).toEqual(['pounce', 'snack', 'hiss', 'purrify']);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) for (const t of fillPicks(seed, 'clem', 'pounce').tricks.slice(1)) seen.add(t);
    expect(seen.has('purrify')).toBe(true);
  });

  it('casts through a stun and clears stun, root, slow and fear', () => {
    const m = match();
    const w = m.world;
    stun(w, 0, 60);
    root(w, 0, 60);
    slow(w, 0, 3000, 60);
    fear(w, 0, 60, w.x[0] + 1000, w.y[0]);
    cast(m, 0, 4, w.x[0], w.y[0]);
    expect([w.stunT[0], w.rootT[0], w.slowT[0], w.fearT[0]]).toEqual([0, 0, 0, 0]);
    expect(cd(m, 0, 4)).toBe(TRICKS.purrify.cooldown);
    expect(w.ccImmT[0]).toBeGreaterThan(0);
    expect(w.buffs[0] & Buff.Purrified).toBe(Buff.Purrified);
  });

  it('clears a charm, then ignores CC for 15 ticks', () => {
    const m = match();
    const w = m.world;
    charm(w, 0, 60, 3);
    expect(w.fearSrc[0]).toBe(3);
    cast(m, 0, 4, w.x[0], w.y[0]);
    expect(w.fearT[0]).toBe(0);
    expect(w.fearSrc[0]).toBe(-1);
    stun(w, 0, 30);
    root(w, 0, 30);
    slow(w, 0, 5000, 30);
    fear(w, 0, 30, w.x[0], w.y[0]);
    knockback(m, 0, w.x[0] - 500, w.y[0], 2000, 0);
    expect([w.stunT[0], w.rootT[0], w.slowT[0], w.fearT[0], w.fmKind[0]]).toEqual([0, 0, 0, 0, FM.None]);
    steps(m, TRICKS.purrify.immune);
    expect(w.ccImmT[0]).toBe(0);
    stun(w, 0, 30);
    expect(w.stunT[0]).toBe(30);
  });

  it('other tricks stay blocked by a stun', () => {
    const m = match();
    const w = m.world;
    stun(w, 2, 60);
    cast(m, 2, 4, w.x[2] + 2000, w.y[2]);
    expect(cd(m, 2, 4)).toBe(0);
  });

  it('bots cast it when crowd-controlled with 15+ ticks left, never on Rookie or Easy', () => {
    const m = match();
    const w = m.world;
    expect(purrifyCast(w, 1, BOTS.normal)).toBeNull();
    stun(w, 1, 14);
    expect(purrifyCast(w, 1, BOTS.normal)).toBeNull();
    stun(w, 1, 30);
    expect(purrifyCast(w, 1, BOTS.normal)).not.toBeNull();
    expect(purrifyCast(w, 1, BOTS.easy)).toBeNull();
    expect(purrifyCast(w, 1, BOTS.rookie)).toBeNull();
    // a slow alone, with no enemy hero near, is not worth it
    w.stunT[1] = 0;
    slow(w, 1, 3000, 60);
    expect(purrifyCast(w, 1, BOTS.normal)).toBeNull();
  });

  it('pick screen: Tank → Purr-ify', () => {
    expect(trickHint('Tank')).toContain('Purr-ify');
    expect(trickHint('Marksman')).toBe('');
  });
});
