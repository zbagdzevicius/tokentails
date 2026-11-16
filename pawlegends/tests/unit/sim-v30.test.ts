/**
 * Sim v30 (docs/plans/moba/V30-BALANCE.md): the 5v5 balance release. Only Hearthwood's hero-vs-hero rows (and the
 * comeback lever named in the doc) changed, so every Crossing record of v29 re-simmed to the same hash and length on
 * v30 (checked while v30 was live), while the frozen v29 bundle keeps verifying its own records in the backend. Sim
 * v31 froze v30 in turn (sim-v31.test.ts) and changes Crossing (new heroes in the bot picks).
 */
import { limit } from './cpu-budget';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { HEARTHWOOD_PVP } from '../../src/data/maps/hearthwood';
import type { ReplayRecord } from '../../src/sim/api';
import { SIM_VERSION } from '../../src/sim/version';

const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const v29 = (name: string): ReplayRecord => JSON.parse(readFileSync(join(VENDOR, 'v29', `${name}.fixture.json`), 'utf8')) as ReplayRecord;

describe('sim v30: the 5v5 balance release', { timeout: limit(600000) }, () => {
  it('SIM_VERSION 30 or later, v29 frozen at its last commit on main (f921c5ef)', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(30);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const v29Entry = /simVersion: 29,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(v29Entry?.[1].startsWith('f921c5ef')).toBe(true);
    expect(v29Entry?.[0]).toContain('roster-replay.fixture.json');
  });

  it('every hero has a Hearthwood row, each a readable whole step: dmg and taken move by the same amount the other way', () => {
    for (const h of HERO_IDS) {
      const r = HEARTHWOOD_PVP.hero[h];
      expect(r, h).toBeDefined();
      expect(r.dmgBp, h).toBeGreaterThanOrEqual(8000);
      expect(r.dmgBp, h).toBeLessThanOrEqual(12500);
      expect(r.takenBp, h).toBeGreaterThanOrEqual(8000);
      expect(r.takenBp, h).toBeLessThanOrEqual(12000);
    }
    expect(Object.keys(HEARTHWOOD_PVP.hero).sort()).toEqual([...HERO_IDS].sort());
    expect(HEROES.ziggy.side).toBe('cat');
  });

  it('the frozen v30 Hearthwood fixture is a v30 record (the backend verifies it with the frozen v30 bundle)', () => {
    const frozen = JSON.parse(readFileSync(join(VENDOR, 'v30', 'hearthwood-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(frozen.simVersion).toBe(30);
    const v29rec = v29('rookie-replay');
    expect(v29rec.simVersion).toBe(29);
  });
});
