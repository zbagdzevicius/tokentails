import { describe, expect, it } from 'vitest';
import { bestKey, loadBlob, migrateProgressV1 } from './save';

class Mem {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe('save v2 (iteration 2)', () => {
  it('migrates v1 settings and progress once, keeping the v1 keys', () => {
    const s = new Mem();
    s.setItem('fm:settings', JSON.stringify({ autoGas: true, oneThumb: false, reducedMotion: false, muted: true, cls: 1 }));
    s.setItem('fm:progress', JSON.stringify({ races: 7, unlocked: 2, pounces: 3, drifts: 4, bestTimes: { kitchen: 1, 'kitchen:1': 71.2 } }));
    const b = loadBlob(s);
    expect(b.v).toBe(2);
    expect(b.settings.autoGas).toBe(true);
    expect(b.settings.cls).toBe(1);
    expect(b.settings.musicVol).toBeGreaterThan(0);
    const core = b.slots.core as ReturnType<typeof migrateProgressV1>;
    expect(core.unlocked).toBe(2);
    expect(core.races).toBe(7);
    expect(core.bestTimes[bestKey('race', 'kitchen', 1, 0)]).toBe(71.2);
    expect(s.getItem('fm:progress')).not.toBeNull();
    // the second load reads v2 and does not migrate again
    s.setItem('fm:progress', JSON.stringify({ races: 99, unlocked: 0 }));
    expect((loadBlob(s).slots.core as { races: number }).races).toBe(7);
  });

  it('survives junk and missing storage', () => {
    const s = new Mem();
    s.setItem('fm:save', '{not json');
    expect(loadBlob(s).v).toBe(2);
    expect(loadBlob(null).settings.cls).toBe(0);
    const p = migrateProgressV1({ unlocked: 7, bestTimes: { 'a:0': 'x' } });
    expect(p.unlocked).toBe(2);
    expect(Object.keys(p.bestTimes)).toEqual([]);
  });
});
