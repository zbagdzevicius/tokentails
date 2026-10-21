/**
 * Item fixes in SIM_VERSION 10 (items-ai lane):
 * - "forward" and "back" are the way the thrower faces (a kart driving against the lap: an arena, a spin);
 * - a homing yarn ball never hits its own thrower;
 * - items used on a branch are placed on the branch, a hairball there bounces off the branch's walls, a yarn ball
 *   follows its target onto a branch at the fork;
 * - finished karts break no item boxes and do not block the Laser Dot;
 * - the race item brain aims at no boxed, Zoomies or invulnerable kart.
 */
import { describe, expect, it } from 'vitest';
import { NO_INPUT, type ItemId, type Personality, type RaceConfig, type TickInput, type TrackDef } from '../../types';
import { ovalTrack } from '../../test/fixtures';
import { buildField, createSimPlugins } from '..';
import { GO_TICK, SimWorld } from '../../core/sim/world';
import { placeOnTrack } from '../../core/sim/kart';
import { atan2L, cosL, sinL, PI } from '../../core/sim/fixed';
import { queryTrack, type TrackHit } from '../../core/track/query';
import type { BuiltBranch } from '../../core/track/branch';
import { CAFE } from '../../core/track/tracks';
import { Surface } from '../../types';
import { ITEMS } from '../../tuning';
import { ProjKind, TrapKind, itemsOf } from './state';
import { dropTrap, lobCucumber } from './traps';
import { fireHairball, fireYarnBall } from './projectiles';
import { laser } from './defs';
import { newBrain, useItems } from '../ai/item-brain';

/** All 8 karts are humans (no AI), parked; inputs come from the test. */
function humanWorld(track: TrackDef): SimWorld {
  const racers = buildField({ seed: 1, cls: 0, playerSlot: 0 }).map((r) => ({ ...r, ai: undefined }));
  const cfg: RaceConfig = { track, seed: 1, cls: 0, modifiers: 0, racers, humans: racers.map((_, i) => i), forgiving: true };
  const w = new SimWorld(cfg, createSimPlugins());
  while (w.tick < GO_TICK + 1) w.step(racers.map(() => NO_INPUT));
  // park everyone far apart on the main loop so nobody is in the way
  w.st.karts.forEach((k, i) => {
    placeOnTrack(w.ctx, k, Math.round((i * w.track.n) / 8), 0);
    k.vx = k.vz = 0;
    k.dist = k.s;
    k.lap = 1;
  });
  return w;
}

const idle = (w: SimWorld, n: number, ins: Partial<TickInput>[] = []) => {
  for (let i = 0; i < n; i++) w.step(w.st.karts.map((_, j) => ({ ...NO_INPUT, ...(ins[j] ?? {}) })));
};

function give(w: SimWorld, k: number, item: ItemId): void {
  w.st.karts[k].item = item;
  w.st.karts[k].itemCount = 1;
  w.st.karts[k].rouletteTicks = 0;
}

/** Signed metres of a world point in front of kart k (along its heading). */
const inFront = (w: SimWorld, k: number, x: number, z: number) => {
  const m = w.st.karts[k];
  return (x - m.x) * sinL(m.heading) + (z - m.z) * cosL(m.heading);
};

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };

/** Put kart k on branch b at its sample j (lateral d from the branch's centre line), facing along the branch. */
function placeOnBranch(w: SimWorld, k: number, b: BuiltBranch, j: number, d = 0): void {
  const m = w.st.karts[k];
  m.x = b.px[j] - b.tz[j] * d;
  m.z = b.pz[j] + b.tx[j] * d;
  m.heading = atan2L(b.tx[j], b.tz[j]);
  queryTrack(w.track, m.x, m.z, b.mapI[j], hit);
  expect(hit.branch).toBe(b.id);
  m.y = hit.y;
  m.si = hit.i;
  m.s = hit.s;
  m.d = hit.d;
  m.dist = hit.s + w.track.length;
  m.lap = 2;
  m.branch = b.id;
  m.vx = m.vz = 0;
}

describe('items face the way the kart faces (SIM_VERSION 10)', () => {
  it('a kart facing against the lap drops its trap behind its tail and lobs its cucumber in front of its nose', () => {
    const w = humanWorld(ovalTrack());
    const k = w.st.karts[0];
    placeOnTrack(w.ctx, k, 40, 0);
    k.dist = k.s + w.track.length;
    k.heading += PI; // turned round
    dropTrap(w.ctx, 0, TrapKind.Yarn);
    lobCucumber(w.ctx, 0);
    const [tangle, cuke] = itemsOf(w.st).traps;
    expect(inFront(w, 0, tangle.x, tangle.z)).toBeLessThan(-ITEMS.trap.drop + 1);
    expect(inFront(w, 0, cuke.x, cuke.z)).toBeGreaterThan(ITEMS.cucumber.lob - 1);
    // and facing along the lap, the same calls go the other way round
    k.heading -= PI;
    dropTrap(w.ctx, 0, TrapKind.Yarn);
    lobCucumber(w.ctx, 0);
    const [, , tangle2, cuke2] = itemsOf(w.st).traps;
    expect(inFront(w, 0, tangle2.x, tangle2.z)).toBeLessThan(-ITEMS.trap.drop + 1);
    expect(inFront(w, 0, cuke2.x, cuke2.z)).toBeGreaterThan(ITEMS.cucumber.lob - 1);
  });

  it('a yarn ball thrown facing against the lap rolls in front of the thrower and homes on the kart there', () => {
    const w = humanWorld(ovalTrack());
    const t = w.track;
    const k = w.st.karts[0];
    placeOnTrack(w.ctx, k, 60, 0);
    k.dist = k.s + t.length;
    k.heading += PI;
    // a kart 25 m in front of the turned-round thrower (lower on the lap)
    const v = w.st.karts[1];
    placeOnTrack(w.ctx, v, 60 - Math.round(25 / t.step), 2);
    v.dist = v.s + t.length;
    fireYarnBall(w.ctx, 0);
    const p = itemsOf(w.st).proj[0];
    expect(p.dir).toBe(-1);
    expect(p.target).toBe(1);
    expect(inFront(w, 0, p.x, p.z)).toBeGreaterThan(0);
    for (let i = 0; i < 120 && p.life > 0; i++) idle(w, 1);
    expect(w.st.events.some((e) => e.type === 'hit' && e.kart === 1 && e.b === 0)).toBe(true);
  });

  it("a held yarn shields from behind the kart's tail, not from lower on the lap", () => {
    const w = humanWorld(ovalTrack());
    const t = w.track;
    const v = w.st.karts[1];
    placeOnTrack(w.ctx, v, 60, 0);
    v.dist = v.s + t.length;
    v.heading += PI; // the victim drives against the lap
    give(w, 1, 'yarn');
    // a hairball from in front of its nose (lower on the lap) is not "from behind"
    const a = w.st.karts[0];
    placeOnTrack(w.ctx, a, 60 - Math.round(14 / t.step), 0);
    a.dist = a.s + t.length;
    fireHairball(w.ctx, 0, false);
    for (let i = 0; i < 90 && itemsOf(w.st).proj.length; i++) idle(w, 1);
    expect(w.st.events.some((e) => e.type === 'hit' && e.kart === 1 && e.b === 0)).toBe(true);
  });
});

describe('a homing yarn ball never hits its own thrower (SIM_VERSION 10)', () => {
  it('the thrower drives through its own ball', () => {
    const w = humanWorld(ovalTrack());
    const k = w.st.karts[0];
    placeOnTrack(w.ctx, k, 40, 0);
    k.dist = k.s + w.track.length;
    fireYarnBall(w.ctx, 0);
    const p = itemsOf(w.st).proj[0];
    expect(p.kind).toBe(ProjKind.YarnBall);
    // well after the owner immunity: the owner catches its ball up (a fast kart on the inside of a bend)
    idle(w, 40);
    expect(p.life).toBeGreaterThan(0);
    k.x = p.x;
    k.z = p.z;
    idle(w, 2);
    expect(w.st.events.some((e) => e.type === 'hit' && e.kart === 0)).toBe(false);
    expect(p.life).toBeGreaterThan(0);
  });
});

describe('items on a branch (SIM_VERSION 10)', () => {
  const setup = () => {
    const w = humanWorld(CAFE);
    const b = w.track.branches[0];
    expect(b).toBeTruthy();
    return { w, b, mid: Math.floor(b.m / 2) };
  };

  it('a dropped trap, a lobbed cucumber and a yarn ball land next to a kart on a branch, on the branch', () => {
    const { w, b, mid } = setup();
    placeOnBranch(w, 0, b, mid, 1.5);
    const k = w.st.karts[0];
    dropTrap(w.ctx, 0, TrapKind.Yarn);
    lobCucumber(w.ctx, 0);
    fireYarnBall(w.ctx, 0);
    const [tangle, cuke] = itemsOf(w.st).traps;
    const ball = itemsOf(w.st).proj[0];
    const near = (x: number, z: number) => Math.hypot(x - k.x, z - k.z);
    expect(near(tangle.x, tangle.z)).toBeLessThan(ITEMS.trap.drop + 1.5);
    expect(near(ball.x, ball.z)).toBeLessThan(ITEMS.hairball.spawn + 1.5);
    expect(near(cuke.x, cuke.z)).toBeLessThan(ITEMS.cucumber.lob + 3);
    expect(ball.branch).toBe(b.id);
    for (const [x, z] of [[tangle.x, tangle.z], [cuke.x, cuke.z], [ball.x, ball.z]]) {
      queryTrack(w.track, x, z, k.si, hit);
      expect(hit.branch).toBe(b.id);
    }
    // the ball rolls along the branch, on its road
    for (let i = 0; i < 60 && ball.life > 0; i++) {
      idle(w, 1);
      if (ball.branch < 0) break;
      queryTrack(w.track, ball.x, ball.z, ball.si, hit);
      expect(hit.branch).toBe(b.id);
      expect(Math.abs(hit.d)).toBeLessThan((hit.d > 0 ? hit.wallR! : hit.wallL!) + 0.01);
    }
  });

  it("a hairball fired at a branch's wall bounces off that wall, never rolls through it", () => {
    const { b, mid } = setup();
    for (const turn of [0.9, -0.9]) {
      const w2 = humanWorld(CAFE);
      placeOnBranch(w2, 0, b, mid);
      w2.st.karts[0].heading += turn;
      fireHairball(w2.ctx, 0, false);
      const p = itemsOf(w2.st).proj[0];
      let worst = -Infinity;
      for (let i = 0; i < 90 && p.life > 0; i++) {
        idle(w2, 1);
        queryTrack(w2.track, p.x, p.z, p.si, hit);
        if (hit.branch !== b.id) continue;
        worst = Math.max(worst, Math.abs(hit.d) - (hit.d > 0 ? hit.wallR! : hit.wallL!));
      }
      expect(worst).toBeGreaterThan(-Infinity);
      expect(worst).toBeLessThan(0.05);
      expect(p.bounces).toBeGreaterThan(0);
    }
  });

  it('a yarn ball follows its target onto the branch it took', () => {
    const { w, b } = setup();
    const t = w.track;
    // the thrower on the main loop 20 m before the fork, the target already on the branch
    const k = w.st.karts[0];
    placeOnTrack(w.ctx, k, b.from - Math.round(20 / t.step), 0);
    k.dist = k.s + t.length;
    k.lap = 2;
    placeOnBranch(w, 1, b, Math.min(b.m - 1, Math.round(12 / b.step)));
    w.st.order = [1, 0, 2, 3, 4, 5, 6, 7];
    fireYarnBall(w.ctx, 0);
    const p = itemsOf(w.st).proj[0];
    expect(p.target).toBe(1);
    let onBranch = false;
    for (let i = 0; i < 200 && p.life > 0; i++) {
      idle(w, 1, [{}, {}]);
      if (p.branch === b.id) onBranch = true;
    }
    expect(onBranch).toBe(true);
    expect(w.st.events.some((e) => e.type === 'hit' && e.kart === 1 && e.b === 0)).toBe(true);
  });
});

describe('finished karts (SIM_VERSION 10)', () => {
  it('break no item box and do not block the Laser Dot', () => {
    const w = humanWorld(ovalTrack([{ s: 30, kind: 'items' }]));
    const box = w.st.boxes[0];
    expect(box).toBeTruthy();
    const k = w.st.karts[0];
    k.finished = 1;
    k.x = box.x;
    k.z = box.z;
    k.y = box.y - 0.6;
    idle(w, 1);
    expect(box.respawn).toBe(0);
    expect(k.item).toBeNull();
    expect(w.st.events.some((e) => e.type === 'itemPickup' && e.kart === 0)).toBe(false);
    k.item = 'laser';
    expect(laser.blocked!(w.ctx)).toBe(false);
    k.finished = 0;
    expect(laser.blocked!(w.ctx)).toBe(true);
  });
});

describe('the race item brain (SIM_VERSION 10)', () => {
  it('fires no forward shot at a boxed, Zoomies or invulnerable kart', () => {
    for (const guard of ['shieldTicks', 'autoTicks', 'invTicks', null] as const) {
      const w = humanWorld(ovalTrack());
      const t = w.track;
      const k = w.st.karts[0];
      placeOnTrack(w.ctx, k, 40, 0);
      k.dist = k.s + t.length;
      const v = w.st.karts[1];
      placeOnTrack(w.ctx, v, 40 + Math.round(15 / t.step), 0);
      v.dist = v.s + t.length;
      if (guard) v[guard] = 600;
      give(w, 0, 'hairball');
      const m = newBrain();
      const p: Personality = { skill: 1, aggression: 0.5, mistakeRate: 0, lineBias: 0 };
      let fired = false;
      // well inside its patience (no "late" throw)
      for (let i = 0; i < 80 && !fired; i++) {
        const out: TickInput = { ...NO_INPUT };
        useItems(w.ctx, 0, out, m, p);
        fired = out.item;
      }
      expect(fired).toBe(guard === null);
    }
  });
});
