import { describe, expect, it } from 'vitest';
import { buy, fishForRace, nextGoal, placeBonus, raceFishInput, shopCatalogue, sumFish } from './economy';
import { defaultProg } from './state';
import { result, stats } from './fixtures.test-util';

describe('fish economy', () => {
  it('pays the place bonus 10/8/6/5/4/3/2/1 times the class multiplier', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => placeBonus(p, 0))).toEqual([10, 8, 6, 5, 4, 3, 2, 1]);
    expect(placeBonus(1, 1)).toBe(13); // 12.5 rounds up
    expect(placeBonus(1, 2)).toBe(15);
    expect(placeBonus(9, 0)).toBe(0);
  });

  it('adds coins held at the line (max 10) and coins picked up', () => {
    const lines = fishForRace({ mode: 'race', cls: 0, place: 3, finished: true, coinsHeld: 14, coinsPicked: 9 });
    expect(sumFish(lines)).toBe(6 + 10 + 9);
    // a typical race (mid-pack, a handful of coins) lands in the 15–30 band
    const typical = sumFish(fishForRace({ mode: 'race', cls: 1, place: 3, finished: true, coinsHeld: 6, coinsPicked: 8 }));
    expect(typical).toBeGreaterThanOrEqual(15);
    expect(typical).toBeLessThanOrEqual(30);
  });

  it('a DNF keeps only the coins it picked up', () => {
    expect(sumFish(fishForRace({ mode: 'race', cls: 2, place: 8, finished: false, coinsHeld: 5, coinsPicked: 4 }))).toBe(4);
  });

  it('time trial pays nothing per race (medals are separate); a battle win pays 15', () => {
    expect(fishForRace({ mode: 'tt', cls: 0, place: 1, finished: true, coinsHeld: 3, coinsPicked: 3 })).toEqual([]);
    expect(sumFish(fishForRace({ mode: 'battle', cls: 0, place: 1, finished: true, coinsHeld: 0, coinsPicked: 0, battleWin: true }))).toBe(15);
    expect(sumFish(fishForRace({ mode: 'battle', cls: 0, place: 4, finished: false, coinsHeld: 0, coinsPicked: 0, balloonsTaken: 9 }))).toBe(10);
  });

  it('reads the result: Daily Cup and dares pay like races', () => {
    const r = result({ place: 2, cls: 1, mode: 'daily', coins: 3 });
    const inp = raceFishInput(r, stats({ coinsPicked: 4 }));
    expect(inp.finished).toBe(true);
    expect(sumFish(fishForRace(inp))).toBe(10 + 4 + 3);
  });
});

describe('shop', () => {
  it('sells the three paid bodies and eight hats, cheapest first', () => {
    const c = shopCatalogue();
    expect(c.filter((i) => i.kind === 'body').map((i) => i.price)).toEqual([200, 400, 600]);
    expect(c.filter((i) => i.kind === 'hat')).toHaveLength(8);
    for (let i = 1; i < c.length; i++) expect(c[i].price).toBeGreaterThanOrEqual(c[i - 1].price);
  });

  it('buys with fish, never twice, never into debt', () => {
    let s = { ...defaultProg(), fish: 100 };
    const r1 = buy(s, 'hat', 2); // beanie 60
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    s = r1.save;
    expect(s.fish).toBe(40);
    expect(s.owned.hats).toContain(2);
    expect(buy(s, 'hat', 2)).toEqual({ ok: false, reason: 'owned' });
    expect(buy(s, 'hat', 1)).toEqual({ ok: false, reason: 'fish' }); // crown 250
    expect(buy(s, 'body', 0)).toEqual({ ok: false, reason: 'unknown' }); // free bodies are not for sale
  });

  it('names the next goal: the cheapest thing out of reach, or the best thing already affordable', () => {
    const poor = nextGoal({ ...defaultProg(), fish: 10 })!;
    expect(poor.affordable).toBe(false);
    expect(poor.item.price).toBe(60);
    expect(poor.missing).toBe(50);
    const rich = nextGoal({ ...defaultProg(), fish: 210 })!;
    expect(rich.affordable).toBe(true);
    expect(rich.item.price).toBe(200);
    const all = defaultProg();
    all.owned.bodies = [0, 1, 2, 3, 4, 5];
    all.owned.hats = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(nextGoal(all)).toBeNull();
  });
});
