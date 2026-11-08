/** Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.7, §3.1.9): verifyPvpReplay accepts a genuine record and refuses tampering. */
import { describe, expect, it } from 'vitest';
import { Op, type PvpReplayRecord } from '../../src/sim/api';
import { result, step } from '../../src/sim/index';
import { checkPartyShape, pvpReplayRecord, verifyPartyReplay, verifyPvpReplay } from '../../src/sim/party';
import * as server from '../../src/sim/server';
import { CATS, DOGS, playPvp } from './pvp-helpers';

function genuine(): PvpReplayRecord {
  // Four pilots and two fill bots to 4:00, then team 1 surrenders (a short, real match).
  const m = playPvp(51, [0, 1, 3, 4], ['normal', 'normal', null, 'normal', 'normal'], 'cat', 7200);
  expect(result(m)).toBeNull();
  step(m, undefined, [undefined, undefined, undefined, [{ op: Op.Forfeit }]]);
  expect(result(m)?.reason).toBe('forfeit');
  return pvpReplayRecord(m)!;
}

describe('pvp-verify', { timeout: 300_000 }, () => {
  const rec = genuine();

  it('a genuine record verifies (also through the server facade), with the winner', () => {
    expect(verifyPvpReplay(rec)).toMatchObject({ ok: true, winner: 0, reason: 'forfeit', outcome: 'won' });
    expect(server.verifyPvpReplay(rec)).toMatchObject({ ok: true, winner: 0 });
    expect(server.PVP_SINCE).toBe(16);
    expect(server.checkPvpShape(rec)).toBeNull();
  });

  it('refuses a bad stream, a wrong final hash and a wrong outcome', () => {
    const inputs = rec.inputs.slice();
    inputs[1] = inputs[1].length > 4 ? inputs[1].slice(0, -4) + 'AAAA' : 'AAAA';
    expect(verifyPvpReplay({ ...rec, inputs }).ok).toBe(false);
    expect(verifyPvpReplay({ ...rec, finalHash: rec.finalHash === '00000000' ? '00000001' : '00000000' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_HASH_MISMATCH' });
    expect(verifyPvpReplay({ ...rec, outcome: 'lost' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_OUTCOME_MISMATCH' });
  });

  it('refuses a seat on the wrong team (mixed species), a missing slot 3 and wrong picks', () => {
    const wrongTeam = rec.humans.map((h) => (h.slot === 4 ? { ...h, hero: CATS[0] } : h));
    expect(verifyPvpReplay({ ...rec, humans: wrongTeam })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    const mixed0 = rec.humans.map((h) => (h.slot === 1 ? { ...h, hero: DOGS[0] } : h));
    expect(verifyPvpReplay({ ...rec, humans: mixed0 })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    const no3 = { ...rec, humans: rec.humans.filter((h) => h.slot !== 3), inputs: rec.inputs.filter((_, i) => rec.humans[i].slot !== 3) };
    expect(verifyPvpReplay(no3)).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    const picks = rec.picks.slice();
    picks[2] = picks[2] === CATS[0] ? CATS[1] : CATS[0];
    expect(verifyPvpReplay({ ...rec, picks })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(verifyPvpReplay({ ...rec, difficulty: 'normal' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
  });

  it('refuses a v2 record labelled pvp, a pvp record labelled v2 and an older sim version', () => {
    expect(verifyPvpReplay({ ...rec, v: 2 })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(verifyPvpReplay({ ...rec, mode: 'pve' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(checkPartyShape({ ...rec, v: 2 })).not.toBeNull();
    expect(verifyPartyReplay({ ...rec, v: 2 }).ok).toBe(false);
    expect(verifyPvpReplay({ ...rec, simVersion: 15 })).toMatchObject({ ok: false, code: 'PAWLEGENDS_SIM_VERSION' });
  });
});
