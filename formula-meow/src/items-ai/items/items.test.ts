import { describe, expect, it } from 'vitest';
import { NO_INPUT, type ItemId, type RaceConfig, type TickInput } from '../../types';
import { ovalTrack } from '../../test/fixtures';
import { buildField, createSimPlugins } from '..';
import { SimWorld, GO_TICK } from '../../core/sim/world';
import { followLine } from '../../core/sim/autopilot';
import { placeOnTrack } from '../../core/sim/kart';
import { cosL, sinL } from '../../core/sim/fixed';
import { ProjKind, TrapKind, itemsOf } from './state';

/**
 * A scripted scene on the test oval: `n` human karts placed at the given distances (m past the start, on the first
 * straight) and lateral offsets, all driving the line at a steady speed. Kart 0 is the attacker.
 */
function scene(pos: Array<{ at: number; d?: number; speed?: number }>): { w: SimWorld; drive: (extra?: Partial<TickInput>[]) => void } {
  const racers = buildField({ seed: 1, cls: 0, playerSlot: 0 }).slice(0, pos.length).map((r) => ({ ...r, ai: undefined }));
  const cfg: RaceConfig = { track: ovalTrack(), seed: 1, cls: 0, modifiers: 0, racers, humans: pos.map((_, i) => i), forgiving: true };
  const w = new SimWorld(cfg, createSimPlugins());
  while (w.tick < GO_TICK + 1) w.step(pos.map(() => NO_INPUT));
  const t = w.track;
  pos.forEach((p, i) => {
    const k = w.st.karts[i];
    const si = Math.round(p.at / t.step);
    placeOnTrack(w.ctx, k, si, p.d ?? 0);
    k.dist = k.s;
    k.lap = 1;
    k.progDist = k.dist;
    const sp = p.speed ?? 12;
    k.vx = sinL(k.heading) * sp;
    k.vz = cosL(k.heading) * sp;
  });
  const drive = (extra: Partial<TickInput>[] = []) => {
    const ins = pos.map((p, i) => {
      const o: TickInput = { ...NO_INPUT };
      followLine(w.ctx, i, o, (p.d ?? 0) / 8);
      o.gas = i === 0 || (p.speed ?? 12) > 12;
      return { ...o, ...(extra[i] ?? {}) };
    });
    w.step(ins);
  };
  drive(); // positions and order settle
  return { w, drive };
}

function give(w: SimWorld, k: number, item: ItemId, n = 1): void {
  w.st.karts[k].item = item;
  w.st.karts[k].itemCount = n;
  w.st.karts[k].rouletteTicks = 0;
}

const hitsOn = (w: SimWorld, k: number) => w.st.events.filter((e) => e.type === 'hit' && e.kart === k);

function run(drive: () => void, ticks: number): void {
  for (let i = 0; i < ticks; i++) drive();
}

describe('items (GDD 4)', () => {
  it('Hairball forward spins out the kart ahead; thrown back hits the one behind', () => {
    const { w, drive } = scene([{ at: 20 }, { at: 40 }, { at: 8 }]);
    give(w, 0, 'hairball');
    drive([{ item: true }]);
    expect(itemsOf(w.st).proj.length).toBe(1);
    run(drive, 90);
    expect(hitsOn(w, 1).some((e) => e.a === 0 && e.b === 0)).toBe(true);
    expect(w.st.karts[0].item).toBeNull();
    give(w, 0, 'hairball');
    const before = hitsOn(w, 2).length;
    // the kart behind sits in the thrower's lane, 12 m back
    const k0 = w.st.karts[0];
    const k2 = w.st.karts[2];
    placeOnTrack(w.ctx, k2, k0.si - Math.round(12 / w.track.step), k0.d);
    k2.dist = k0.dist - 12;
    k2.progDist = k2.dist;
    drive([{ item: true, itemBack: true }]);
    run(drive, 60);
    expect(hitsOn(w, 2).length).toBeGreaterThan(before);
    expect(itemsOf(w.st).proj.length).toBe(0);
  });

  it('a Hairball bounces off walls at most 3 times and lives 4 s', () => {
    const { w, drive } = scene([{ at: 20 }]);
    w.st.karts[0].heading += 0.9; // aim at the wall
    give(w, 0, 'hairball');
    drive([{ item: true }]);
    const p = itemsOf(w.st).proj[0];
    let maxB = 0;
    for (let i = 0; i < 300 && itemsOf(w.st).proj.length; i++) {
      maxB = Math.max(maxB, p.bounces);
      drive();
    }
    expect(maxB).toBeGreaterThan(0);
    expect(maxB).toBeLessThanOrEqual(4);
    expect(itemsOf(w.st).proj.length).toBe(0);
  });

  it('Yarn thrown forward homes on the kart ahead, even off to the side', () => {
    const { w, drive } = scene([{ at: 20 }, { at: 50, d: 4.5 }]);
    give(w, 0, 'yarn');
    drive([{ item: true }]);
    const p = itemsOf(w.st).proj[0];
    expect(p.kind).toBe(ProjKind.YarnBall);
    expect(p.target).toBe(1);
    run(drive, 120);
    expect(hitsOn(w, 1).length).toBe(1);
  });

  it('a held Yarn is a shield: eats one hit from behind', () => {
    const { w, drive } = scene([{ at: 20 }, { at: 40 }]);
    give(w, 1, 'yarn');
    give(w, 0, 'hairball');
    drive([{ item: true }]);
    run(drive, 90);
    expect(hitsOn(w, 1).length).toBe(0);
    expect(w.st.karts[1].item).toBeNull();
    expect(w.st.events.some((e) => e.type === 'blocked' && e.kart === 1)).toBe(true);
  });

  it('Yarn dropped behind is a trap that spins the kart that drives into it; at most 12 on the track', () => {
    const { w, drive } = scene([{ at: 40 }, { at: 25, speed: 16 }]);
    give(w, 0, 'yarn');
    drive([{ item: true, itemBack: true }]);
    expect(itemsOf(w.st).traps[0].kind).toBe(TrapKind.Yarn);
    run(drive, 120);
    expect(hitsOn(w, 1).some((e) => e.a === 0)).toBe(true);
    expect(itemsOf(w.st).traps.length).toBe(0);
    for (let i = 0; i < 15; i++) {
      give(w, 0, 'yarn');
      drive([{ item: true, itemBack: true }]);
      drive();
    }
    expect(itemsOf(w.st).traps.length).toBeLessThanOrEqual(12);
  });

  it('Cucumber lobbed ahead lands as a trap; the cat that hits it does the leap', () => {
    const { w, drive } = scene([{ at: 20, speed: 18 }, { at: 8, speed: 18 }]);
    give(w, 0, 'cucumber');
    drive([{ item: true }]);
    const tr = itemsOf(w.st).traps[0];
    expect(tr.kind).toBe(TrapKind.Cucumber);
    expect(tr.flight).toBeGreaterThan(0);
    expect(tr.dist - w.st.karts[0].dist).toBeGreaterThan(18);
    run(drive, 180);
    expect(hitsOn(w, 0).length).toBe(0); // the thrower drives past its own cucumber
    expect(hitsOn(w, 1).some((e) => e.a === 1 && e.b === 0)).toBe(true); // the kart behind leaps
  });

  it('Cardboard Box blocks hits for 3 s; Zoomies is invincible and knocks karts aside', () => {
    const { w, drive } = scene([{ at: 20 }, { at: 40 }]);
    give(w, 1, 'box');
    drive([{}, { item: true }]);
    expect(w.st.karts[1].shieldTicks).toBeGreaterThan(170);
    give(w, 0, 'hairball');
    drive([{ item: true }]);
    run(drive, 60);
    expect(hitsOn(w, 1).length).toBe(0);
    expect(w.st.events.some((e) => e.type === 'blocked' && e.kart === 1)).toBe(true);

    const z = scene([{ at: 20 }, { at: 30, speed: 6 }]);
    give(z.w, 0, 'zoomies');
    z.drive([{ item: true }]);
    expect(z.w.st.karts[0].autoTicks).toBeGreaterThan(170);
    run(z.drive, 60);
    expect(hitsOn(z.w, 1).some((e) => e.b === 0)).toBe(true);
    expect(hitsOn(z.w, 0).length).toBe(0);
  });

  it('Bell Collar wobbles every rival within 25 m and nobody further', () => {
    const { w, drive } = scene([{ at: 40 }, { at: 55 }, { at: 30, d: 3 }, { at: 90 }]);
    give(w, 0, 'bell');
    drive([{ item: true }]);
    expect(hitsOn(w, 1).some((e) => e.a === 2)).toBe(true);
    expect(hitsOn(w, 2).some((e) => e.a === 2)).toBe(true);
    expect(hitsOn(w, 3).length).toBe(0);
  });

  it('Laser Dot: chases everyone it passes, warns the leader, spins the leader, then cools down', () => {
    const { w, drive } = scene([{ at: 10 }, { at: 30 }, { at: 70 }]);
    give(w, 0, 'laser');
    drive([{ item: true }]);
    let warned = false;
    for (let i = 0; i < 400 && itemsOf(w.st).proj.length; i++) {
      drive();
      if (itemsOf(w.st).laserWarn === 2) warned = true;
    }
    expect(warned).toBe(true);
    expect(hitsOn(w, 1).some((e) => e.a === 3)).toBe(true);
    expect(hitsOn(w, 2).some((e) => e.a === 0 && e.b === 0)).toBe(true);
    expect(itemsOf(w.st).laserCd).toBeGreaterThan(0);
  });

  it('item state is part of the state hash', () => {
    const a = scene([{ at: 20 }, { at: 40 }]);
    const b = scene([{ at: 20 }, { at: 40 }]);
    give(a.w, 0, 'yarn');
    give(b.w, 0, 'yarn');
    a.drive([{ item: true, itemBack: true }]);
    b.drive([{ item: true, itemBack: true }]);
    expect(a.w.hash()).toBe(b.w.hash());
    itemsOf(b.w.st).traps[0].d += 0.5;
    expect(a.w.hash()).not.toBe(b.w.hash());
  });
});
