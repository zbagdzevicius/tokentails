// Pure-logic tests for the CATS lane: stats, upgrade math, economy and roster sanity. No three, no DOM.
import { describe, expect, it } from 'vitest';
import { CAT_ORDER, UPGRADE_IDS, UPGRADE_MAX, type CatId, type CatStats, type LevelDef, type RunResult, type SaveData, type UpgradeId } from '../core/types';
import { buyCat, buyUpgrade, canBuyCat, canBuyUpgrade, CAT_COSTS, catCost, catnipForRun, upgradeCost } from './economy';
import { ROSTER, ROSTER_LIST } from './roster';
import { effectiveStats, TABBY_STATS } from './stats';

const POC: CatStats = { walk: 34, zoom: 62, turn: 7, radius: 13, headY: 46, scale: 1, swatCd: 0.32, swatReach: 26, swatRadius: 17, swatPower: 1, pounceCd: 2, pounceR: 32, pounceJump: 95, pounceFwd: 85, patienceMax: 100, wetResist: 1, stunResist: 1, ultraCharge: 1, ultraTime: 7 };
const zero = (): Record<UpgradeId, number> => ({ power: 0, speed: 0, fur: 0, ultra: 0 });

function save(catnip: number, owned: CatId[] = ['tabby']): SaveData {
  const cats = {} as SaveData['cats'];
  for (const id of CAT_ORDER) cats[id] = { owned: owned.includes(id), upgrades: zero() };
  return { v: 1, catnip, selectedCat: 'tabby', cats, levels: {}, settings: { master: 1, music: 0.6, sfx: 1, shake: 1, quality: 'high' }, tutorialDone: false, totals: { runs: 0, damage: 0, catnipEarned: 0 } };
}
const deep = (s: SaveData) => JSON.parse(JSON.stringify(s)) as SaveData;

const level = { catnipBase: 60 } as LevelDef;
function run(o: Partial<RunResult>): RunResult {
  return { levelId: 'meowhattan', catId: 'tabby', why: 'time', damage: 0, buildings: 0, landmarks: 0, kills: {}, taxis: 0, fish: 0, maxCombo: 0, patience: 50, destroyedPct: 0, bossDefeated: false, elapsed: 90, ...o };
}

// How each track moves each stat: +1 must go up, -1 down. Everything else stays put.
const EFFECT: Record<UpgradeId, Partial<Record<keyof CatStats, 1 | -1>>> = {
  power: { swatPower: 1, swatRadius: 1, pounceR: 1 },
  speed: { walk: 1, zoom: 1, turn: 1 },
  fur: { patienceMax: 1, wetResist: -1, stunResist: -1 },
  ultra: { ultraCharge: 1, ultraTime: 1 },
};

describe('effectiveStats', () => {
  it('tabby base is the POC tuning', () => {
    expect(TABBY_STATS).toEqual(POC);
    expect(ROSTER.tabby.base).toEqual(POC);
  });

  it('level 0 equals base for every cat and does not mutate it', () => {
    for (const c of ROSTER_LIST) {
      const copy = { ...c.base };
      expect(effectiveStats(c.base, zero())).toEqual(c.base);
      expect(effectiveStats(c.base, {})).toEqual(c.base);
      expect(c.base).toEqual(copy);
    }
  });

  it('is monotonic per track, and each track only touches its own stats', () => {
    for (const c of ROSTER_LIST) {
      for (const up of UPGRADE_IDS) {
        let prev = effectiveStats(c.base, zero());
        for (let l = 1; l <= UPGRADE_MAX; l++) {
          const cur = effectiveStats(c.base, { ...zero(), [up]: l });
          for (const k of Object.keys(POC) as (keyof CatStats)[]) {
            const dir = EFFECT[up][k];
            if (dir === 1) expect(cur[k], `${c.id} ${up} ${k} L${l}`).toBeGreaterThan(prev[k]);
            else if (dir === -1) expect(cur[k], `${c.id} ${up} ${k} L${l}`).toBeLessThan(prev[k]);
            else expect(cur[k]).toBe(c.base[k]);
          }
          prev = cur;
        }
      }
    }
  });

  it('matches the GDD table at max level', () => {
    const s = effectiveStats(TABBY_STATS, { power: 5, speed: 5, fur: 5, ultra: 5 });
    expect(s.swatPower).toBeCloseTo(1.4);
    expect(s.swatRadius).toBeCloseTo(17 * 1.2);
    expect(s.pounceR).toBeCloseTo(32 * 1.2);
    expect(s.walk).toBeCloseTo(34 * 1.25);
    expect(s.zoom).toBeCloseTo(62 * 1.25);
    expect(s.turn).toBeCloseTo(7 * 1.2);
    expect(s.patienceMax).toBe(140);
    expect(s.wetResist).toBeCloseTo(0.7);
    expect(s.stunResist).toBeCloseTo(0.7);
    expect(s.ultraCharge).toBeCloseTo(1.4);
    expect(s.ultraTime).toBeCloseTo(9);
  });

  it('clamps garbage levels', () => {
    const max = effectiveStats(TABBY_STATS, { power: 5 });
    expect(effectiveStats(TABBY_STATS, { power: 99 })).toEqual(max);
    expect(effectiveStats(TABBY_STATS, { power: -3 })).toEqual(TABBY_STATS);
    expect(effectiveStats(TABBY_STATS, { power: NaN })).toEqual(TABBY_STATS);
  });
});

describe('upgradeCost', () => {
  it('follows the GDD table times the cat multiplier', () => {
    const table = [40, 80, 140, 220, 320];
    const mul: Record<CatId, number> = { tabby: 1, chonk: 1.2, shadow: 1.4, siamese: 1.6 };
    for (const id of CAT_ORDER)
      for (const up of UPGRADE_IDS)
        for (let l = 0; l < UPGRADE_MAX; l++) expect(upgradeCost(id, up, l)).toBe(Math.round(table[l] * mul[id]));
    expect(upgradeCost('tabby', 'power', 0)).toBe(40);
    expect(upgradeCost('siamese', 'ultra', 4)).toBe(512);
  });

  it('is null at max', () => {
    for (const id of CAT_ORDER) for (const up of UPGRADE_IDS) expect(upgradeCost(id, up, UPGRADE_MAX)).toBeNull();
    expect(upgradeCost('tabby', 'speed', 12)).toBeNull();
  });

  it('maxing everything costs about 25 runs of catnip', () => {
    let total = 0;
    for (const id of CAT_ORDER) {
      total += catCost(id);
      for (const up of UPGRADE_IDS) for (let l = 0; l < UPGRADE_MAX; l++) total += upgradeCost(id, up, l)!;
    }
    // a good run earns ~150 (damage cap) + catnipBase + stars; the GDD target is ~25 runs to max everything
    const perRun = total / 25;
    expect(perRun).toBeGreaterThan(400);
    expect(perRun).toBeLessThan(800);
  });
});

describe('buyCat', () => {
  it('buys with enough catnip and never mutates the input', () => {
    const s = save(1000);
    const before = deep(s);
    const n = buyCat(s, 'chonk');
    expect(s).toEqual(before);
    expect(n).not.toBe(s);
    expect(n.cats.chonk.owned).toBe(true);
    expect(n.catnip).toBe(1000 - CAT_COSTS.chonk);
    expect(n.cats.tabby).toEqual(s.cats.tabby);
  });

  it('refuses with too little catnip', () => {
    const s = save(CAT_COSTS.shadow - 1);
    expect(canBuyCat(s, 'shadow')).toBe(false);
    expect(buyCat(s, 'shadow')).toEqual(s);
    expect(canBuyCat(save(CAT_COSTS.shadow), 'shadow')).toBe(true);
  });

  it('refuses an owned cat', () => {
    const s = save(5000, ['tabby', 'siamese']);
    expect(canBuyCat(s, 'siamese')).toBe(false);
    expect(buyCat(s, 'siamese').catnip).toBe(5000);
    expect(canBuyCat(s, 'tabby')).toBe(false);
  });
});

describe('buyUpgrade', () => {
  it('buys one level and never mutates the input', () => {
    const s = save(100);
    const before = deep(s);
    const n = buyUpgrade(s, 'tabby', 'power');
    expect(s).toEqual(before);
    expect(n.cats.tabby.upgrades.power).toBe(1);
    expect(n.cats.tabby.upgrades.speed).toBe(0);
    expect(n.catnip).toBe(60);
    expect(n.cats.tabby.upgrades).not.toBe(s.cats.tabby.upgrades);
  });

  it('refuses with too little catnip', () => {
    const s = save(39);
    expect(canBuyUpgrade(s, 'tabby', 'fur')).toBe(false);
    expect(buyUpgrade(s, 'tabby', 'fur')).toEqual(s);
  });

  it('refuses a cat that is not owned', () => {
    const s = save(9999);
    expect(canBuyUpgrade(s, 'chonk', 'power')).toBe(false);
    expect(buyUpgrade(s, 'chonk', 'power')).toEqual(s);
  });

  it('refuses at max level', () => {
    const s = save(9999);
    s.cats.tabby.upgrades.ultra = UPGRADE_MAX;
    expect(canBuyUpgrade(s, 'tabby', 'ultra')).toBe(false);
    expect(buyUpgrade(s, 'tabby', 'ultra')).toEqual(s);
  });

  it('walks a track 0 -> max with exact costs', () => {
    let s = save(10000, ['tabby', 'chonk']);
    let spent = 0;
    for (let l = 0; l < UPGRADE_MAX; l++) {
      spent += upgradeCost('chonk', 'speed', l)!;
      s = buyUpgrade(s, 'chonk', 'speed');
    }
    expect(s.cats.chonk.upgrades.speed).toBe(UPGRADE_MAX);
    expect(s.catnip).toBe(10000 - spent);
    expect(buyUpgrade(s, 'chonk', 'speed')).toBe(s);
  });
});

describe('catnipForRun', () => {
  it('a quit earns nothing', () => {
    expect(catnipForRun(run({ why: 'quit', damage: 5000 }), level, 3)).toBe(0);
  });

  it('finishing earns damage/20 + base + 30 per new star', () => {
    expect(catnipForRun(run({ damage: 1000 }), level, 0)).toBe(50 + 60);
    expect(catnipForRun(run({ damage: 1000, why: 'boss' }), level, 2)).toBe(50 + 60 + 60);
  });

  it('TOO WET pays a third of the base', () => {
    expect(catnipForRun(run({ damage: 400, why: 'wet' }), level, 0)).toBe(20 + 20);
    expect(catnipForRun(run({ damage: 0, why: 'wet' }), { catnipBase: 50 } as LevelDef, 0)).toBe(16);
  });

  it('caps damage catnip at 150', () => {
    expect(catnipForRun(run({ damage: 3000 }), level, 0)).toBe(150 + 60);
    expect(catnipForRun(run({ damage: 1e9 }), level, 0)).toBe(150 + 60);
  });

  it('ignores negative stars and damage', () => {
    expect(catnipForRun(run({ damage: -500 }), level, -2)).toBe(60);
  });

  it('chonk is affordable after about 2 runs', () => {
    const typical = catnipForRun(run({ damage: 1500 }), level, 1);
    expect(Math.ceil(CAT_COSTS.chonk / typical)).toBeLessThanOrEqual(3);
  });
});

describe('roster', () => {
  it('has unique ids in CAT_ORDER order', () => {
    expect(ROSTER_LIST.map((c) => c.id)).toEqual([...CAT_ORDER]);
    expect(new Set(ROSTER_LIST.map((c) => c.id)).size).toBe(CAT_ORDER.length);
    for (const id of CAT_ORDER) expect(ROSTER[id].id).toBe(id);
  });

  it('tabby is free and costs rise down the roster', () => {
    expect(ROSTER.tabby.cost).toBe(0);
    expect(catCost('tabby')).toBe(0);
    const costs = ROSTER_LIST.map((c) => c.cost);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
  });

  it('every stat is positive and finite, and voices match the GDD', () => {
    for (const c of ROSTER_LIST) {
      for (const [k, v] of Object.entries(c.base)) expect(Number.isFinite(v) && v > 0, `${c.id}.${k}`).toBe(true);
      expect(Object.keys(c.base).sort()).toEqual(Object.keys(POC).sort());
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.ultraName.length).toBeGreaterThan(0);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(ROSTER_LIST.map((c) => c.voice)).toEqual([1, 0.7, 1.1, 1.3]);
  });

  it('matches the GDD stat table', () => {
    expect(ROSTER.chonk.base).toMatchObject({ walk: 28, zoom: 52, turn: 5.5, radius: 16, headY: 56, scale: 1.25, swatCd: 0.4, swatRadius: 20, swatPower: 1.25, pounceCd: 2.4, pounceR: 44, patienceMax: 130, wetResist: 0.8, stunResist: 1.2, ultraCharge: 0.9, ultraTime: 5 });
    expect(ROSTER.shadow.base).toMatchObject({ walk: 40, zoom: 74, turn: 9, radius: 12, swatCd: 0.26, swatRadius: 15, swatPower: 0.9, pounceCd: 1.6, patienceMax: 85, wetResist: 1.1, stunResist: 0.7, ultraCharge: 1.15, ultraTime: 6 });
    expect(ROSTER.siamese.base).toMatchObject({ walk: 36, zoom: 64, turn: 7.5, swatReach: 28, swatCd: 0.3, stunResist: 0.5, ultraCharge: 1.1, ultraTime: 6 });
  });
});
