/**
 * Founder, Nov 18: "in recordings I can see only past match recording". The recordings store keeps a replay for every
 * listed match (solo, party, PvP), newest first, up to REPLAY_MAX; a full device gives up replays of another sim
 * version first; old rows stay listed with a clear state. The viewer core re-runs a party / PvP record from the
 * player's own seat and reaches the saved end hash.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HISTORY_MAX, REPLAY_MAX, isStoredReplay, loadHistory, loadReplays, recordMoment, replayOf, soloRecord, type HistoryEntry, type KVStore, type StoredReplay } from '../../src/replay/store';
import { ReplayCore, seatsOf, type ReplayRecordLike } from '../../src/replay/core';
import { OLDER_TIP, rowHtml, watchState, type ShownRow } from '../../src/ui/history/historySheet';
import { SIM_VERSION, type PvpReplayRecord, type ReplayRecord } from '../../src/sim/index';
import { limit } from './cpu-budget';

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

const solo = (i: number, simVersion = SIM_VERSION): ReplayRecord => ({ v: 1, simVersion, seed: i, difficulty: 'easy', hero: 'clem', trick: 'pounce', ticks: 900, inputs: 'AAAA'.repeat(50), outcome: 'won', finalHash: '0000000a' });
const row = (i: number, extra: Partial<HistoryEntry> = {}): Omit<HistoryEntry, 'replay'> => ({ id: `m${i}`, at: 1000 + i, hero: 'clem', mode: 'skirmish', difficulty: 'easy', outcome: 'won', grade: 'A', k: i, d: 1, a: 2, seconds: 300, simVersion: SIM_VERSION, ...extra });
const pvp = (): PvpReplayRecord => JSON.parse(readFileSync(join(__dirname, `../../../backend/src/vendor/pawlegends-sim/v${SIM_VERSION}/pvp-replay.fixture.json`), 'utf8')) as PvpReplayRecord;

describe('recordings store', () => {
  it('three matches in a row: three rows and three replays, newest first', () => {
    const s = new Mem();
    for (let i = 0; i < 3; i++) recordMoment(row(i), solo(i), s);
    const h = loadHistory(s);
    expect(h.map((r) => r.id)).toEqual(['m2', 'm1', 'm0']);
    expect(h.every((r) => r.replay)).toBe(true);
    expect(Object.keys(loadReplays(s)).sort()).toEqual(['m0', 'm1', 'm2']);
    for (const r of h) expect(watchState(r)).toBe('watch');
  });

  it('every listed match keeps its replay (REPLAY_MAX = HISTORY_MAX), the oldest out past it', () => {
    expect(REPLAY_MAX).toBe(HISTORY_MAX);
    const s = new Mem();
    for (let i = 0; i < HISTORY_MAX + 5; i++) recordMoment(row(i), solo(i), s);
    const h = loadHistory(s);
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h.every((r) => r.replay)).toBe(true);
    expect(Object.keys(loadReplays(s))).toHaveLength(REPLAY_MAX);
    expect(replayOf('m4', s)).toBeNull();
    expect(replayOf(`m${HISTORY_MAX + 4}`, s)?.seed).toBe(HISTORY_MAX + 4);
  });

  it('a party or PvP match keeps its record and the player seat; it never counts as a solo record', () => {
    const s = new Mem();
    recordMoment(row(1), solo(1), s);
    const rec = pvp();
    const r = recordMoment(row(2, { mode: 'pvp', slot: 3 }), rec, s);
    expect(r.replay).toBe(true);
    expect(r.slot).toBe(3);
    const back = replayOf('m2', s) as StoredReplay;
    expect(isStoredReplay(back)).toBe(true);
    expect(soloRecord(back)).toBeNull();
    expect(soloRecord(replayOf('m1', s))?.seed).toBe(1);
    expect(watchState(loadHistory(s)[0])).toBe('watch');
  });

  it('a full device gives up replays of another sim version first, then the oldest; the new one stays', () => {
    const s = new Mem();
    recordMoment(row(0, { simVersion: SIM_VERSION - 1 }), solo(0, SIM_VERSION - 1), s);
    for (let i = 1; i < 4; i++) recordMoment(row(i), solo(i), s);
    // room for 3 replays, not 4
    s.limit = JSON.stringify(loadReplays(s)).length;
    const r = recordMoment(row(9), solo(9), s);
    expect(r.replay).toBe(true);
    const kept = Object.keys(loadReplays(s)).sort();
    expect(kept).not.toContain('m0');
    expect(kept).toContain('m9');
    expect(kept).toHaveLength(4);
    // tighter still: the oldest current replay goes next, never the new one
    s.limit = JSON.stringify(loadReplays(s)).length;
    recordMoment(row(10), solo(10), s);
    const k2 = Object.keys(loadReplays(s));
    expect(k2).toContain('m10');
    expect(k2).not.toContain('m1');
  });

  it('older and legacy rows stay listed, with a clear state', () => {
    expect(watchState({ replay: true, simVersion: SIM_VERSION - 1 })).toBe('older');
    expect(watchState({ replay: false, simVersion: SIM_VERSION, noReplay: 'party' })).toBe('party');
    const base: Omit<ShownRow, 'local'> = { sid: null, at: 0, hero: 'clem', heroName: null, mode: 'Skirmish 3v3', filter: 'ai', outcome: 'won', grade: 'A', k: 1, d: 1, a: 1, seconds: 60, mvp: null };
    const older = rowHtml({ ...base, local: { ...row(1, { simVersion: SIM_VERSION - 1 }), replay: true } as HistoryEntry }, 0);
    expect(older).toContain('Older version');
    expect(older).toContain(OLDER_TIP);
    const none = rowHtml({ ...base, local: { ...row(2, { noReplay: 'party' }), replay: false } as HistoryEntry }, 0);
    expect(none).toContain('No replay');
    const watch = rowHtml({ ...base, local: { ...row(3), replay: true } as HistoryEntry }, 0);
    expect(watch).toContain('data-watch="m3"');
  });
});

describe('viewer core: party and PvP records', { timeout: limit(240_000) }, () => {
  it('reads the seats of solo, party and PvP records, and refuses a broken one', () => {
    expect(seatsOf({ inputs: 'AAAA', hero: 'clem', trick: 'pounce' })).toEqual({ slots: [0], streams: ['AAAA'] });
    const p = pvp();
    expect(seatsOf(p)?.slots).toEqual(p.humans.map((h) => h.slot));
    expect(seatsOf({ ...p, inputs: p.inputs.slice(1) })).toBeNull();
    expect(seatsOf({ inputs: 'AAAA' })).toBeNull();
  });

  it('a PvP record re-runs from the player seat on team 1 to the saved end hash', () => {
    const rec = pvp();
    const me = rec.humans.find((h) => h.slot >= 3)!.slot;
    const core = new ReplayCore();
    expect(core.load({ ...rec, me } as ReplayRecordLike)).toBeNull();
    while (!core.info.done) core.scoutFor(5000, 1e9, () => performance.now());
    expect(core.info.ok).toBe(true);
    const [welcome] = core.start(0) as unknown as [{ t: string; slot: number; team: number }];
    expect(welcome).toMatchObject({ t: 'welcome', slot: me, team: 1 });
    expect(core.advance(30).some((m) => m.t === 'snap')).toBe(true);
  });

  it('a record of another sim version is refused as "version"', () => {
    expect(new ReplayCore().load({ ...pvp(), simVersion: SIM_VERSION - 1 } as ReplayRecordLike)).toBe('version');
  });
});
