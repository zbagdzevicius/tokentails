import { describe, expect, it } from 'vitest';
import {
  BADCAT_SKUS,
  COSMETICS,
  DEFAULT_CAT,
  DIR_DX,
  DIR_DZ,
  FALL_TICKS,
  MIN_REPLAY_SIM_VERSION,
  PROP_KINDS,
  ROOM_EVENT_NAMES,
  SEASONS,
  SIM_VERSION,
  propKind,
  rgb565,
  rgb888,
} from './types';
import { decodeInputs, encodeInputs } from './sim/replay';
import { seedRng, nextRng } from './sim/rng';
import { lineOfSight } from './sim/grid';

describe('frozen types', () => {
  it('keeps the 15 MVP prop kinds frozen and adds the FULL catalog with unique ids and slugs', () => {
    const mvp = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 18, 19, 20];
    for (const k of mvp) expect(propKind(k), String(k)).toBeTruthy();
    expect(new Set(PROP_KINDS.map((k) => k.kind)).size).toBe(PROP_KINDS.length);
    expect(new Set(PROP_KINDS.map((k) => k.id)).size).toBe(PROP_KINDS.length);
    expect(PROP_KINDS.every((k) => k.kind >= 1 && k.kind <= 127)).toBe(true); // 7 bits in the room codec
    expect(propKind(1)?.id).toBe('wine-glass');
    // v4 rule data must never change for the M0 kinds (old ghosts replay bit-exact)
    expect(propKind(14)?.inert).toBe(true);
    expect(propKind(20)?.inert).toBe(true);
    expect(propKind(3)?.base).toBe(320);
    expect(propKind(15)?.base).toBe(200);
    for (const k of PROP_KINDS) if (k.stack) expect(k.base, k.id).toBe(k.stack.items * k.stack.itemBase);
  });
  it('sim versions: v8 rules (QA round 3 balance); v4 to v7 stay replayable', () => {
    expect(SIM_VERSION).toBe(8);
    expect(MIN_REPLAY_SIM_VERSION).toBe(4);
  });
  it('catalogs: events fit 4 bits, cosmetics unique per slot, seasons ordered, SKUs priced', () => {
    expect(ROOM_EVENT_NAMES.length).toBeLessThanOrEqual(16);
    const keys = COSMETICS.map((c) => `${c.slot}:${c.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(COSMETICS.every((c) => c.id >= 1 && c.id <= 255)).toBe(true);
    for (let i = 1; i < SEASONS.length; i++) expect(SEASONS[i].start > SEASONS[i - 1].end).toBe(true);
    for (const def of Object.values(BADCAT_SKUS)) expect(def.cents).toBeGreaterThan(0);
    expect(BADCAT_SKUS.club_monthly.cents).toBe(499);
    expect(BADCAT_SKUS.club_annual.cents).toBe(3999);
    expect(BADCAT_SKUS.collar_pinkpaw.revenueBearing).toBe(false);
  });
  it('direction tables are 8-way unit offsets', () => {
    for (let d = 1; d <= 8; d++) expect(Math.abs(DIR_DX[d]) + Math.abs(DIR_DZ[d])).toBeGreaterThan(0);
    expect([DIR_DX[1], DIR_DZ[1]]).toEqual([0, -1]);
    expect([DIR_DX[3], DIR_DZ[3]]).toEqual([1, 0]);
  });
  it('fall times match GDD 4.4', () => {
    expect([FALL_TICKS[1][0], FALL_TICKS[2][0], FALL_TICKS[3][0], FALL_TICKS[3][2]]).toEqual([9, 13, 18, 9]);
  });
  it('RGB565 round trip keeps the default cat stable', () => {
    expect(rgb565(rgb888(DEFAULT_CAT.base))).toBe(DEFAULT_CAT.base);
  });
});

describe('copied sim helpers', () => {
  it('RLE round trips', () => {
    const ins = [
      { dir: 3, speed: 2, buttons: 0 },
      { dir: 3, speed: 2, buttons: 0 },
      { dir: 0, speed: 0, buttons: 1 },
    ] as const;
    const runs = encodeInputs(ins as never);
    expect(runs).toEqual([
      [3, 2, 0, 2],
      [0, 0, 1, 1],
    ]);
    expect(decodeInputs(runs)).toEqual(ins);
  });
  it('rng is deterministic and non-zero', () => {
    const s = seedRng(18);
    expect(s).toBe(seedRng(18));
    expect(nextRng(s)).not.toBe(0);
  });
  it('lineOfSight is blocked by an occluding cell', () => {
    const w = 5;
    const d = 1;
    const g = { w, d, level: new Uint8Array(w), occludes: new Uint8Array(w), propAt: new Int16Array(w).fill(-1) };
    expect(lineOfSight(g, 0, 0, 4, 0)).toBe(true);
    g.occludes[2] = 1;
    expect(lineOfSight(g, 0, 0, 4, 0)).toBe(false);
  });
});
