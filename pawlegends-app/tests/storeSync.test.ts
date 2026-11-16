/**
 * storeSync.ts (shared by the web host and the app's host): the account's progression in the game stays fresh after
 * every saved match and every return to the foreground, without a restart (founder, Nov 16).
 */
import { describe, expect, it } from 'vitest';
import { caughtUp, StoreSync, STORE_RECHECK_MS, VISIBLE_EVERY_MS, withFloor } from '@/components/pawlegends/storeSync';
import type { PawlegendsStoreState } from '@/components/pawlegends/bridge';

const SEASON = { id: 's1', xp: 900, tier: 2, premium: 'none' as const, skips: 0, claimed: [], endsAt: '2027-01-05T00:00:00.000Z' };
const CHAMPS = { owned: [], founders: false, rotation: { week: 0 }, yarn: { balance: 40, matches: 3, picksLeft: 0, nextPickAt: null }, bundles: [] };
const state = (xp: number, tier: number, yarn = 40, id = 's1'): PawlegendsStoreState => ({ items: [], season: { ...SEASON, id, xp, tier }, champions: { ...CHAMPS, yarn: { ...CHAMPS.yarn, balance: yarn } } });
const tick = async (n = 6) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

function rig(reads: (PawlegendsStoreState | null)[], user = true) {
  const sent: PawlegendsStoreState[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let now = 1_000_000;
  let n = 0;
  const sync = new StoreSync({
    read: async () => {
      n++;
      return reads.length > 1 ? reads.shift()! : reads[0]!;
    },
    send: (s) => sent.push(s),
    hasUser: () => user,
    schedule: (fn, ms) => timers.push({ fn, ms }),
    now: () => now,
  });
  return { sync, sent, timers, reads: () => n, advance: (ms: number) => (now += ms), setUser: (u: boolean) => (user = u) };
}

describe('withFloor / caughtUp', () => {
  it('raises Season XP, tier and Yarn to the floor (same season only) and never lowers them', () => {
    const f = { season: 's1', xp: 1210, tier: 3, yarn: 55 };
    expect(withFloor(state(900, 2), f)).toMatchObject({ season: { xp: 1210, tier: 3 }, champions: { yarn: { balance: 55 } } });
    expect(withFloor(state(1500, 4, 80), f)).toMatchObject({ season: { xp: 1500, tier: 4 }, champions: { yarn: { balance: 80 } } });
    // a new season starts from its own numbers
    expect(withFloor(state(0, 0, 40, 's2'), f).season).toMatchObject({ id: 's2', xp: 0, tier: 0 });
    expect(caughtUp(state(900, 2), f)).toBe(false);
    expect(caughtUp(state(1210, 3, 55), f)).toBe(true);
    expect(caughtUp(state(0, 0, 60, 's2'), f)).toBe(true);
  });
});

describe('StoreSync', () => {
  it('every save that ends saved re-reads the store, with or without an answer, and once more a few seconds later', async () => {
    const r = rig([state(900, 2), state(1210, 3)]);
    await r.sync.refresh();
    expect(r.sent.at(-1)!.season!.xp).toBe(900);
    r.sync.saved(null);
    await tick();
    expect(r.reads()).toBe(2);
    expect(r.sent.at(-1)!.season!.xp).toBe(1210);
    expect(r.timers.map((t) => t.ms)).toEqual([STORE_RECHECK_MS]);
    r.timers[0]!.fn();
    await tick();
    expect(r.reads()).toBe(3);
  });

  it("shows the save's own totals at once and keeps them while reads lag behind, then lets the reads lead", async () => {
    const r = rig([state(900, 2, 40)]);
    await r.sync.refresh();
    r.sync.saved({ gained: 310, xp: 1210, tier: 3, prevTier: 2, yarn: { gained: 15, balance: 55, newPicks: 0 } });
    // sent before any read answers
    expect(r.sent.at(-1)).toMatchObject({ season: { xp: 1210, tier: 3 }, champions: { yarn: { balance: 55 } } });
    await tick();
    // the lagging read (still 900) does not take it back
    expect(r.sent.every((s, i) => i === 0 || s.season!.xp === 1210)).toBe(true);
    // the read caught up and moved on (a pass claim elsewhere): the floor is gone, the read leads
    r.sync.accept(state(1500, 4, 70));
    r.sync.accept(state(1500, 4, 70));
    expect(r.sent.at(-1)).toMatchObject({ season: { xp: 1500, tier: 4 }, champions: { yarn: { balance: 70 } } });
  });

  it('reads never overlap: a refresh asked during one runs once more after it', async () => {
    let release: (s: PawlegendsStoreState) => void = () => undefined;
    const sent: PawlegendsStoreState[] = [];
    let reads = 0;
    const sync = new StoreSync({
      read: () => {
        reads++;
        return new Promise((res) => (release = res));
      },
      send: (s) => sent.push(s),
      hasUser: () => true,
      schedule: () => undefined,
    });
    const a = sync.refresh();
    void sync.refresh();
    void sync.refresh();
    expect(reads).toBe(1);
    release(state(900, 2));
    await a;
    await tick();
    expect(reads).toBe(2);
    release(state(950, 2));
    await tick();
    expect(sent.at(-1)!.season!.xp).toBe(950);
  });

  it('back to the foreground: a refresh, at most every VISIBLE_EVERY_MS', async () => {
    const r = rig([state(900, 2)]);
    await r.sync.refresh();
    expect(r.sync.visible()).toBe(false);
    r.advance(VISIBLE_EVERY_MS);
    expect(r.sync.visible()).toBe(true);
    await tick();
    expect(r.reads()).toBe(2);
  });

  it('no user: the empty store, no read; a failed read keeps the last state; reset drops the old floor', async () => {
    const r = rig([state(900, 2)], false);
    await r.sync.refresh();
    expect(r.reads()).toBe(0);
    expect(r.sent.at(-1)).toEqual({ items: [], season: null });
    r.setUser(true);
    const f = rig([state(900, 2), null]);
    await f.sync.refresh();
    await f.sync.refresh();
    expect(f.sent).toHaveLength(1);
    f.sync.saved({ gained: 300, xp: 1200, tier: 3, prevTier: 2 });
    f.sync.reset();
    f.sync.accept(state(100, 0));
    expect(f.sent.at(-1)!.season!.xp).toBe(100);
  });
});
