/** Party play N0 (MULTIPLAYER.md §1.5): verifyPartyReplay accepts a real record and rejects tampered or malformed ones. */
import { describe, expect, it } from 'vitest';
import { MAX_INPUT_CHARS } from '../../src/data/limits';
import type { PartyReplayRecord } from '../../src/sim/api';
import { verifyPartyReplay } from '../../src/sim/server';
import { partyReplayRecord } from '../../src/sim/party';
import { playParty } from './party-helpers';

describe('party-verify', { timeout: 300_000 }, () => {
  const m = playParty(41, [0, 1, 2], ['normal', 'easy', 'normal']);
  const rec = partyReplayRecord(m)!;
  const tamper = (f: (r: PartyReplayRecord) => unknown) => {
    const r = JSON.parse(JSON.stringify(rec)) as PartyReplayRecord;
    const out = f(r);
    return verifyPartyReplay(out === undefined ? r : out);
  };
  it('a real record verifies', () => {
    expect(verifyPartyReplay(rec)).toMatchObject({ ok: true, finalHash: rec.finalHash });
  });
  it('tampered inputs are refused', () => {
    const r = tamper((r) => {
      const a = r.inputs[1];
      r.inputs[1] = r.inputs[2];
      r.inputs[2] = a;
    });
    expect(r.ok).toBe(false);
    expect(tamper((r) => void (r.inputs[1] = r.inputs[1].slice(0, -8))).ok).toBe(false);
    expect(tamper((r) => void (r.finalHash = '00000000'))).toMatchObject({ ok: false });
    expect(tamper((r) => void (r.outcome = r.outcome === 'won' ? 'lost' : 'won'))).toMatchObject({ ok: false });
  });
  it('wrong slot lists, slots >= 3, duplicates and oversize inputs are refused before any simulation', () => {
    expect(tamper((r) => void (r.humans = [r.humans[1], r.humans[0], r.humans[2]]))).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(tamper((r) => void (r.humans[2].slot = 3))).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(tamper((r) => void (r.humans[2].slot = 1))).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(tamper((r) => void r.inputs.pop())).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(tamper((r) => void (r.inputs[1] = 'A'.repeat(MAX_INPUT_CHARS + 4)))).toMatchObject({ ok: false, code: 'PAWLEGENDS_TOO_LONG' });
    expect(tamper((r) => void (r.picks[4] = r.picks[4] === 'brutus' ? 'lambo' : 'brutus'))).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(tamper((r) => void (r.humans[1].hero = 'nope' as never))).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(tamper((r) => void (r.v = 1 as never))).toMatchObject({ ok: false });
    expect(tamper((r) => void (r.simVersion = 10))).toMatchObject({ ok: false, code: 'PAWLEGENDS_SIM_VERSION' });
    expect(verifyPartyReplay(null)).toMatchObject({ ok: false });
    expect(tamper((r) => void (r.inputs[0] = '!!!!'))).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
  });
});
