/** Party play N0 (MULTIPLAYER.md §1.5): a 3-human match, its replay, and the per-slot input rules. */
import { describe, expect, it } from 'vitest';
import { MAX_INPUT_BYTES } from '../../src/data/limits';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, fillPicks, hash, result, step } from '../../src/sim/index';
import { partyLog, partyReplayRecord, runPartyReplay, verifyPartyReplay } from '../../src/sim/party';
import { partyMatch, playParty } from './party-helpers';

describe('party-sim', { timeout: 300_000 }, () => {
  it('3 pilot streams play a whole match; the party record replays to the same hash', () => {
    const m = playParty(31, [0, 1, 2], ['normal', 'normal', 'easy']);
    const res = result(m)!;
    expect(res).not.toBeNull();
    const rec = partyReplayRecord(m)!;
    expect(rec.v).toBe(2);
    expect(rec.inputs).toHaveLength(3);
    for (const s of rec.inputs) expect(s.length).toBeGreaterThan(0);
    const run = runPartyReplay(rec);
    expect(run.result!.finalHash).toBe(res.finalHash);
    expect(run.trail).toEqual(m.trail);
    expect(verifyPartyReplay(rec)).toMatchObject({ ok: true, finalHash: res.finalHash, ticks: res.ticks });
  });

  it('swapping the slot 1 and slot 2 streams changes the hash', () => {
    const m = playParty(32, [0, 1, 2], ['normal', 'normal', 'easy'], 'normal', 3000);
    const a = m.party!.logs[1]!.slice();
    const b = m.party!.logs[2]!.slice();
    const replay = (s1: typeof a, s2: typeof a) => {
      const n = partyMatch(32, [0, 1, 2]);
      const by = (log: typeof a, t: number) => log.filter((c) => c.tick === t).map((c) => c.cmd);
      for (let t = 0; t < 3000; t++) step(n, by(partyLog(m, 0) as typeof a, t), [[], by(s1, t), by(s2, t)]);
      return hash(n);
    };
    expect(replay(a, b)).toBe(hash(m));
    expect(replay(b, a)).not.toBe(hash(m));
  });

  it('Ping and Forfeit from slots >= 1 are dropped and never logged; slot 1 never touches m.log', () => {
    // Sim v14: with the dogs in the pool seed 5's idle team loses its core at 7,917, so seed 6 (still going at 9,000)
    const m = partyMatch(6, [0, 1]);
    const ping: Command = { op: Op.Ping, kind: 0, x: 50000, y: 30000, id: 255 };
    // 8,000 ticks: past the Normal surrender window (4:00), before the idle team's core falls
    for (let t = 0; t < 8000; t++) {
      const list: Command[] = t % 50 === 0 ? [ping, { op: Op.Forfeit }] : [];
      if (t % 97 === 0) list.push({ op: Op.Move, x: 20000 + t, y: 20000 });
      step(m, undefined, [undefined, list]);
    }
    expect(result(m)).toBeNull();
    expect(m.log).toHaveLength(0);
    const log1 = m.party!.logs[1]!;
    expect(log1.length).toBeGreaterThan(0);
    for (const c of log1) expect(c.cmd.op).toBe(Op.Move);
    expect(m.events.some((e) => e.type === 'ping')).toBe(false);
  });

  it('per-slot byte budgets are independent', () => {
    const m = partyMatch(6, [0, 1]);
    // Flood slot 1 with 7-byte casts until its budget is spent; slot 0 still applies afterwards.
    const cast: Command = { op: Op.Cast, slot: 0, x: 30000, y: 30000, id: 255 };
    let grew = true;
    for (let t = 0; t < 19000 && grew; t++) {
      const n = m.party!.logs[1]!.length;
      step(m, undefined, [undefined, [cast]]);
      grew = m.party!.logs[1]!.length > n;
    }
    expect(result(m)).toBeNull();
    expect(m.party!.gates[1]!.bytes).toBeGreaterThan(MAX_INPUT_BYTES - 16);
    const before = m.party!.logs[1]!.length;
    step(m, [{ op: Op.Stop }], [undefined, [cast]]);
    expect(m.party!.logs[1]!.length).toBe(before);
    expect(m.log.length).toBe(1);
    expect(m.gate.bytes).toBeLessThan(10);
  });

  it('a single-human config ([0]) has no party state, exactly like an omitted one', () => {
    const { picks, tricks } = fillPicks(9, 'clem', 'pounce');
    const a = createMatch({ seed: 9, picks, tricks, difficulty: 'easy', humans: [0] });
    const b = createMatch({ seed: 9, picks, tricks, difficulty: 'easy' });
    expect(a.party).toBeUndefined();
    for (let t = 0; t < 600; t++) {
      step(a, undefined, [undefined, [{ op: Op.Move, x: 1000, y: 1000 }]]);
      step(b);
    }
    expect(hash(a)).toBe(hash(b));
  });

  it('invalid humans lists are refused', () => {
    const { picks, tricks } = fillPicks(9, 'clem', 'pounce');
    for (const humans of [[1], [0, 0], [0, 3], [0, 2, 1], [], [0, 1, 2, 2]]) {
      expect(() => createMatch({ seed: 9, picks, tricks, difficulty: 'easy', humans })).toThrow(RangeError);
    }
  });
});
