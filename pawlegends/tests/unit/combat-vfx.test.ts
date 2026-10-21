/**
 * Wave C (C3), render/fx/combatVfx.ts: tier budgets reach the particle pools, reduce motion and the shake setting,
 * damage-scaled hits and the big-hit pop, rank scaling, biome debris, level auras (steps, stealth, no gold on others),
 * pooled option objects on the per-frame paths, enemy telegraphs above every VFX layer, and the cards / sim walls.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CombatVfx, DEBRIS, VFX_TIERS, auraColor, auraStep, biomeAt, elementColor, impactScale, isBigHit, isMelee, maxedRank, rankScale,
} from '../../src/render/fx/combatVfx';
import { Particles } from '../../src/render/fx/Particles.js';
import { REDUCED_COUNT, REDUCED_SHAKE, SHAKE_SCALE, resetShakePref, setShakePref, shakePref, shakeScaleFor } from '../../src/render/fx/vfxPrefs';
import { TELEGRAPH_OVER } from '../../src/render/telegraph';
import { isGoldFamily } from '../../src/render/skins/registry';
import { HERO_IDS } from '../../src/data/heroes';
import { BuffFlag } from '../../src/sim/api';
import type { ViewEntity } from '../../src/render/interp';
import { Effects, heroAccent, type EffectsHooks, type Who } from '../../src/render/effects';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A shockwave stand-in that counts starts and cracks. */
const shock = () => {
  const s = { starts: 0, cracks: 0, start: () => (s.starts++, {}), crack: () => (s.cracks++, {}) };
  return s;
};

const setup = (tier: 'low' | 'med' | 'high' = 'high', reduced = false) => {
  const particles = new Particles({ rng: () => 0.5, groundY: () => 0 });
  const sh = shock();
  const vfx = new CombatVfx(particles, sh as never);
  vfx.setTier(tier, reduced);
  return { particles, sh, vfx };
};

const heroEnt = (over: Partial<ViewEntity> = {}): ViewEntity =>
  ({ id: 1, kind: 'hero', team: 1, slot: 1, hero: 'aviete', level: 10, x: 20000, y: 30000, fx: 20000, fy: 30000, hp: 500, maxHp: 500, shield: 0, state: 'idle', facing: 0, buffs: 0, yaw: 0, speed: 0, ...over }) as ViewEntity;

describe('C3 budgets and motion settings', () => {
  it('each tier caps the pools and scales bursts; Low < Med ≤ High', () => {
    expect(VFX_TIERS.low.particles).toBeLessThan(VFX_TIERS.med.particles);
    expect(VFX_TIERS.med.particles).toBeLessThanOrEqual(VFX_TIERS.high.particles);
    for (const t of ['low', 'med', 'high'] as const) {
      const { particles } = setup(t);
      expect(particles.add.limit + particles.alpha.limit).toBe(VFX_TIERS[t].particles);
      expect(particles.countScale).toBeCloseTo(VFX_TIERS[t].countScale);
    }
    expect(VFX_TIERS.low.extras).toBe(false);
    expect(VFX_TIERS.low.cracks).toBe(0);
  });

  it('a teamfight worth of hits never passes the tier cap', () => {
    for (const t of ['low', 'med', 'high'] as const) {
      const { particles, vfx } = setup(t);
      const p = new THREE.Vector3(30, 1, -30);
      for (let i = 0; i < 400; i++) {
        vfx.impact(p, 300, 0xff6a3d, true, true);
        vfx.debris(30, -30, 1.5);
        vfx.slash(30, -30, 0, 1.5, 2.1, 0xffffff, 1, 1.5);
      }
      vfx.update(0, [], 0);
      expect(particles.live).toBeLessThanOrEqual(VFX_TIERS[t].particles);
      expect(vfx.peak).toBeLessThanOrEqual(VFX_TIERS[t].particles);
    }
  });

  it('reduce motion cuts counts, drops cracks and motes, and caps shake; the shake setting maps to Juice.shakeScale', () => {
    const { particles, sh, vfx } = setup('high', true);
    expect(particles.countScale).toBeCloseTo(REDUCED_COUNT);
    vfx.ultimate(10, -30, 0xffe24d, 0xff4d5e, 6, 1.36);
    expect(sh.cracks).toBe(0);
    const full = setup('high');
    full.vfx.ultimate(10, -30, 0xffe24d, 0xff4d5e, 6, 1.36);
    expect(full.sh.cracks).toBe(VFX_TIERS.high.cracks);
    expect(shakeScaleFor('full', false)).toBe(SHAKE_SCALE.full);
    expect(shakeScaleFor('full', true)).toBe(REDUCED_SHAKE);
    expect(shakeScaleFor('low', false)).toBe(SHAKE_SCALE.low);
    expect(shakeScaleFor('off', true)).toBe(0);
    resetShakePref();
    expect(shakePref()).toBe('full');
    setShakePref('off');
    expect(shakePref()).toBe('off');
    resetShakePref();
  });
});

describe('C3 hits, ranks and levels', () => {
  it('impacts scale with damage, and the big-hit pop needs a real share of a hero', () => {
    expect(impactScale(0)).toBe(0.5);
    expect(impactScale(480)).toBeCloseTo(2);
    expect(impactScale(10_000)).toBe(2.4);
    expect(isBigHit(300, 2000, true)).toBe(true);
    expect(isBigHit(160, 800, true)).toBe(true); // 20% of max HP
    expect(isBigHit(160, 2000, true)).toBe(false); // 8%
    expect(isBigHit(900, 900, false)).toBe(false); // never on a minion or a tower
    const small = setup();
    small.vfx.impact(new THREE.Vector3(), 40, 0xffffff, false, false);
    const big = setup();
    big.vfx.impact(new THREE.Vector3(), 400, 0xffffff, true, true);
    expect(big.particles.live).toBeGreaterThan(small.particles.live * 2);
  });

  it('casts grow with the C2 rank, and the top rank gets the flourish', () => {
    expect(rankScale(1, 0)).toBe(1);
    expect(rankScale(8, 0)).toBeCloseTo(1.54);
    expect(rankScale(10, 3)).toBeCloseTo(1.36);
    expect(rankScale(3, 3)).toBe(1); // R not learned yet
    expect(maxedRank(8, 1)).toBe(true);
    expect(maxedRank(7, 1)).toBe(false);
    expect(maxedRank(10, 3)).toBe(true);
    expect(maxedRank(10, 4)).toBe(false); // the Paw Trick has no ranks
  });

  it('level spikes at 4, 7 and 10 only, and the aura steps with them', () => {
    expect([1, 3, 4, 6, 7, 9, 10].map(auraStep)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    const { particles, sh, vfx } = setup();
    vfx.levelSpike(10, -30, 5, 0xffe24d);
    expect(particles.live).toBe(0);
    vfx.levelSpike(10, -30, 7, 0xffe24d);
    expect(sh.starts).toBe(1);
    expect(particles.live).toBeGreaterThan(20);
  });

  it('level auras: none below 4 or when stealthed or dead, one ring at 4, two from 7, and no gold under another hero', () => {
    const { vfx } = setup();
    const count = (e: ViewEntity[]) => {
      vfx.update(0.016, e, 0);
      return vfx.auras.mesh.count;
    };
    expect(count([heroEnt({ level: 3 })])).toBe(0);
    expect(count([heroEnt({ level: 4 })])).toBe(1);
    expect(count([heroEnt({ level: 7 })])).toBe(2);
    expect(count([heroEnt({ level: 10, buffs: BuffFlag.Stealth })])).toBe(0);
    expect(count([heroEnt({ level: 10, state: 'dead' })])).toBe(0);
    for (const h of HERO_IDS) expect(isGoldFamily(auraColor(h, false)), h).toBe(false);
    expect(auraColor('aviete', true)).toBe(elementColor('aviete'));
  });

  it('a late 3v3 shows both rings under all six heroes (the enemy team is never starved of aura slots)', () => {
    const { vfx } = setup();
    const six = [0, 1, 2, 3, 4, 5].map((id) => heroEnt({ id, slot: id, team: id < 3 ? 0 : 1, level: 7 }));
    vfx.update(0.016, six, 0);
    expect(vfx.auras.mesh.count).toBe(12);
    vfx.update(0.016, six.map((e) => ({ ...e, level: 10 })), 0);
    expect(vfx.auras.mesh.count).toBe(12);
  });

  it('melee heroes slash, ranged ones do not', () => {
    expect(HERO_IDS.filter(isMelee).sort()).toEqual(['aviete', 'brutus', 'cacklejaw', 'clem', 'lambo']);
  });
});

describe('C3 debris and pooling', () => {
  it('biomes follow the painted map: river water, bridge wood, plaza stone, lane dirt, jungle grass', () => {
    expect(biomeAt(50, -30)).toBe('water'); // Pudding's river spot
    expect(biomeAt(50, -7)).toBe('wood'); // the Puddle Lane bridge
    expect(biomeAt(5, -30)).toBe('stone');
    expect(biomeAt(95, -30)).toBe('stone');
    expect(biomeAt(30, -30)).toBe('dirt'); // the rat camp clearing
    expect(biomeAt(22, -30)).toBe('grass');
    expect(biomeAt(-5, 5)).toBe('grass');
    // a bridge: some river cell on a lane
    let wood = 0;
    for (let y = 0; y < 60; y++) if (biomeAt(50, -y - 0.5) === 'wood') wood++;
    expect(wood).toBeGreaterThan(4);
    expect(Object.keys(DEBRIS).sort()).toEqual(['dirt', 'grass', 'stone', 'water', 'wood']);
  });

  it('the per-frame paths reuse one option object (no allocation per trail puff or mote)', () => {
    const { particles, vfx } = setup();
    const seen = new Set<object>();
    const burst = particles.burst.bind(particles);
    const single = particles.single.bind(particles);
    particles.burst = (pos: THREE.Vector3, o: object) => (seen.add(o), burst(pos, o));
    particles.single = (pos: THREE.Vector3, o: object) => (seen.add(o), single(pos, o));
    const p = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 50; i++) vfx.trail(p, 0xff6a3d, 0.2, i % 2 === 0);
    for (let i = 0; i < 50; i++) vfx.update(0.4, [heroEnt({ level: 10 })], 0);
    expect(seen.size).toBeLessThanOrEqual(2);
  });
});

describe('C3 walls', () => {
  it('enemy wind-ups draw above every particle and shockwave layer, under the hover rings', () => {
    const { particles } = setup();
    expect(TELEGRAPH_OVER).toBeGreaterThan(particles.add.mesh.renderOrder);
    expect(TELEGRAPH_OVER).toBeGreaterThan(particles.alpha.mesh.renderOrder);
    expect(TELEGRAPH_OVER).toBeGreaterThan(7); // shock rings
    expect(TELEGRAPH_OVER).toBeLessThan(9); // hover and self rings
    const { vfx } = setup();
    expect(vfx.auras.mesh.renderOrder).toBeLessThan(3); // under every telegraph
  });

  it('cards never reach combat VFX, and the sim and backend never import the render', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/render/fx/combatVfx.ts'), 'utf8');
    for (const bad of ['skinStore', 'cardLook', 'roster', 'entitlements', 'tierFx']) expect(src.includes(bad), bad).toBe(false);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
    for (const f of walk(path.join(ROOT, 'src/sim'))) expect(/from '(\.\.\/)+render\//.test(fs.readFileSync(f, 'utf8')), f).toBe(false);
  });
});

/** An Effects director on stubs (no DOM, no scene): records the level spikes and the ground-ring colours. */
const director = (visible: (id: number) => boolean, mySlot = 0) => {
  const particles = new Particles({ rng: () => 0.5, groundY: () => 0 });
  const colors: string[] = [];
  const sh = { start: (_p: unknown, o: { color?: string }) => (o.color && colors.push(o.color), {}), crack: () => ({}), thud: () => {} };
  const juice = { flash: () => {}, kick: () => {}, callout: () => {}, shake: () => {} };
  const whos = new Map<number, Who>();
  const hooks: EffectsHooks = {
    who: (id) => whos.get(id) ?? null,
    visible,
    mySlot,
    myTeam: 0,
    trickOf: () => 'pounce',
    onSwing: () => {},
    onCast: () => {},
    onHit: () => {},
  };
  const fx = new Effects(particles, sh as never, juice as never, hooks, null);
  const vfx = new CombatVfx(particles, sh as never);
  vfx.setTier('high');
  const spikes: number[] = [];
  const real = vfx.levelSpike.bind(vfx);
  vfx.levelSpike = (x, z, level, color) => (spikes.push(color), real(x, z, level, color));
  fx.vfx = vfx;
  const put = (id: number, hero: Who['hero'], team: number) => whos.set(id, { id, kind: 'hero', team, hero, x: 10, z: -30, yaw: 0, level: 7, maxHp: 900 } as Who);
  return { fx, spikes, colors, put };
};

describe('C3 readability: yellow means you, and no spike from the fog', () => {
  it('an enemy level spike is drawn only while the hero is seen now (not from the 3 s last-seen place)', () => {
    let seen = true;
    const d = director(() => seen);
    d.put(4, 'aviete', 1);
    d.fx.handle({ type: 'levelup', tick: 1, id: 4, level: 7 });
    expect(d.spikes.length).toBe(1);
    seen = false;
    d.fx.handle({ type: 'levelup', tick: 2, id: 4, level: 10 });
    expect(d.spikes.length).toBe(1);
  });

  it("another player's Avietė, Sir Brutus or Lambo never levels up or casts in the gold 'you' family", () => {
    for (const h of ['aviete', 'brutus', 'lambo'] as const) {
      expect(isGoldFamily(elementColor(h)), h).toBe(true); // the rule is needed for these three
      const d = director(() => true);
      d.put(4, h, 1);
      d.fx.handle({ type: 'levelup', tick: 1, id: 4, level: 7 });
      for (const slot of [0, 1, 2, 3] as const) d.fx.handle({ type: 'cast', tick: 2, src: 4, slot, x: 14000, y: 30000, target: -1 });
      expect(d.spikes.length, h).toBe(1);
      expect(d.colors.length, h).toBeGreaterThan(1); // the spike wave plus the cast rings
      for (const c of d.spikes) expect(isGoldFamily(c), h).toBe(false);
      for (const c of d.colors) expect(isGoldFamily(parseInt(c.slice(1), 16)), `${h} ${c}`).toBe(false);
    }
    for (const h of HERO_IDS) expect(isGoldFamily(heroAccent(h, false)), h).toBe(false);
    expect(heroAccent('aviete', true)).toBe(elementColor('aviete')); // the player's own hero keeps its colour
  });
});
