import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../../types';
import { KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { GO_TICK } from '../../core/sim/world';
import { effectivePosition, registeredItems, rollItem, rollWeights } from './registry';
import { registerDefaultItems } from './defs';
import { itemsOf } from './state';

describe('item registry and roulette (GDD 4, 4.1)', () => {
  registerDefaultItems();

  it('registers all 8 items, Catnip ×3, and rolls deterministically from the items stream', () => {
    expect(registeredItems().map((d) => d.id)).toEqual([...ITEM_IDS]);
    const a = world(raceConfig(KITCHEN, { seed: 3 }));
    const b = world(raceConfig(KITCHEN, { seed: 3 }));
    for (let i = 0; i < 8; i++) for (let r = 0; r < 5; r++) expect(rollItem(a.ctx, i)).toBe(rollItem(b.ctx, i));
    expect(a.plugins.items.charges?.('catnip')).toBe(3);
    expect(a.plugins.items.charges?.('hairball')).toBe(1);
  });

  it('karts pick up boxes during a race and the field uses items', () => {
    const w = world(raceConfig(KITCHEN, { seed: 4 }));
    while (w.tick < GO_TICK + 60 * 40) w.step();
    const ev = w.st.events;
    expect(ev.some((e) => e.type === 'itemPickup')).toBe(true);
    expect(ev.some((e) => e.type === 'itemReady')).toBe(true);
    expect(ev.filter((e) => e.type === 'itemUse').length).toBeGreaterThan(4);
  });

  it('effective position gets worse far behind the leader', () => {
    const w = world(raceConfig(KITCHEN, { seed: 4 }));
    while (w.tick < GO_TICK + 60) w.step();
    const last = w.st.order[7];
    const base = effectivePosition(w.ctx, last);
    w.st.karts[last].dist -= w.ctx.tun.topSpeed * 13;
    expect(effectivePosition(w.ctx, last)).toBe(Math.min(8, base + 2));
  });

  it('back of the pack gets better items: comeback share rises with position, attack share falls', () => {
    const w = world(raceConfig(KITCHEN, { seed: 8 }));
    while (w.tick < GO_TICK + 10) w.step();
    w.st.karts[0].lap = 2; // Laser Dot allowed
    const comeback: ItemId[] = ['catnip', 'box', 'zoomies', 'laser'];
    const share = (pos: number, set: ItemId[]) => {
      const wts = rollWeights(w.ctx, 0, pos);
      const tot = wts.reduce((a, b) => a + b, 0);
      return ITEM_IDS.reduce((a, id, i) => a + (set.includes(id) ? wts[i] : 0), 0) / tot;
    };
    for (let pos = 2; pos <= 8; pos++) expect(share(pos, comeback)).toBeGreaterThanOrEqual(share(pos - 1, comeback));
    expect(share(8, comeback)).toBeGreaterThan(0.9);
    expect(share(1, ['hairball', 'yarn', 'cucumber'])).toBeGreaterThan(0.85);
    // and the actual rolls follow the table: 2,000 draws as 8th vs as 1st
    const count = (place: number) => {
      const k = w.st.karts[0];
      const savedPlace = k.place;
      k.place = place;
      const n: Record<string, number> = {};
      for (let r = 0; r < 2000; r++) {
        const id = rollItem(w.ctx, 0);
        n[id] = (n[id] ?? 0) + 1;
      }
      k.place = savedPlace;
      return n;
    };
    const last = count(8);
    const first = count(1);
    expect((last.zoomies ?? 0) + (last.laser ?? 0)).toBeGreaterThan(900);
    expect(first.zoomies ?? 0).toBe(0);
    expect(first.laser ?? 0).toBe(0);
    expect((first.hairball ?? 0) + (first.yarn ?? 0) + (first.cucumber ?? 0)).toBeGreaterThan(1700);
  });

  it('Laser Dot: never on lap 1, one at a time, 10 s cooldown, never two held', () => {
    const w = world(raceConfig(KITCHEN, { seed: 5 }));
    while (w.tick < GO_TICK + 10) w.step();
    const k = w.st.karts[0];
    const laserIdx = ITEM_IDS.indexOf('laser');
    k.place = 8;
    k.lap = 1;
    expect(rollWeights(w.ctx, 0, 8)[laserIdx]).toBe(0);
    k.lap = 2;
    expect(rollWeights(w.ctx, 0, 8)[laserIdx]).toBeGreaterThan(0);
    w.st.karts[3].item = 'laser';
    expect(rollWeights(w.ctx, 0, 8)[laserIdx]).toBe(0);
    w.st.karts[3].item = null;
    itemsOf(w.st).laserCd = 30;
    expect(rollWeights(w.ctx, 0, 8)[laserIdx]).toBe(0);
    // blocked rolls are redrawn from the rest: 8th with laser blocked never returns laser
    for (let r = 0; r < 300; r++) expect(rollItem(w.ctx, 0)).not.toBe('laser');
  });

  it('daily modifiers reshape the table (Cucumbers Only)', () => {
    const cfg = { ...raceConfig(KITCHEN, { seed: 6 }), modifiers: 4 };
    const w = world(cfg);
    for (let r = 0; r < 50; r++) expect(rollItem(w.ctx, r % 8)).toBe('cucumber');
  });
});
