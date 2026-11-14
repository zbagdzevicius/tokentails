/** Sim v16 S-PvP (docs/plans/moba/V16.md §3.1): a PvP match with humans on both teams, its replay and its rules. */
import { describe, expect, it } from 'vitest';
import { HEROES } from '../../src/data/heroes';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, hash, result, snapshot, step, tickOf } from '../../src/sim/index';
import { tieBreakWinner } from '../../src/sim/match';
import { fillPicksParty, partyLog, partyReplayRecord, pvpReplayRecord, runPvpReplay, verifyPvpReplay } from '../../src/sim/party';
import { forfeitFromOf, humanAliveMask } from '../../src/sim/server';
import { pvpMatch, pvpSeats, playPvp } from './pvp-helpers';

const ALL = [0, 1, 2, 3, 4, 5];
const by = (log: readonly { tick: number; cmd: Command }[], t: number): Command[] => log.filter((c) => c.tick === t).map((c) => c.cmd);

describe('pvp-sim', { timeout: 600_000 }, () => {
  it('6 pilot streams play a whole match; the v3 record verifies and replays to the same trail', () => {
    const m = playPvp(41, ALL, ['normal', 'normal', 'easy', 'normal', 'normal', 'easy']);
    const res = result(m)!;
    expect(res).not.toBeNull();
    expect(partyReplayRecord(m)).toBeNull();
    const rec = pvpReplayRecord(m)!;
    expect(rec).toMatchObject({ v: 3, mode: 'pvp', simVersion: 28, difficulty: 'hard', fillDifficulty: ['hard', 'hard'] });
    expect(rec.inputs).toHaveLength(6);
    for (const s of rec.inputs) expect(s.length).toBeGreaterThan(0);
    const run = runPvpReplay(rec);
    expect(run.result!.finalHash).toBe(res.finalHash);
    expect(run.trail).toEqual(m.trail);
    expect(verifyPvpReplay(rec)).toMatchObject({ ok: true, finalHash: res.finalHash, ticks: res.ticks, winner: res.winner });
  });

  it('two humans a side with bot fill (humans [0, 1, 3, 4]) verify; the fill difficulty is part of the record', () => {
    const m = playPvp(42, [0, 1, 3, 4], ['normal', 'easy', null, 'normal', 'easy'], 'dog', Infinity, ['easy', 'normal']);
    const rec = pvpReplayRecord(m)!;
    expect(rec.fillDifficulty).toEqual(['easy', 'normal']);
    expect(verifyPvpReplay(rec)).toMatchObject({ ok: true });
    expect(verifyPvpReplay({ ...rec, fillDifficulty: ['normal', 'easy'] }).ok).toBe(false);
  });

  it('swapping the slot 1 and slot 4 streams changes the hash', () => {
    const m = playPvp(43, ALL, ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'], 'cat', 3000);
    const logs = ALL.map((s) => partyLog(m, s).slice());
    const replay = (swap: boolean) => {
      const n = pvpMatch(43, ALL, 'cat');
      for (let t = 0; t < 3000; t++) {
        const others = ALL.map((s) => by(logs[swap && s === 1 ? 4 : swap && s === 4 ? 1 : s], t));
        step(n, others[0], others);
      }
      return hash(n);
    };
    expect(replay(false)).toBe(hash(m));
    expect(replay(true)).not.toBe(hash(m));
  });

  it('slot 3 forfeits for team 1 only from 4:00; an earlier one is dropped and touches nothing', () => {
    expect(forfeitFromOf('pvp')).toBe(7200);
    const m = pvpMatch(44, [0, 3]);
    while (tickOf(m) < 7200 && !result(m)) step(m, undefined, tickOf(m) === 3000 ? [undefined, undefined, undefined, [{ op: Op.Forfeit }]] : undefined);
    expect(result(m)).toBeNull();
    expect(partyLog(m, 3)).toHaveLength(0);
    step(m, undefined, [undefined, undefined, undefined, [{ op: Op.Forfeit }]]);
    expect(result(m)).toMatchObject({ reason: 'forfeit', winner: 0, outcome: 'won' });
    expect(partyLog(m, 3).map((c) => c.cmd.op)).toEqual([Op.Forfeit]);
    expect(verifyPvpReplay(pvpReplayRecord(m))).toMatchObject({ ok: true, reason: 'forfeit', winner: 0 });
  });

  it('slot 0 forfeits for team 0; both teams on one tick go to the tie-break', () => {
    const a = pvpMatch(45, [0, 3]);
    while (tickOf(a) < 7200 && !result(a)) step(a);
    expect(result(a)).toBeNull();
    step(a, [{ op: Op.Forfeit }]);
    expect(result(a)).toMatchObject({ reason: 'forfeit', winner: 1, outcome: 'lost' });

    const b = pvpMatch(45, [0, 3]);
    while (tickOf(b) < 7200 && !result(b)) step(b);
    const want = tieBreakWinner(b.world, 45);
    step(b, [{ op: Op.Forfeit }], [undefined, undefined, undefined, [{ op: Op.Forfeit }]]);
    expect(result(b)).toMatchObject({ reason: 'forfeit', winner: want });
    expect(verifyPvpReplay(pvpReplayRecord(b))).toMatchObject({ ok: true, winner: want });
  });

  it("slot 3's ping orders team 1's bots only, and only team 1 sees it", () => {
    const m = pvpMatch(46, [0, 3]);
    while (tickOf(m) < 900) step(m);
    step(m, undefined, [undefined, undefined, undefined, [{ op: Op.Ping, kind: 2, x: 60000, y: 30000, id: 255 }]]);
    const pings = m.events.filter((e) => e.type === 'ping');
    expect(pings).toHaveLength(1);
    expect(pings[0]).toMatchObject({ team: 1 });
    expect(m.world.botOrd[4] + m.world.botOrd[5]).toBeGreaterThan(0);
    expect(m.world.botOrd[1] + m.world.botOrd[2]).toBe(0);
    expect(snapshot(m, 1).events.some((e) => e.type === 'ping')).toBe(true);
    expect(snapshot(m, 0).events.some((e) => e.type === 'ping' || e.type === 'bark')).toBe(false);
    expect(partyLog(m, 3).map((c) => c.cmd.op)).toEqual([Op.Ping]);
  });

  it('a slot 1, 2, 4 or 5 ping or forfeit is dropped and never logged', () => {
    const m = pvpMatch(47, ALL);
    const junk: Command[] = [{ op: Op.Ping, kind: 0, x: 50000, y: 30000, id: 255 }, { op: Op.Forfeit }];
    for (let t = 0; t < 7300 && !result(m); t++) step(m, undefined, [undefined, junk, junk, undefined, junk, junk]);
    expect(result(m)).toBeNull();
    for (const s of [1, 2, 4, 5]) expect(partyLog(m, s)).toHaveLength(0);
  });

  it('humanAliveMask covers all six slots in PvP', () => {
    const m = pvpMatch(48, ALL);
    expect(humanAliveMask(m)).toBe(0b111111);
  });

  it('a PvP pick list never mixes species within a team', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const side0 of ['cat', 'dog'] as const) {
        const slots = seed % 3 === 0 ? ALL : seed % 3 === 1 ? [0, 3] : [0, 1, 3, 5];
        const { picks } = fillPicksParty(seed, pvpSeats(seed, slots, side0));
        for (let s = 0; s < 6; s++) expect(HEROES[picks[s]].side).toBe(s < 3 ? side0 : side0 === 'cat' ? 'dog' : 'cat');
      }
    }
  });

  it('invalid PvP configs are refused', () => {
    const seats = pvpSeats(9, ALL);
    const { picks, tricks } = fillPicksParty(9, seats);
    const base = { seed: 9, picks, tricks, difficulty: 'hard' as const, mode: 'pvp' as const };
    for (const humans of [[0], [0, 1], [0, 1, 2], [3], [0, 3, 3], [0, 4, 3], [0, 3, 6]]) expect(() => createMatch({ ...base, humans })).toThrow(RangeError);
    expect(() => createMatch({ ...base, humans: [0, 3], difficulty: 'normal' })).toThrow(RangeError);
    expect(() => createMatch({ ...base, humans: undefined })).toThrow(RangeError);
    expect(() => createMatch({ ...base, humans: [0, 3], fillDifficulty: ['hard'] as never })).toThrow(RangeError);
    expect(() => createMatch({ seed: 9, picks, tricks, difficulty: 'hard', humans: [0, 1], fillDifficulty: ['hard', 'hard'] })).toThrow(RangeError);
    // PvE keeps refusing team-1 seats.
    expect(() => createMatch({ seed: 9, picks, tricks, difficulty: 'hard', humans: [0, 3] })).toThrow(RangeError);
  });
});
