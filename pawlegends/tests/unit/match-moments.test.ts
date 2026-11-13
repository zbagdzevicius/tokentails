/**
 * MATCH-MOMENTS.md: match history storage (20 rows, the newest 5 solo replays, storage-full fallback), the load-in
 * lane line, the share card's words, the history row's Watch state and the viewer's seek and death helpers.
 */
import { describe, expect, it } from 'vitest';
import { HISTORY_MAX, REPLAY_MAX, ago, clock, loadHistory, loadReplays, recordMoment, replayOf, type HistoryEntry, type KVStore } from '../../src/replay/store';
import { laneToastLine } from '../../src/ui/history/laneToast';
import { cardTitle, shareText } from '../../src/share/card';
import { watchState } from '../../src/ui/history/historySheet';
import { DEATH_LEAD_TICKS, nextDeath, seekTick } from '../../src/replay/viewer';
import { SIM_VERSION, type ReplayRecord } from '../../src/sim/index';

class Mem implements KVStore {
  m = new Map<string, string>();
  limit = Infinity;
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (v.length > this.limit) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

const rec = (i: number): ReplayRecord => ({ v: 1, simVersion: SIM_VERSION, seed: i, difficulty: 'easy', hero: 'clem', trick: 'pounce', ticks: 900, inputs: 'AAAA'.repeat(50), outcome: 'won', finalHash: '0000000a' });
const row = (i: number, extra: Partial<HistoryEntry> = {}): Omit<HistoryEntry, 'replay'> => ({ id: `m${i}`, at: 1000 + i, hero: 'clem', mode: 'skirmish', difficulty: 'easy', outcome: 'won', grade: 'A', k: i, d: 1, a: 2, seconds: 300, simVersion: SIM_VERSION, ...extra });

describe('match history store', () => {
  it('keeps the newest 20 rows and the newest 5 replays', () => {
    const s = new Mem();
    for (let i = 0; i < 25; i++) recordMoment(row(i), rec(i), s);
    const h = loadHistory(s);
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0].id).toBe('m24');
    expect(h.filter((r) => r.replay).map((r) => r.id)).toEqual(['m24', 'm23', 'm22', 'm21', 'm20']);
    expect(Object.keys(loadReplays(s)).sort()).toEqual(['m20', 'm21', 'm22', 'm23', 'm24']);
    expect(REPLAY_MAX).toBe(5);
    expect(replayOf('m24', s)?.seed).toBe(24);
    expect(replayOf('m3', s)).toBeNull();
  });
  it('a party match is listed without a replay and never pushes a solo replay out', () => {
    const s = new Mem();
    recordMoment(row(1), rec(1), s);
    const p = recordMoment(row(2, { mode: 'party', noReplay: 'party' }), rec(2), s);
    expect(p.replay).toBe(false);
    expect(loadHistory(s).map((r) => [r.id, r.replay])).toEqual([
      ['m2', false],
      ['m1', true],
    ]);
  });
  it('full storage drops the oldest replays first, and the row is still saved', () => {
    const s = new Mem();
    for (let i = 0; i < 4; i++) recordMoment(row(i), rec(i), s);
    s.limit = JSON.stringify(loadReplays(s)).length; // room for 4 replays, not 5
    const r = recordMoment(row(9), rec(9), s);
    expect(r.id).toBe('m9');
    expect(r.replay).toBe(true);
    const h = loadHistory(s);
    expect(h[0].id).toBe('m9');
    expect(h.find((x) => x.id === 'm0')?.replay).toBe(false);
  });
  it('bad stored data reads as empty', () => {
    const s = new Mem();
    s.setItem('tt.pawlegends.history.v1', '{nope');
    s.setItem('tt.pawlegends.replays.v1', '[1,2]');
    expect(loadHistory(s)).toEqual([]);
    expect(loadReplays(s)).toEqual({});
    expect(loadHistory(null)).toEqual([]);
  });
  it('formats times', () => {
    expect(clock(125)).toBe('2:05');
    expect(ago(0, 30_000)).toBe('Just now');
    expect(ago(0, 5 * 60_000)).toBe('5 min ago');
    expect(ago(0, 3 * 3600_000)).toBe('3 h ago');
    expect(ago(0, 30 * 3600_000)).toBe('Yesterday');
  });
});

describe('load-in lane line', () => {
  it('Crossing follows the pick hint; Hearthwood names the assigned role lane', () => {
    expect(laneToastLine({ heroRole: 'Marksman' })).toBe('Sunny Lane · marksman');
    expect(laneToastLine({ heroRole: 'fighter' })).toBe('Puddle Lane · fighter');
    expect(laneToastLine({ heroRole: 'assassin' })).toBe('Either lane · assassin');
    expect(laneToastLine({ map: 'hearthwood', heroRole: 'mage', role5: 'mid' })).toBe('Yarn Road · mage');
    expect(laneToastLine({ map: 'hearthwood', heroRole: 'tank', role5: 'guard' })).toBe('Gutterway · support');
    expect(laneToastLine({ map: 'hearthwood', heroRole: 'tank', role5: null })).toBe('');
  });
});

describe('share card words', () => {
  it('leads with the best moment, else the result', () => {
    expect(cardTitle({ won: true, best: 'Triple Pounce' })).toBe('TRIPLE POUNCE');
    expect(cardTitle({ won: true, best: null })).toBe('VICTORY!');
    expect(cardTitle({ won: false, best: null })).toBe('GOOD FIGHT');
    expect(cardTitle({ won: false, draw: true, best: null })).toBe('DRAW');
    expect(shareText({ won: true, best: 'First Blood!', heroName: 'Clem', k: 7, d: 2, a: 9 })).toBe('First Blood! with Clem, 7/2/9. My Legend Moment in Paw Legends!');
    expect(shareText({ won: false, best: null, heroName: 'Sage', k: 1, d: 4, a: 3 })).toContain('A match with Sage');
  });
});

describe('history Watch and viewer helpers', () => {
  it('Watch only for a kept replay of this sim version', () => {
    expect(watchState({ replay: true, simVersion: SIM_VERSION })).toBe('watch');
    expect(watchState({ replay: true, simVersion: SIM_VERSION - 1 })).toBe('older');
    expect(watchState({ replay: false, simVersion: SIM_VERSION, noReplay: 'party' })).toBe('party');
    expect(watchState({ replay: false, simVersion: SIM_VERSION })).toBe('none');
  });
  it('seeks stay inside the scouted part; deaths are visited in order and wrap', () => {
    expect(seekTick(0.5, { total: 1000, scouted: 1000 })).toBe(500);
    expect(seekTick(0.9, { total: 1000, scouted: 400 })).toBe(399);
    expect(seekTick(-1, { total: 1000, scouted: 400 })).toBe(0);
    const deaths = [600, 1800, 4000];
    expect(nextDeath(deaths, 0)).toBe(600);
    expect(nextDeath(deaths, 600 - DEATH_LEAD_TICKS)).toBe(1800);
    expect(nextDeath(deaths, 3900)).toBe(600);
    expect(nextDeath([], 0)).toBe(-1);
  });
});
