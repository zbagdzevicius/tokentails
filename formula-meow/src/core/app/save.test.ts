import { describe, expect, it } from 'vitest';
import { bestKey, loadBlob, migrateProgressV1, Save } from './save';
import { restartSeed } from './restart';

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

  it('two tabs: a write from one keeps the slots the other wrote since it loaded', () => {
    const mem = new Mem();
    const a = new Save(() => mem);
    const b = new Save(() => mem);
    // both tabs load (and cache) the blob
    expect(a.slot('modes', { n: 0 }).get().n).toBe(0);
    expect(b.slot('progression', { fish: 0 }).get().fish).toBe(0);
    a.slot('modes', { n: 0 }).update((v) => (v.n = 5));
    b.slot('progression', { fish: 0 }).set({ fish: 40 });
    b.setSettings({ muted: true });
    a.setSettings({ autoGas: true });
    const stored = loadBlob(mem);
    expect(stored.slots.modes).toEqual({ n: 5 });
    expect(stored.slots.progression).toEqual({ fish: 40 });
    expect(stored.settings.muted).toBe(true);
    expect(stored.settings.autoGas).toBe(true);
    // update() starts from the stored slot, not a stale cached one
    b.slot('modes', { n: 0 }).update((v) => (v.n += 1));
    expect(loadBlob(mem).slots.modes).toEqual({ n: 6 });
  });

  it('a storage event for fm:save drops the cache and tells the lanes', () => {
    const mem = new Mem();
    const a = new Save(() => mem);
    const b = new Save(() => mem);
    const slot = a.slot('modes', { n: 0 });
    expect(slot.get().n).toBe(0);
    b.slot('modes', { n: 0 }).set({ n: 9 });
    let heard = 0;
    a.onExternalChange(() => heard++);
    a.storageChanged('fm:other');
    expect(heard).toBe(0);
    a.storageChanged('fm:save');
    expect(heard).toBe(1);
    expect(slot.get().n).toBe(9);
  });
});

describe('save without storage', () => {
  it('keeps the session state in memory when storage is missing or a write fails', () => {
    const none = new Save(() => null);
    none.slot('modes', { n: 0 }).set({ n: 3 });
    none.setSettings({ muted: true });
    expect(none.slot('modes', { n: 0 }).get().n).toBe(3);
    expect(none.settings().muted).toBe(true);
    const full = new Mem();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const q = new Save(() => full);
    q.slot('modes', { n: 0 }).update((v) => (v.n = 4));
    q.slot('progression', { fish: 0 }).set({ fish: 1 });
    expect(q.slot('modes', { n: 0 }).get().n).toBe(4);
  });
});

describe('restart seed (B37)', () => {
  it('keeps the seed for dares, the Daily Cup, time trials and Grand Prix races; rerolls the rest', () => {
    const fresh = () => 99;
    for (const m of ['dare', 'daily', 'tt', 'gp'] as const) expect(restartSeed(m, 7, fresh)).toBe(7);
    for (const m of ['race', 'battle', undefined] as const) expect(restartSeed(m, 7, fresh)).toBe(99);
  });
});
