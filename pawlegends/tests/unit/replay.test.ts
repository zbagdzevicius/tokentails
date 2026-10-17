import { describe, expect, it } from 'vitest';
import { Op, type ReplayRecord } from '../../src/sim/api';
import { decodeStream, encodeStream, fromBase64, toBase64 } from '../../src/sim/commands';
import { createMatch, fillPicks, replayRecord, result, step } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { SIM_VERSION } from '../../src/sim/version';

function playedReplay(seed = 1234): ReplayRecord {
  const { picks, tricks } = fillPicks(seed, 'brutus', 'snack');
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
  for (let t = 0; !result(m); t++) {
    if (t % 97 === 0) step(m, [{ op: Op.Move, x: 10000 + ((t * 37) % 80000), y: 5000 + ((t * 13) % 50000) }]);
    else step(m);
  }
  return replayRecord(m)!;
}

describe('verifyReplay (§15 item 4)', { timeout: 120000 }, () => {
  const rec = playedReplay();
  it('accepts a genuine replay and reproduces the result', () => {
    const v = verifyReplay(rec);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.outcome).toBe(rec.outcome);
      expect(v.finalHash).toBe(rec.finalHash);
      expect(v.ticks).toBe(rec.ticks);
    }
  });
  it('detects a changed input byte', () => {
    const bytes = fromBase64(rec.inputs);
    const list = decodeStream(bytes);
    const moved = list.map((c, i) => (i === 3 && c.cmd.op === Op.Move ? { tick: c.tick, cmd: { ...c.cmd, x: c.cmd.x + 5000 } } : c));
    const v = verifyReplay({ ...rec, inputs: toBase64(encodeStream(moved)) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('PAWLEGENDS_HASH_MISMATCH');
  });
  it('detects a changed seed, simVersion or outcome', () => {
    const s = verifyReplay({ ...rec, seed: rec.seed + 1 });
    expect(s.ok).toBe(false);
    const sv = verifyReplay({ ...rec, simVersion: SIM_VERSION + 1 });
    expect(sv).toMatchObject({ ok: false, code: 'PAWLEGENDS_SIM_VERSION' });
    const o = verifyReplay({ ...rec, outcome: rec.outcome === 'won' ? 'lost' : 'won' });
    expect(o).toMatchObject({ ok: false, code: 'PAWLEGENDS_OUTCOME_MISMATCH' });
  });
  it('refuses a wrong length, trailing input, bad shapes and over-long inputs before simulating', () => {
    expect(verifyReplay({ ...rec, ticks: rec.ticks - 1 })).toMatchObject({ ok: false });
    expect(verifyReplay({ ...rec, ticks: 19801 })).toMatchObject({ ok: false, code: 'PAWLEGENDS_TOO_LONG' });
    expect(verifyReplay({ ...rec, inputs: 'A'.repeat(40004) })).toMatchObject({ ok: false, code: 'PAWLEGENDS_TOO_LONG' });
    expect(verifyReplay({ ...rec, inputs: '!!!!' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(verifyReplay({ ...rec, hero: 'garfield' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(verifyReplay({ ...rec, finalHash: 'XYZ' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(verifyReplay(null)).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    const trailing = toBase64(encodeStream([...decodeStream(fromBase64(rec.inputs)), { tick: rec.ticks, cmd: { op: Op.Stop } }]));
    expect(verifyReplay({ ...rec, inputs: trailing })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
  });
});
