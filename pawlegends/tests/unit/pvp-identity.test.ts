/**
 * Sim v16 S-PvP identity (docs/plans/moba/V16.md §3.1.9): the S-PvP code leaves PvE byte-identical to the frozen v15.
 * Every frozen v15 fixture (rookie, champion, forfeit, dog, new-dog) re-sims with src/sim to its recorded final hash,
 * and the party golden (tests/unit/party-identity.test.ts, produced on v15) still holds.
 *
 * Retired at the first MAP-GAPS B commit, which changes every match (its goldens are regenerated instead).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReplayRecord } from '../../src/sim/api';
import { runReplay } from '../../src/sim/replay';
import { verifyReplay } from '../../src/sim/server';

const V15 = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim', 'v15');
const FIXTURES = ['rookie-replay.fixture.json', 'champion-replay.fixture.json', 'forfeit-replay.fixture.json', 'dog-replay.fixture.json', 'new-dog-replay.fixture.json'];

describe('pvp-identity (S-PvP leaves PvE identical to frozen v15)', { timeout: 300_000 }, () => {
  it.each(FIXTURES)('frozen v15 %s re-sims to its recorded final hash, ticks and outcome', (f) => {
    const rec = JSON.parse(readFileSync(join(V15, f), 'utf8')) as ReplayRecord;
    expect(rec.simVersion).toBe(15);
    const run = runReplay(rec);
    expect(run.result).not.toBeNull();
    expect(run.result!.finalHash).toBe(rec.finalHash);
    expect(run.result!.ticks).toBe(rec.ticks);
    expect(run.result!.outcome).toBe(rec.outcome);
    // The same record labelled v16 verifies with the live sim.
    expect(verifyReplay({ ...rec, simVersion: 16 })).toMatchObject({ ok: true, finalHash: rec.finalHash });
  });
});
