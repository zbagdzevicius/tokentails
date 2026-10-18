// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, parseProfile, recordMatch, resetProfileCache } from '../../src/meta/profile';
import { decodeDare, dareText, dareUrl, encodeDare } from '../../src/share/dare';
import { SnapBuffer, lerpAngle } from '../../src/render/interp';
import { Tips } from '../../src/onboarding/tips';
import type { EntitySnap, Snapshot } from '../../src/sim/api';

describe('dare links', () => {
  it('round-trips and rejects junk', () => {
    const d = { seed: 0xdeadbeef, hero: 'sage' as const, trick: 'hiss' as const, difficulty: 'normal' as const, seconds: 432 };
    expect(decodeDare(encodeDare(d))).toEqual(d);
    expect(decodeDare('zz.9.0.0.1')).toBeNull();
    expect(decodeDare('1.0.0.2.1')).toBeNull();
    expect(decodeDare('<script>.0.0.0.1')).toBeNull();
    expect(decodeDare(null)).toBeNull();
    expect(dareText(d)).toBe('Beat my 7:12 vs Normal bots in Pawlegends!');
    expect(dareUrl(d, 'https://tokentails.com/pawlegends?x=1')).toBe(`https://tokentails.com/pawlegends?dare=${encodeDare(d)}`);
  });
});

describe('profile', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
  });
  it('survives corrupt or hostile storage', () => {
    expect(parseProfile('{bad json').matches).toBe(0);
    const p = parseProfile(JSON.stringify({ matches: -4, hero: 'evil', difficulty: 'hard', unlocks: [1, 'a'] }));
    expect(p).toMatchObject({ matches: 0, hero: 'clem', difficulty: 'easy', unlocks: ['a'] });
  });
  it('records the first win once and the best time', () => {
    expect(loadProfile().firstWinDone).toBe(false);
    expect(recordMatch(false, 500, 'easy')).toMatchObject({ firstWin: false });
    // the first win sets the time; "best!" needs a stored time to beat (fun plan F4)
    expect(recordMatch(true, 480, 'easy')).toMatchObject({ firstWin: true, best: false, second: true });
    expect(recordMatch(true, 490, 'easy')).toMatchObject({ firstWin: false, best: false });
    expect(recordMatch(true, 470, 'easy')).toMatchObject({ firstWin: false, best: true });
    resetProfileCache();
    expect(loadProfile()).toMatchObject({ matches: 4, wins: 3, firstWinDone: true });
    expect(loadProfile().unlocks).toContain('coat.brutus.biscuit');
  });
});

const hero = (x: number, facing = 0, state: EntitySnap['state'] = 'moving'): EntitySnap => ({
  id: 0, kind: 'hero', team: 0, slot: 0, hero: 'clem', level: 1, x, y: 30000, hp: 600, maxHp: 620, shield: 0, state, facing, buffs: 0,
});
const snap = (tick: number, e: EntitySnap[]): Snapshot => ({
  team: 0, clock: { tick, seconds: Math.floor(tick / 30), phase: 'play', nextPhaseIn: 0 }, score: { kills: [0, 0], towers: [0, 0] }, entities: e, projectiles: [], zones: [], events: [],
});

describe('interpolation', () => {
  it('blends between snapshots and snaps on teleports', () => {
    const b = new SnapBuffer();
    b.push(snap(10, [hero(1000)]));
    b.push(snap(11, [hero(1200)]));
    expect(b.sample(10.5)!.byId.get(0)!.fx).toBeCloseTo(1100);
    b.push(snap(12, [hero(9000)]));
    expect(b.sample(11.5)!.byId.get(0)!.fx).toBe(9000);
  });
  it('keeps the render clock behind the newest snapshot and releases events in order', () => {
    const b = new SnapBuffer();
    b.pushEvents([{ type: 'sunset', tick: 5 }, { type: 'suddenDeath', tick: 400 }]);
    let t = 0;
    for (let i = 0; i < 240; i++) {
      if (i % 2 === 0) b.push(snap(t++, [hero(t * 100)]));
      b.advance(1 / 60);
    }
    const newest = t - 1;
    expect(b.renderTick).toBeLessThan(newest);
    expect(b.renderTick).toBeGreaterThan(newest - 4);
    expect(b.takeEvents().map((e) => e.type)).toEqual(['sunset']);
    const frozen = b.renderTick;
    b.advance(0.1, 0);
    expect(b.renderTick).toBeLessThanOrEqual(newest);
    expect(b.renderTick).toBeGreaterThanOrEqual(frozen - 0.001);
  });
  it('lerps angles the short way', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  });
});

describe('first-match tips', () => {
  it('fire once, hide when done or after 8 s, and stay off outside the first match', () => {
    const done: string[] = [];
    const t = new Tips(document.body, true, (id) => done.push(id));
    t.trigger('move');
    expect(document.querySelector('.pl-tip.on')).not.toBeNull();
    t.complete('move');
    expect(document.querySelector('.pl-tip.on')).toBeNull();
    t.trigger('move');
    expect(t.isActive('move')).toBe(false);
    t.trigger('q');
    t.update(8.1);
    expect(t.isActive('q')).toBe(false);
    expect(done).toEqual(['move']);
    const off = new Tips(null, false);
    off.trigger('move');
    expect(off.isActive('move')).toBe(false);
    t.dispose();
  });
});
