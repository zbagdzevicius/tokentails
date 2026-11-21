/**
 * storeSync.ts after a match (founder, Nov 21: "after a match profile stats / season xp / yarn / tier is not updated"):
 * a failed store read right after a save is tried again (twice at most in a row) instead of leaving the game on the
 * old numbers until the next foreground. The rest of StoreSync is covered in pawlegends-app/tests/storeSync.test.ts.
 */
import { StoreSync, STORE_RECHECK_MS, STORE_RETRIES, STORE_RETRY_MS } from "@/components/pawlegends/storeSync";
import type { PawlegendsStoreState } from "@/components/pawlegends/bridge";

const SEASON = { id: "s1", xp: 900, tier: 2, premium: "none" as const, skips: 0, claimed: [], endsAt: "2027-01-05T00:00:00.000Z" };
const CHAMPS = { owned: [], founders: false, rotation: { week: 0 }, yarn: { balance: 40, matches: 3, picksLeft: 0, nextPickAt: null }, bundles: [] };
const state = (xp: number, tier: number, yarn = 40): PawlegendsStoreState =>
  ({ items: [], season: { ...SEASON, xp, tier }, champions: { ...CHAMPS, yarn: { ...CHAMPS.yarn, balance: yarn } } }) as never;
const tick = async (n = 8) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

function rig(reads: (PawlegendsStoreState | null)[]) {
  const sent: PawlegendsStoreState[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let n = 0;
  const sync = new StoreSync({
    read: async () => {
      n++;
      return reads.length > 1 ? reads.shift()! : reads[0]!;
    },
    send: (s) => sent.push(s),
    hasUser: () => true,
    schedule: (fn, ms) => timers.push({ fn, ms }),
    now: () => 1_000_000,
  });
  return { sync, sent, timers, reads: () => n };
}

describe("StoreSync: a failed read is retried", () => {
  it("a read that fails after a save is tried again a few seconds later and the new totals arrive", async () => {
    const r = rig([state(900, 2), null, state(1210, 3, 55)]);
    await r.sync.refresh();
    r.sync.saved(null);
    await tick();
    // the save's read failed: a retry is scheduled besides the usual recheck
    expect(r.timers.map((t) => t.ms).sort((a, b) => a - b)).toEqual([STORE_RECHECK_MS, STORE_RETRY_MS]);
    r.timers.find((t) => t.ms === STORE_RETRY_MS)!.fn();
    await tick();
    expect(r.sent.at(-1)).toMatchObject({ season: { xp: 1210, tier: 3 }, champions: { yarn: { balance: 55 } } });
  });

  it(`stops after ${STORE_RETRIES} failures in a row (no endless polling), and a later read retries again`, async () => {
    const r = rig([null]);
    await r.sync.refresh();
    for (let i = 0; i < 5; i++) {
      const t = r.timers.shift();
      if (!t) break;
      t.fn();
      await tick();
    }
    expect(r.reads()).toBe(1 + STORE_RETRIES);
    expect(r.timers).toHaveLength(0);
    await r.sync.refresh();
    expect(r.timers).toHaveLength(1);
  });
});
