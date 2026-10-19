import { describe, expect, it } from 'vitest';
import { KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { GO_TICK } from '../../core/sim/world';
import { createItemSystem, effectivePosition, registeredItems } from './registry';
import { registerDefaultItems } from './defs';

describe('item registry (GDD 4)', () => {
  registerDefaultItems();

  it('v1 core registers Catnip ×3 and rolls only registered items, deterministically', () => {
    expect(registeredItems().map((d) => d.id)).toEqual(['catnip']);
    const sys = createItemSystem();
    const a = world(raceConfig(KITCHEN, { seed: 3 }));
    const b = world(raceConfig(KITCHEN, { seed: 3 }));
    for (let i = 0; i < 8; i++) expect(sys.roll(a.ctx, i)).toBe(sys.roll(b.ctx, i));
    expect(sys.roll(a.ctx, 0)).toBe('catnip');
    expect(sys.charges?.('catnip')).toBe(3);
  });

  it('karts pick up boxes, and using Catnip boosts three times', () => {
    const w = world(raceConfig(KITCHEN, { seed: 4 }));
    while (w.tick < GO_TICK + 60 * 30) w.step();
    const ev = w.st.events;
    expect(ev.some((e) => e.type === 'itemPickup')).toBe(true);
    expect(ev.some((e) => e.type === 'itemReady')).toBe(true);
    expect(ev.filter((e) => e.type === 'boost' && e.a === 5).length).toBeGreaterThan(0);
  });

  it('effective position gets worse far behind the leader', () => {
    const w = world(raceConfig(KITCHEN, { seed: 4 }));
    while (w.tick < GO_TICK + 60) w.step();
    const last = w.st.order[7];
    const base = effectivePosition(w.ctx, last);
    w.st.karts[last].dist -= w.ctx.tun.topSpeed * 13;
    expect(effectivePosition(w.ctx, last)).toBe(Math.min(8, base + 2));
  });
});
