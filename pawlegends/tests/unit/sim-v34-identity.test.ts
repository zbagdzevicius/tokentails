/**
 * Sim v34 gate G1 (docs/plans/moba/V34-MAPS.md §4): every v33 replay fixture (Crossing solo, Hearthwood solo, party and
 * PvP, Blitz, kite, forfeit, late Sunset, the roster heroes) re-simulated by the v34 sim, relabelled 34, verifies: the
 * new maps left every Crossing and Hearthwood code path as it was.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyReplay } from '../../src/sim/server';
import { verifyPartyReplay, verifyPvpReplay } from '../../src/sim/party';
import { SIM_VERSION } from '../../src/sim/version';

const dir = join(__dirname, '../../../backend/src/vendor/pawlegends-sim/v33');
const files = readdirSync(dir).filter((f) => f.endsWith('.fixture.json'));

describe('sim v34 plays every v33 fixture the same', () => {
  it('has the fixtures', () => expect(files.length).toBeGreaterThanOrEqual(12));
  for (const f of files) {
    it(f, () => {
      const r = { ...JSON.parse(readFileSync(join(dir, f), 'utf8')), simVersion: SIM_VERSION };
      const res = r.v === 3 ? verifyPvpReplay(r) : r.v === 2 ? verifyPartyReplay(r) : verifyReplay(r);
      expect(res.ok, JSON.stringify(res)).toBe(true);
    });
  }
});
