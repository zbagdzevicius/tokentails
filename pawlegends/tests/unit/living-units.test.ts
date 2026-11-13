/**
 * Living pass P3 (render only): units touch the world. Footfall dust on the sand lanes, splash rings and a wake when
 * wading, the per-second caps, the team-fight own-hero rule, the hidden-enemy rule, tier gating, the hero flinch lean,
 * the minion idle life and pop-in, and the death / respawn flourish gates.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { BuffFlag } from '../../src/sim/api';
import { bindMap } from '../../src/sim/map/runtime';
import { BUSHES, FOUNTAIN, LANE_WAYPOINTS, MAP, PUDDING_SPOT, RAT_CAMP } from '../../src/data/map';
import { CONTACT, ContactFx, SURF, contactFor, hiddenFor, surfaceAt, type ContactEntity, type ContactParticles } from '../../src/render/fx/contactFx';
import { ambientFor, type Ambient } from '../../src/render/ambient';
import { FLINCH, HeroView, flinchLean } from '../../src/render/views/heroView';
import { MINION_LIFE, MinionInstances, popScale } from '../../src/render/views/minionInstances';
import { LIVING_LIFE, landingRing, wispCount } from '../../src/render/fx/lifecycle';

afterAll(() => bindMap(0));

const amb = (tier: 'low' | 'med' | 'high', reduced = false, phone = false): Ambient => ambientFor({ tier, phone }, reduced);

interface Burst {
  x: number;
  z: number;
  o: Record<string, unknown>;
}
function pool(): ContactParticles & { bursts: Burst[] } {
  const bursts: Burst[] = [];
  return {
    bursts,
    add: { count: 0, limit: 1000 },
    alpha: { count: 0, limit: 1000 },
    burst(pos, o) {
      bursts.push({ x: pos.x, z: pos.z, o: { ...o } });
    },
  };
}
const nOf = (b: Burst[], shape?: number): number => b.filter((x) => shape === undefined || x.o.shape === shape).reduce((s, x) => s + ((x.o.n as number) ?? 1), 0);

/** A hero (or minion) at three.js (x, z) m. */
const ent = (id: number, x: number, z: number, team = 0, o: Partial<ContactEntity> = {}): ContactEntity => ({ id, kind: 'hero', team, state: 'moving', buffs: 0, fx: x * 1000, fy: -z * 1000, x: Math.round(x * 1000), y: Math.round(-z * 1000), ...o });

/** Walk hero `e` for `steps` footfalls at `hz` steps a second, returning the surfaces that emitted. */
function walk(c: ContactFx, list: ContactEntity[], who: ContactEntity, steps: number, hz = 3, mySlot = 0, myTeam = 0): number[] {
  const out: number[] = [];
  let phase = 0.1;
  c.begin(0, list, mySlot, myTeam, toX(who), toZ(who));
  c.hero(who, toX(who), toZ(who), 0, phase, true);
  for (let i = 0; i < steps; i++) {
    phase += Math.PI;
    c.begin(1 / hz, list, mySlot, myTeam, toX(who), toZ(who));
    out.push(c.hero(who, toX(who), toZ(who), 0, phase, true));
  }
  return out;
}
const toX = (e: ContactEntity): number => e.fx / 1000;
const toZ = (e: ContactEntity): number => -e.fy / 1000;

describe('surfaces (wading truth table, read-only map constants)', () => {
  it('Purrhaven Crossing: the river band off the bridges is water, the bridge decks are not; lanes and the camp are sand', () => {
    bindMap(0);
    const W = MAP.width / 1000;
    // the Pudding sits on a sand island in the river; 8 m up or down the river from it is open water
    const px = PUDDING_SPOT.x / 1000;
    const pz = -PUDDING_SPOT.y / 1000;
    expect(surfaceAt(px, pz)).toBe(SURF.SAND);
    expect(surfaceAt(px, pz - 8)).toBe(SURF.WATER);
    expect(surfaceAt(px, pz + 8)).toBe(SURF.WATER);
    // each lane's river end is a bridge deck, also 5 m to the side (the deck is wider than the lane)
    for (const lane of ['sunny', 'puddle'] as const) {
      const [x, y] = LANE_WAYPOINTS[lane][LANE_WAYPOINTS[lane].length - 1];
      expect(surfaceAt(x / 1000, -y / 1000)).toBe(SURF.DECK);
      expect(surfaceAt(x / 1000, -(y / 1000) + (y > 30000 ? 5 : -5))).toBe(SURF.DECK);
      // and 8 m off the lane it is water again
      expect(surfaceAt(x / 1000, -(y / 1000) + (y > 30000 ? 8 : -8))).toBe(SURF.WATER);
      // half way along the lane: sand, on both sides of the river
      const [ax, ay] = LANE_WAYPOINTS[lane][1];
      const [bx, by] = LANE_WAYPOINTS[lane][2];
      expect(surfaceAt((ax + bx) / 2000, -(ay + by) / 2000)).toBe(SURF.SAND);
      expect(surfaceAt(W - (ax + bx) / 2000, -(ay + by) / 2000)).toBe(SURF.SAND);
    }
    expect(surfaceAt(RAT_CAMP.x / 1000, -RAT_CAMP.y / 1000)).toBe(SURF.SAND);
    expect(surfaceAt(FOUNTAIN.x / 1000, -FOUNTAIN.y / 1000)).toBe(SURF.STONE);
    // the jungle between the lanes is grass; outside the river nothing is water
    expect(surfaceAt(38, -30)).toBe(SURF.GRASS);
    for (let x = 0; x < W; x += 2) for (let y = 0; y < 60; y += 2) if (x < 45 || x > 55) expect(surfaceAt(x + 0.5, -(y + 0.5))).not.toBe(SURF.WATER);
  });

  it('Hearthwood Divide: the diagonal river is water except where a lane crosses it on a deck', () => {
    bindMap(1);
    const W = MAP.width / 1000;
    let water = 0;
    let deck = 0;
    for (let x = 6; x < W - 6; x += 1) {
      const s = surfaceAt(x, -(W - x));
      if (s === SURF.WATER) water++;
      if (s === SURF.DECK) deck++;
      expect(s === SURF.WATER || s === SURF.DECK).toBe(true);
    }
    // three lane crossings (≈ 10 m of deck each along the diagonal), the rest open water
    expect(deck).toBeGreaterThan(8);
    expect(deck).toBeLessThan(45);
    expect(water).toBeGreaterThan(60);
    // the middle of the map is where Yarn Road crosses: a deck
    expect(surfaceAt(W / 2, -W / 2)).toBe(SURF.DECK);
    // far from the river nothing is water
    expect(surfaceAt(20, -20)).not.toBe(SURF.WATER);
    expect(surfaceAt(W - 20, -(W - 20))).not.toBe(SURF.WATER);
    bindMap(0);
    // rebinding rebuilds the grid
    expect(surfaceAt(PUDDING_SPOT.x / 1000, -PUDDING_SPOT.y / 1000 - 8)).toBe(SURF.WATER);
  });
});

describe('the hidden-unit rule', () => {
  it('never reacts to a stealthed enemy or an enemy in an uncleared bush; allies always show', () => {
    bindMap(0);
    const b = BUSHES[0];
    const inBush = { team: 1, buffs: 0, fx: b.x, fy: b.y };
    const open = { team: 1, buffs: 0, fx: 30000, fy: 30000 };
    const none: boolean[] = [];
    expect(hiddenFor(open, 0, none)).toBe(false);
    expect(hiddenFor({ ...open, buffs: BuffFlag.Stealth }, 0, none)).toBe(true);
    expect(hiddenFor(inBush, 0, none)).toBe(true);
    expect(hiddenFor(inBush, 0, [true])).toBe(false);
    expect(hiddenFor({ ...inBush, team: 0 }, 0, none)).toBe(false);
    expect(hiddenFor({ ...open, team: 0, buffs: BuffFlag.Stealth }, 0, none)).toBe(false);
    expect(hiddenFor({ ...open, team: 2 }, 0, none)).toBe(false);
  });

  it('a stealthed enemy wading makes no rings; an ally in the same bush clears it', () => {
    bindMap(0);
    const p = pool();
    const c = new ContactFx(p);
    c.setAmbient(amb('high'));
    const px = PUDDING_SPOT.x / 1000;
    const pz = -PUDDING_SPOT.y / 1000 - 8;
    const sneak = ent(3, px, pz, 1, { buffs: BuffFlag.Stealth });
    expect(walk(c, [sneak], sneak, 6).every((s) => s === -1)).toBe(true);
    expect(c.counts.rings).toBe(0);
    expect(p.bursts.length).toBe(0);
    const b = BUSHES[0];
    const lurk = ent(4, b.x / 1000, -b.y / 1000, 1);
    walk(c, [lurk], lurk, 4);
    expect(p.bursts.length + c.counts.rings).toBe(0);
    const mate = ent(1, b.x / 1000, -b.y / 1000, 0, { kind: 'minion' });
    walk(c, [lurk, mate], lurk, 4);
    // the bush is grass: one fleck every other footfall on High
    expect(nOf(p.bursts)).toBeGreaterThan(0);
  });
});

describe('ContactFx caps and tiers', () => {
  it('Low: only the own hero, only water rings, no particles', () => {
    bindMap(0);
    const p = pool();
    const c = new ContactFx(p);
    c.setAmbient(amb('low'));
    const px = PUDDING_SPOT.x / 1000;
    const pz = -PUDDING_SPOT.y / 1000 - 8;
    const me = ent(0, px, pz);
    walk(c, [me], me, 5);
    expect(c.counts.rings).toBe(5);
    expect(p.bursts.length).toBe(0);
    const ally = ent(1, px, pz);
    walk(c, [ally], ally, 5);
    expect(c.counts.rings).toBe(5);
    // sand on Low: nothing
    const [ax, ay] = LANE_WAYPOINTS.sunny[1];
    const lane = ent(0, ax / 1000, -ay / 1000);
    walk(c, [lane], lane, 5);
    expect(c.counts.dust).toBe(0);
    expect(c.dustRate()).toBe(0);
  });

  it('Med: heroes get 1 dust puff a footfall and the wake; no droplets, no flecks, no minion rings', () => {
    bindMap(0);
    const p = pool();
    const c = new ContactFx(p);
    c.setAmbient(amb('med'));
    const [ax, ay] = LANE_WAYPOINTS.sunny[1];
    const bot = ent(2, ax / 1000, -ay / 1000);
    walk(c, [bot], bot, 4, 1);
    expect(c.counts.dust).toBe(4);
    for (const b of p.bursts) expect(b.o.n).toBe(1);
    const wade = ent(5, PUDDING_SPOT.x / 1000, -PUDDING_SPOT.y / 1000 - 8);
    walk(c, [wade], wade, 3, 1);
    expect(c.counts.wake).toBe(6);
    expect(c.counts.drops).toBe(0);
    expect(c.minionStep(ent(30, toX(wade), toZ(wade), 0, { kind: 'minion' }), toX(wade), toZ(wade))).toBe(false);
    const grass = ent(6, 38, -30);
    walk(c, [grass], grass, 4, 1);
    expect(c.counts.flecks).toBe(0);
  });

  it('High: ≤ 2 dust a footfall and ≤ CONTACT.dustPerSec dust a second over every hero', () => {
    bindMap(0);
    const p = pool();
    const c = new ContactFx(p);
    c.setAmbient(amb('high'));
    // six heroes spread along the lanes (no team fight at the focus), each at 4 footfalls a second, for 5 s
    const pts: ContactEntity[] = [];
    for (let i = 0; i < 6; i++) {
      const lane = i % 2 ? LANE_WAYPOINTS.sunny : LANE_WAYPOINTS.puddle;
      const [ax, ay] = lane[1];
      const [bx, by] = lane[2];
      const t = (i >> 1) / 3;
      pts.push(ent(i, (ax + (bx - ax) * t) / 1000, -(ay + (by - ay) * t) / 1000));
    }
    const phases = pts.map(() => 0.1);
    const dt = 1 / 60;
    c.begin(0, pts, 0, 0, 20, -30);
    for (let i = 0; i < pts.length; i++) c.hero(pts[i], toX(pts[i]), toZ(pts[i]), 0, phases[i], true);
    const perSecond: number[] = [];
    for (let s = 0; s < 5; s++) {
      const before = c.counts.dust;
      for (let f = 0; f < 60; f++) {
        c.begin(dt, pts, 0, 0, 20, -30);
        for (let i = 0; i < pts.length; i++) {
          phases[i] += 4 * Math.PI * dt;
          c.hero(pts[i], toX(pts[i]), toZ(pts[i]), 0, phases[i], true);
        }
      }
      perSecond.push(c.counts.dust - before);
    }
    for (const b of p.bursts) expect(b.o.n as number).toBeLessThanOrEqual(CONTACT.dustPerStep);
    // the first second may spend the bucket's starting fill on top of its rate
    for (const n of perSecond.slice(1)) expect(n).toBeLessThanOrEqual(CONTACT.dustPerSec);
    expect(perSecond.slice(1).every((n) => n >= CONTACT.dustPerSec - 2)).toBe(true);
  });

  it('a team fight at the focus keeps only the own hero’s contact FX', () => {
    bindMap(0);
    const p = pool();
    const c = new ContactFx(p);
    c.setAmbient(amb('high'));
    const [ax, ay] = LANE_WAYPOINTS.sunny[1];
    const [bx, by] = LANE_WAYPOINTS.sunny[2];
    const cx = (ax + bx) / 2000;
    const cz = -(ay + by) / 2000;
    const crowd = [0, 1, 3, 4].map((id, k) => ent(id, cx + k * 0.8, cz, id < 3 ? 0 : 1));
    let phase = 0.1;
    c.begin(0, crowd, 0, 0, cx, cz);
    for (const e of crowd) c.hero(e, toX(e), toZ(e), 0, phase, true);
    expect(c.fight).toBe(true);
    const by0: number[] = [];
    for (let s = 0; s < 6; s++) {
      phase += Math.PI;
      c.begin(0.5, crowd, 0, 0, cx, cz);
      for (const e of crowd) if (c.hero(e, toX(e), toZ(e), 0, phase, true) >= 0) by0.push(e.id);
    }
    expect(by0.length).toBeGreaterThan(0);
    expect(by0.every((id) => id === 0)).toBe(true);
    // three heroes are not a team fight: an ally emits too
    const few = crowd.slice(0, 3);
    c.begin(0.5, few, 0, 0, cx, cz);
    expect(c.fight).toBe(false);
    phase += Math.PI;
    for (const e of few) c.hero(e, toX(e), toZ(e), 0, phase, true);
    phase += Math.PI;
    c.begin(0.5, few, 0, 0, cx, cz);
    expect(c.hero(few[1], toX(few[1]), toZ(few[1]), 0, phase, true)).toBe(SURF.SAND);
  });

  it('High minions splash at most CONTACT.minionRingsPerSec rings a second, and never off the water', () => {
    bindMap(0);
    const c = new ContactFx(pool());
    c.setAmbient(amb('high'));
    const px = PUDDING_SPOT.x / 1000;
    const pz = -PUDDING_SPOT.y / 1000 - 8;
    const m = ent(40, px, pz, 1, { kind: 'minion' });
    c.begin(0, [m], 0, 0, px, pz);
    let rings = 0;
    for (let f = 0; f < 120; f++) {
      c.begin(1 / 60, [m], 0, 0, px, pz);
      for (let k = 0; k < 3; k++) if (c.minionStep(m, px, pz)) rings++;
    }
    expect(rings).toBeLessThanOrEqual(2 * CONTACT.minionRingsPerSec + 1);
    expect(rings).toBeGreaterThanOrEqual(2 * CONTACT.minionRingsPerSec - 1);
    const dry = ent(41, 38, -30, 1, { kind: 'minion' });
    c.begin(1, [dry], 0, 0, 38, -30);
    expect(c.minionStep(dry, 38, -30)).toBe(false);
  });

  it('reduce motion: fewer puffs and no wake streaks; a full pool takes nothing', () => {
    bindMap(0);
    const p = pool();
    const c = new ContactFx(p);
    c.setAmbient(amb('high', true));
    const [ax, ay] = LANE_WAYPOINTS.sunny[1];
    const lane = ent(0, ax / 1000, -ay / 1000);
    walk(c, [lane], lane, 3, 1);
    for (const b of p.bursts) expect(b.o.n).toBe(1);
    const wade = ent(1, PUDDING_SPOT.x / 1000, -PUDDING_SPOT.y / 1000 - 8);
    walk(c, [wade], wade, 3, 1, 1);
    expect(c.counts.wake).toBe(0);
    expect(c.counts.rings).toBe(3);
    p.alpha.count = p.alpha.limit;
    const n = p.bursts.length;
    walk(c, [lane], lane, 3, 1);
    expect(p.bursts.length).toBe(n);
  });

  it('splash rings grow and fade into the water colour, and contactFor shares one instance per pool', () => {
    const c = new ContactFx(pool());
    c.setAmbient(amb('low'));
    bindMap(0);
    const me = ent(0, PUDDING_SPOT.x / 1000, -PUDDING_SPOT.y / 1000 - 8);
    walk(c, [me], me, 1);
    const sizes: number[] = [];
    const sink = { add: (_x: number, _z: number, size: number) => void sizes.push(size) };
    c.drawRings(sink);
    c.begin(0.3, [me], 0, 0, 0, 0);
    c.drawRings(sink);
    c.begin(0.4, [me], 0, 0, 0, 0);
    c.drawRings(sink);
    expect(sizes.length).toBe(2);
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(c.liveRings).toBe(0);
    const fx = { particles: {}, shock: {} } as never;
    expect(contactFor(fx)).toBe(contactFor(fx));
  });
});

describe('hero flinch and minion life', () => {
  it('the flinch lean is ≤ 6° and over in 50–80 ms', () => {
    expect(FLINCH.heavyDeg).toBeLessThanOrEqual(6);
    expect(FLINCH.heavyS).toBeLessThanOrEqual(0.08);
    expect(FLINCH.lightS).toBeGreaterThanOrEqual(0.05);
    const a = (FLINCH.heavyDeg * Math.PI) / 180;
    let peak = 0;
    for (let t = 0; t <= 0.1; t += 0.002) peak = Math.max(peak, flinchLean(t, FLINCH.heavyS, a));
    expect(peak).toBeLessThanOrEqual(a + 1e-9);
    expect(flinchLean(FLINCH.heavyS, FLINCH.heavyS, a)).toBe(0);
    expect(flinchLean(-0.01, FLINCH.heavyS, a)).toBe(0);
  });

  it('HeroView leans a hit hero on Med only as a visual offset (the drawn position stays), never on Low or reduced', () => {
    const e = { kind: 'hero', id: 1, hero: 'clem', team: 1, fx: 20000, fy: 30000, x: 20000, y: 30000, yaw: 0, state: 'idle', buffs: 0, speed: 0, hp: 1, maxHp: 1 };
    const frame = { tick: 0, entities: [e], byId: new Map([[1, e]]) } as never;
    const tilt = (a: Ambient, from?: [number, number]): number[] => {
      const v = new HeroView();
      v.setAmbient(a);
      v.update(frame, 1 / 60);
      const r = v.rigOf(1)!;
      const at = { x: r.pos.x, z: r.pos.z };
      v.hit(1, true, ...(from ?? [NaN, NaN]));
      const out: number[] = [];
      for (let i = 0; i < 8; i++) {
        v.update(frame, 1 / 60);
        const o = r.ch.object.rotation;
        out.push(Math.hypot(o.x, o.z));
        expect(r.pos.x).toBeCloseTo(at.x, 6);
        expect(r.pos.z).toBeCloseTo(at.z, 6);
      }
      v.dispose();
      return out;
    };
    const max = (FLINCH.heavyDeg * Math.PI) / 180 + 1e-6;
    const med = tilt(amb('med'), [18, -30]);
    expect(Math.max(...med)).toBeGreaterThan(0.02);
    expect(Math.max(...med)).toBeLessThanOrEqual(max);
    // over after ~80 ms (8 frames at 60 fps = 133 ms)
    expect(med[med.length - 1]).toBe(0);
    expect(Math.max(...tilt(amb('low')))).toBe(0);
    expect(Math.max(...tilt(amb('high', true)))).toBe(0);
  });

  it('minion pop-in starts small, overshoots a little and ends at full size', () => {
    expect(popScale(0).g).toBeCloseTo(MINION_LIFE.popFrom, 6);
    expect(popScale(1).g).toBeCloseTo(1, 6);
    let peak = 0;
    for (let u = 0; u <= 1; u += 0.01) peak = Math.max(peak, popScale(u).g);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.1);
    expect(popScale(0.5).sq).toBeCloseTo(MINION_LIFE.popSquash, 6);
  });

  it('standing minions breathe on Med / High and hold still on Low', () => {
    const e = { kind: 'minion', id: 30, team: 0, variant: 'melee', fx: 40000, fy: 30000, x: 40000, y: 30000, yaw: 0, state: 'idle', buffs: 0, speed: 0, hp: 1, maxHp: 1 };
    const frame = { tick: 0, entities: [e], byId: new Map([[30, e]]), projectiles: [] } as never;
    const heights = (a: Ambient): number[] => {
      const m = new MinionInstances();
      m.setAmbient(a);
      const mesh = (m as unknown as { meshes: { instanceMatrix: { array: Float32Array } }[] }).meshes[0];
      const out: number[] = [];
      for (let i = 0; i < 20; i++) {
        m.update(frame, 1 / 30, i / 10);
        const t = mesh.instanceMatrix.array;
        out.push(Math.hypot(t[4], t[5], t[6]));
      }
      m.dispose();
      return out;
    };
    const low = heights(amb('low'));
    expect(Math.max(...low) - Math.min(...low)).toBeLessThan(1e-6);
    const high = heights(amb('high'));
    const spread = Math.max(...high) - Math.min(...high);
    expect(spread).toBeGreaterThan(0.01);
    // ≤ the breath share of its height either way
    expect(spread).toBeLessThanOrEqual(2 * MINION_LIFE.breath * 1.65 + 1e-6);
  });
});

describe('death and respawn flourish gates', () => {
  it('the wisp is off on Low and under reduce motion; the landing ring keeps a reduced count under reduce motion', () => {
    expect(wispCount(0, false, true)).toBe(0);
    expect(wispCount(1, true, true)).toBe(0);
    expect(wispCount(2, false, true)).toBe(LIVING_LIFE.wispMine);
    expect(wispCount(1, false, false)).toBe(LIVING_LIFE.wispOther);
    expect(LIVING_LIFE.wispMine).toBeLessThanOrEqual(6);
    expect(landingRing(0, false, true)).toBe(0);
    expect(landingRing(2, false, true)).toBe(LIVING_LIFE.ringMine);
    expect(landingRing(2, true, true)).toBe(Math.round(LIVING_LIFE.ringMine * 0.6));
  });
});
