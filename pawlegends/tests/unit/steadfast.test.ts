/**
 * Sim v17 Steadfast (docs/plans/moba/V17.md §3.1; RESEARCH §C6 "after 2 s of hard CC within 4 s, 1 s of CC immunity"):
 * hard CC on a hero counts toward CC_DR.cap ticks of lock in a CC_DR.window-tick window; the CC that reaches the cap is
 * cut short and CC_DR.immune ticks of immunity follow the lock.
 */
import { describe, expect, it } from 'vitest';
import { CC_DR } from '../../src/data/effects';
import { charm, cleanse, fear, knockback, root, selfRoot, stun } from '../../src/sim/effects';
import { clearStatus, disabled } from '../../src/sim/effects/status';
import { Op } from '../../src/sim/api';
import { step, snapshot } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { Rng } from '../../src/sim/rng';
import { Buff, Kind, RANGE, createWorld, hashWorld } from '../../src/sim/world';
import { MID, cast, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';

// Clem (0), Sage (1), Gabby (2) vs Clem (3), Sage (4), Lambo (5). The victim is slot 3.
const V = 3;

function arena() {
  const m = heroMatch(['clem', 'sage', 'gabe', 'clem', 'sage', 'lambo']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -20000 : 20000), MID.y + (id % 3) * 6000, 0);
  place(m, V, MID.x, MID.y, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, V);
  return m;
}

/** Locked: unable to act, or rooted (the "lock" of the RESEARCH rule). */
const locked = (m: ReturnType<typeof arena>, id: number): boolean => disabled(m.world, id) || m.world.rootT[id] > 0;

/** Step until `id` is free; returns the ticks it stayed locked. */
function lockRun(m: ReturnType<typeof arena>, id: number): number {
  let n = 0;
  while (locked(m, id) && n < 1000) {
    step(m);
    n++;
  }
  return n;
}

describe('sim v17 Steadfast (CC cap and immunity)', () => {
  it('data: 60 ticks of lock in a 120-tick window, then 30 ticks of immunity', () => {
    expect(CC_DR).toEqual({ window: 120, cap: 60, immune: 30 });
    expect(Buff.Steadfast).toBe(1 << 19); // lint-sim: allow (a bit index)
  });

  it('stun 30, fear 30, charm 30 back to back: exactly 60 locked ticks, 30 immune after, then CC lands again', () => {
    const m = arena();
    const w = m.world;
    stun(w, V, 30);
    expect(w.ccSum[V]).toBe(30);
    let total = lockRun(m, V);
    fear(w, V, 30, w.x[V] - 1000, w.y[V]);
    expect(w.ccSum[V]).toBe(CC_DR.cap);
    // The cap is reached by the fear: the charm right after misses.
    charm(w, V, 30, 0);
    total += lockRun(m, V);
    expect(total).toBe(60);
    expect(w.ccImmT[V]).toBe(30);
    steps(m, 10);
    stun(w, V, 30);
    expect(w.stunT[V]).toBe(0);
    steps(m, 21);
    expect(w.ccImmT[V]).toBe(0);
    stun(w, V, 30);
    expect(w.stunT[V]).toBe(30);
    expect(w.ccSum[V]).toBe(30);
  });

  it('only the lock a CC adds beyond the running one counts', () => {
    const m = arena();
    const w = m.world;
    stun(w, V, 30);
    steps(m, 10);
    expect(w.stunT[V]).toBe(20);
    stun(w, V, 30);
    expect(w.ccSum[V]).toBe(40);
    // Fully overlapped: free.
    root(w, V, 15);
    expect(w.ccSum[V]).toBe(40);
  });

  it('a fresh window after 120 ticks: stun 15, wait 121, stun 60 lasts 60, then immunity', () => {
    const m = arena();
    const w = m.world;
    stun(w, V, 15);
    steps(m, 121);
    expect(w.ccWinT[V]).toBe(0);
    stun(w, V, 60);
    expect(w.stunT[V]).toBe(60);
    expect(w.ccImmT[V]).toBe(60 + CC_DR.immune);
  });

  it('a long single CC is cut at the cap; the knockback counts its flight', () => {
    const m = arena();
    const w = m.world;
    stun(w, V, 200);
    expect(w.stunT[V]).toBe(CC_DR.cap);
    const n = arena();
    knockback(n, V, n.world.x[V] - 1000, n.world.y[V], 2000, 0);
    expect(n.world.ccSum[V]).toBe(6);
  });

  it('heroes only: a minion and a camp rat stunned for 200 ticks stay stunned 200', () => {
    const m = arena();
    const w = m.world;
    for (const [id, kind] of [[RANGE.minions, Kind.Minion], [RANGE.camps, Kind.Camp]]) {
      w.alive[id] = 1;
      w.kind[id] = kind;
      stun(w, id, 200);
      expect(w.stunT[id]).toBe(200);
      expect(w.ccSum[id]).toBe(0);
    }
  });

  it('self-roots (Pixel E, Nugget E, Loaf) never count', () => {
    const m = arena();
    const w = m.world;
    selfRoot(w, V, 45);
    expect(w.rootT[V]).toBe(45);
    expect(w.ccSum[V]).toBe(0);
  });

  it('a cleanse keeps the count; death clears count, window and immunity', () => {
    const m = arena();
    const w = m.world;
    stun(w, V, 40);
    cleanse(w, V, 15);
    expect(w.ccSum[V]).toBe(40);
    expect(w.ccWinT[V]).toBeGreaterThan(0);
    stun(w, V, 60);
    expect(w.ccImmT[V]).toBeGreaterThan(0);
    w.hp[V] = 1;
    // Any lethal damage path ends in clearStatus.
    w.alive[V] = 0;
    clearStatus(w, V);
    expect([w.ccSum[V], w.ccWinT[V], w.ccImmT[V]]).toEqual([0, 0, 0]);
  });

  it('hashWorld covers ccSum and ccWinT', () => {
    const a = createWorld(1);
    const b = createWorld(1);
    b.ccSum[2] = 7;
    expect(hashWorld(b)).not.toBe(hashWorld(a));
    const c = createWorld(1);
    c.ccWinT[2] = 7;
    expect(hashWorld(c)).not.toBe(hashWorld(a));
  });

  it('Buff.Steadfast shows only while the cap immunity runs, not for a plain Purr-ify', () => {
    const m = arena();
    const w = m.world;
    cleanse(w, V, 30);
    step(m);
    expect(w.buffs[V] & Buff.Steadfast).toBe(0);
    expect(w.buffs[V] & Buff.Purrified).not.toBe(0);
    const n = arena();
    stun(n.world, V, 60);
    step(n);
    expect(n.world.buffs[V] & Buff.Steadfast).not.toBe(0);
    expect(snapshot(n, 0).entities.find((e) => e.id === V)!.buffs & Buff.Steadfast).not.toBe(0);
    steps(n, 59 + CC_DR.immune);
    expect(n.world.ccImmT[V]).toBe(0);
    expect(n.world.buffs[V] & Buff.Steadfast).toBe(0);
  });

  it('chain fuzz: random hard CC every few ticks never locks a hero for more than 60 ticks in a row', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const m = arena();
      const w = m.world;
      const rng = new Rng(seed);
      let run = 0;
      let longest = 0;
      for (let t = 0; t < 1500; t++) {
        if (rng.int(4) === 0) {
          const ticks = 6 + rng.int(40);
          switch (rng.int(5)) {
            case 0:
              stun(w, V, ticks);
              break;
            case 1:
              root(w, V, ticks);
              break;
            case 2:
              fear(w, V, ticks, w.x[V] - 1000, w.y[V]);
              break;
            case 3:
              charm(w, V, ticks, 5);
              break;
            default:
              knockback(m, V, w.x[V] - 500, w.y[V], 1500, 0);
          }
        }
        step(m);
        run = locked(m, V) ? run + 1 : 0;
        longest = Math.max(longest, run);
        // Keep the victim in the open.
        if (t % 50 === 0 && !locked(m, V)) place(m, V, MID.x, MID.y, 0);
      }
      expect(longest, `seed ${seed}`).toBeLessThanOrEqual(CC_DR.cap);
    }
  }, 60_000);

  it('CHAMPS §2(d) chain: Lambo E → Lambo R → Gabby R on a hero walking away locks it at most 60 ticks in a row', () => {
    // Gabby (2) and Lambo (5) are on different teams here, so build a dedicated line-up: Clem victim (0) vs Lambo (3), Gabby (4).
    const m = heroMatch(['clem', 'sage', 'clem', 'lambo', 'gabe', 'sage']);
    const w = m.world;
    for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 6000, 0);
    const VIC = 0;
    place(m, VIC, MID.x, MID.y, 0);
    place(m, 3, MID.x + 4500, MID.y, 2048);
    place(m, 4, MID.x + 4000, MID.y + 800, 2048);
    for (const id of [3, 4]) setLevel(m, id, 10);
    hold(m, 0, 1, 2, 3, 4, 5);
    tanky(m, VIC);
    let run = 0;
    let longest = 0;
    let lambo = 0;
    let gabe = 0;
    for (let t = 0; t < 150; t++) {
      // The victim stands until the first CC lands (v17's windups would let it walk out), then walks straight away.
      if (lambo >= 1 && (w.stunT[VIC] > 0 || longest > 0)) applyOrder(m, VIC, { op: Op.Move, x: MID.x - 20000, y: w.y[VIC] });
      if (lambo === 0) {
        cast(m, 3, 2, w.x[VIC], w.y[VIC]);
        lambo = 1;
      } else if (lambo === 1 && w.stunT[VIC] > 0 && w.stunT[VIC] <= 2) {
        cast(m, 3, 3, w.x[VIC], w.y[VIC]);
        lambo = 2;
      } else if (lambo === 2 && gabe === 0 && w.rootT[VIC] > 0 && w.rootT[VIC] <= 20) {
        cast(m, 4, 3, w.x[VIC], w.y[VIC]);
        gabe = 1;
      } else step(m);
      run = locked(m as never, VIC) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    // Lambo E 15 + R 30 + Gabby R 15 = 60 (v16: 75), then immunity.
    expect(longest).toBeGreaterThanOrEqual(45);
    expect(longest).toBeLessThanOrEqual(CC_DR.cap);
  });
});
