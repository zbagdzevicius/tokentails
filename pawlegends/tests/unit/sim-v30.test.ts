/**
 * Sim v30 (docs/plans/moba/V30-BALANCE.md): the 5v5 balance release. Only Hearthwood's hero-vs-hero rows (and the
 * comeback lever named in the doc) change, so every Crossing record of v29 re-sims to the same hash and length on v30,
 * while the frozen v29 bundle keeps verifying its own records in the backend.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { HEARTHWOOD_PVP } from '../../src/data/maps/hearthwood';
import type { ReplayRecord } from '../../src/sim/api';
import { verifyReplay } from '../../src/sim/server';
import { SIM_VERSION } from '../../src/sim/version';

const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const v29 = (name: string): ReplayRecord => JSON.parse(readFileSync(join(VENDOR, 'v29', `${name}.fixture.json`), 'utf8')) as ReplayRecord;
/** The v29 Crossing records (3v3 and the strip-free mutators): none of them reads a Hearthwood row. */
const CROSSING = ['rookie-replay', 'champion-replay', 'forfeit-replay', 'dog-replay', 'new-dog-replay', 'roster-replay', 'blitz-replay', 'kite-replay'];

describe('sim v30: the 5v5 balance release', { timeout: 600000 }, () => {
  it('SIM_VERSION 30, v29 frozen at its last commit on main (f921c5ef)', () => {
    expect(SIM_VERSION).toBe(30);
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

  it('Crossing is untouched: every v29 Crossing record re-sims on v30 to the same hash and length', () => {
    for (const name of CROSSING) {
      const rec = v29(name);
      expect(rec.simVersion, name).toBe(29);
      const res = verifyReplay({ ...rec, simVersion: SIM_VERSION });
      expect(res, name).toMatchObject({ ok: true, finalHash: rec.finalHash, ticks: rec.ticks });
    }
  });

  it('the live v30 Hearthwood fixture verifies (the vendored copy is this sim)', () => {
    const live = JSON.parse(readFileSync(join(VENDOR, `v${SIM_VERSION}`, 'hearthwood-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(live.simVersion).toBe(30);
    expect(verifyReplay(live)).toMatchObject({ ok: true, finalHash: live.finalHash });
  });
});
