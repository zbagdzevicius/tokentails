/**
 * Sim v36 (docs/plans/moba/V36-BALANCE.md): the v35 hero balance pass. Only hero-vs-hero rows changed (the heroes' own
 * 3v3 `pvp` rows and Hearthwood's species and hero rows), so a v35 match without those rows (Rookie and Easy: the rows
 * apply only on Normal, Hard and PvP) re-sims to the same hash on v36, while the frozen v35 bundle keeps verifying its
 * own records in the backend.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroId } from '../../src/sim/api';
import { HEARTHWOOD_PVP } from '../../src/data/maps/hearthwood';
import { SIM_VERSION } from '../../src/sim/version';
import { verifyReplay } from '../../../backend/src/vendor/pawlegends-sim/v36/index';
import { limit } from './cpu-budget';

const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');

/** The 3v3 rows the v36 pass set (V36-BALANCE.md §2), pinned so a later edit is deliberate. */
const ROWS_3V3: Partial<Record<HeroId, [number, number]>> = {
  ranger: [8915, 9075],
  bengas: [9450, 8690],
  rocket: [9085, 9015],
  champ: [8785, 8815],
  meatball: [7355, 8975],
  brutus: [8120, 9580],
  ziggy: [7485, 9690],
  lambo: [9465, 7120],
  domino: [9180, 8890],
};

/** Hearthwood's rows after the pass (§3): species 10005 / 10305 (cats) and 10015 / 10295 (dogs), then every hero. */
const ROWS_5V5: Record<HeroId, [number, number]> = {
  clem: [10996, 9261],
  sage: [10079, 10145],
  gabe: [9647, 10558],
  meatball: [9621, 10596],
  duchess: [9813, 10437],
  aviete: [10518, 9701],
  bengas: [9918, 10310],
  lambo: [10993, 9227],
  pixel: [9948, 10280],
  stilts: [10332, 9897],
  brutus: [11218, 9099],
  cacklejaw: [10491, 9807],
  nugget: [9740, 10508],
  marshmallow: [9344, 10866],
  bravo: [10225, 10093],
  chili: [9932, 10326],
  howler: [10540, 9758],
  rocket: [9946, 10305],
  frankie: [10881, 9395],
  domino: [9962, 10310],
  mochi: [9324, 10689],
  ziggy: [10430, 9557],
  biscuit: [10502, 9510],
  champ: [10580, 9423],
  nova: [8865, 11137],
  dusty: [9848, 10160],
  barkula: [10168, 9829],
  ranger: [9330, 10659],
};

describe('sim v36: the v35 hero balance pass', { timeout: limit(600000) }, () => {
  it('SIM_VERSION 36, v35 frozen at 59dafddf (the first commit on main with the live v35 dir) with every fixture', () => {
    expect(SIM_VERSION).toBe(36);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const entry = /simVersion: 35,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(entry?.[1].startsWith('59dafddf')).toBe(true);
    expect(entry?.[0]).toContain('maps-replay.fixture.json');
    expect(entry?.[0]).toContain('late-replay.fixture.json');
  });

  it('the re-rowed heroes carry the pinned 3v3 rows; every row moves dealt and taken the same amount the other way', () => {
    for (const [h, [dmg, taken]] of Object.entries(ROWS_3V3) as [HeroId, [number, number]][]) expect(HEROES[h].pvp, h).toEqual({ dmgBp: dmg, takenBp: taken });
    expect(HEARTHWOOD_PVP.cat).toEqual({ dmgBp: 10005, takenBp: 10305 });
    expect(HEARTHWOOD_PVP.dog).toEqual({ dmgBp: 10015, takenBp: 10295 });
    for (const h of HERO_IDS) expect(HEARTHWOOD_PVP.hero[h], h).toEqual({ dmgBp: ROWS_5V5[h][0], takenBp: ROWS_5V5[h][1] });
    for (const h of HERO_IDS) {
      const r = HEARTHWOOD_PVP.hero[h];
      expect(r, h).toBeDefined();
      expect(r.dmgBp, h).toBeGreaterThanOrEqual(8000);
      expect(r.dmgBp, h).toBeLessThanOrEqual(12500);
      expect(r.takenBp, h).toBeGreaterThanOrEqual(8000);
      expect(r.takenBp, h).toBeLessThanOrEqual(12000);
    }
  });

  it('every frozen v35 Rookie and Easy fixture, relabelled 36, verifies on v36 (the rows never apply there)', () => {
    const names = ['rookie', 'champion', 'dog', 'new-dog', 'roster', 'roster31', 'kite'];
    for (const n of names) {
      const rec = JSON.parse(readFileSync(join(VENDOR, 'v35', `${n}-replay.fixture.json`), 'utf8'));
      expect(['rookie', 'easy'], n).toContain(rec.difficulty);
      const res = verifyReplay({ ...rec, simVersion: 36 });
      expect(res, `${n}: ${JSON.stringify(res)}`).toMatchObject({ ok: true, finalHash: rec.finalHash, ticks: rec.ticks });
    }
  });
});
