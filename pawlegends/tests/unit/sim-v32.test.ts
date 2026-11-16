/**
 * Sim v32 (docs/plans/moba/V32-NO-SUDDEN-DEATH.md): no Sudden Death. Version and the v31 freeze; no 'suddenDeath'
 * phase or event and no core burn in any mode; late Sunset (structures take more damage and respawns grow from the
 * match's late tick, the old Sudden Death tick); every v31 record that ended before its late tick re-sims on v32 to the
 * same hash and length (nothing changed before it); the live late fixture is a match past the late tick that verifies.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { limit } from './cpu-budget';
import { LATE_SUNSET, TIMELINE_BY } from '../../src/data/timeline';
import { MUTATOR_RULES } from '../../src/data/mutators';
import type { Mutator, ReplayRecord } from '../../src/sim/api';
import { createMatch, fillPicks, result, snapshot, step } from '../../src/sim/index';
import { lateRespawn, lateStructureBp } from '../../src/sim/late';
import { verifyReplay } from '../../src/sim/server';
import { SIM_VERSION } from '../../src/sim/version';
import { G, RANGE } from '../../src/sim/world';

const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const v31 = (name: string): ReplayRecord => JSON.parse(readFileSync(join(VENDOR, 'v31', `${name}.fixture.json`), 'utf8')) as ReplayRecord;
/** v31 Crossing records that end before their difficulty's late tick (Easy 7:45, Normal 8:30). */
const BEFORE_LATE = ['dog-replay', 'new-dog-replay', 'roster-replay', 'kite-replay', 'roster31-replay', 'forfeit-replay'];

describe('sim v32: no Sudden Death', { timeout: limit(600000) }, () => {
  it('SIM_VERSION 32, v31 frozen at its last commit on main (345fb655) with its roster31 fixture', () => {
    expect(SIM_VERSION).toBe(32);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const entry = /simVersion: 31,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(entry?.[1].startsWith('345fb655')).toBe(true);
    expect(entry?.[0]).toContain('roster31-replay.fixture.json');
  });

  it('every mode: the clock never reads suddenDeath, no suddenDeath event, and the late tick is the old Sudden Death tick', () => {
    expect(TIMELINE_BY.normal.late).toBe(15300);
    for (const mutator of ['none', 'blitz', 'cannon', 'bounty', 'onelane', 'duel'] as Mutator[]) {
      expect(MUTATOR_RULES[mutator], mutator).toBeDefined();
      const { picks, tricks } = fillPicks(32, 'clem', 'pounce');
      const m = createMatch({ seed: 32, picks, tricks, difficulty: 'normal', ...(mutator !== 'none' ? { mutator } : {}) });
      const phases = new Set<string>();
      while (!result(m)) {
        step(m);
        const s = snapshot(m, 0);
        phases.add(s.clock.phase);
        for (const e of s.events) expect((e.type as string) === 'suddenDeath', mutator).toBe(false);
      }
      expect([...phases].includes('suddenDeath' as never), mutator).toBe(false);
    }
  });

  it('late Sunset: structures take more every minute (capped), respawns grow (capped), nothing before the late tick', () => {
    const { picks, tricks } = fillPicks(7, 'clem', 'pounce');
    const m = createMatch({ seed: 7, picks, tricks, difficulty: 'normal' });
    const late = m.world.globals[G.Late];
    expect(lateStructureBp(m, late - 1, 0)).toBe(0);
    expect(lateRespawn(m.world, late - 1, 300)).toBe(300);
    const oneMin = lateStructureBp(m, late + 1800, 2);
    expect(oneMin).toBe(LATE_SUNSET.structureBpPerMinute);
    expect(lateStructureBp(m, late + 1800 * 60, 2)).toBe(LATE_SUNSET.structureMaxBp);
    expect(lateRespawn(m.world, late + 1800, 300)).toBeGreaterThan(300);
    expect(lateRespawn(m.world, late + 1800 * 60, 1000)).toBe(LATE_SUNSET.respawnHardCap);
    // Blitz: the same bonus for both teams (no takedown lead)
    const b = createMatch({ seed: 7, picks, tricks, difficulty: 'normal', mutator: 'blitz' });
    b.world.globals[G.Kills0] = 9;
    const t = b.world.globals[G.Late] + 900;
    expect(lateStructureBp(b, t, 0)).toBe(lateStructureBp(b, t, 1));
  });

  it('no core loses HP on its own in late Sunset (minions only, sturdy cores)', () => {
    const { picks, tricks } = fillPicks(8, 'clem', 'pounce');
    const m = createMatch({ seed: 8, picks, tricks, difficulty: 'easy' });
    m.world.globals[G.BotsOff] = 1;
    while (m.world.globals[G.Tick] < TIMELINE_BY.easy.late + 30) step(m);
    const c = RANGE.cores;
    if (m.world.alive[RANGE.towers + 1] === 1 && m.world.alive[RANGE.towers + 3] === 1) {
      const hp = m.world.hp[c];
      for (let i = 0; i < 300; i++) step(m);
      expect(m.world.hp[c]).toBe(hp);
    }
  });

  it('every v31 Crossing record that ended before its late tick re-sims on v32 to the same hash and length', () => {
    for (const name of BEFORE_LATE) {
      const rec = v31(name);
      expect(rec.simVersion, name).toBe(31);
      const late = TIMELINE_BY[rec.difficulty as keyof typeof TIMELINE_BY].late;
      expect(rec.ticks, name).toBeLessThan(late);
      expect(verifyReplay({ ...rec, simVersion: SIM_VERSION }), name).toMatchObject({ ok: true, finalHash: rec.finalHash, ticks: rec.ticks });
    }
  });

  it('the live v32 late fixture runs past the late tick, ends on a core, and verifies', () => {
    const live = JSON.parse(readFileSync(join(VENDOR, `v${SIM_VERSION}`, 'late-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(live).toMatchObject({ simVersion: 32, difficulty: 'normal' });
    expect(live.ticks).toBeGreaterThan(TIMELINE_BY.normal.late);
    expect(verifyReplay(live)).toMatchObject({ ok: true, finalHash: live.finalHash, ticks: live.ticks, reason: 'core' });
  });
});
