/**
 * Cat Nature (render/nature/*, ui/nature/*): every element has a definition, the lobby and match caps hold, the
 * in-match rules follow tierFx (Off, Mine only, Low, team fights, stealth, the pool guard), no gold on another
 * player's hero, nothing is allocated per emit, and it is cosmetic only (same sim hash, no sim imports).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ELEMENTS, TIERS, type Element } from '../../src/meta/roster';
import { FADE, SHAPE } from '../../src/render/fx/Particles.js';
import { LOBBY_MAX, LOBBY_MAX_LOW, MATCH_LOW_MAX, MATCH_OTHER_MAX, MATCH_SELF_MAX, NATURE, NFADE, NSHAPE, lobbyRate, matchCap, natureOfLook } from '../../src/render/nature/natureDefs';
import { installNature, moteColor, natureMote, uninstallNature } from '../../src/render/nature/matchNature';
import { LobbyNature, createLobbyNature } from '../../src/render/nature/lobbyNature';
import { TierFx, isGoldFamily, setTierExt, type FxHero, type FxParticles } from '../../src/render/skins/tierFx';
import { putSkin, type CatSkin } from '../../src/render/skins/skinStore';
import { cardLook } from '../../src/render/cosmetics';
import { createMatch, fillPicks, hash, step } from '../../src/sim/index';

type Pool = FxParticles & { bursts: { pos: THREE.Vector3; o: Record<string, unknown> }[]; rings: number };
function pool(): Pool {
  const p: Pool = {
    add: { count: 0, limit: 1000 },
    alpha: { count: 0, limit: 600 },
    bursts: [],
    rings: 0,
    burst(pos, o) {
      p.bursts.push({ pos: pos.clone(), o: { ...o, ref: o } });
    },
    ring() {
      p.rings++;
    },
  };
  return p;
}
const hero = (over: Partial<FxHero> = {}): FxHero => ({ id: 0, x: 0, z: 0, rung: 'COMMON', element: 'FIRE', self: true, moving: false, stealth: false, dead: false, napping: false, phase: 0, ...over });
const alone = [{ x: 0, z: 0, dead: false }];

/** Run `secs` of 60 fps frames for these heroes. */
function play(fx: TierFx, hs: FxHero[], secs: number, heroes = alone): void {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    fx.begin(1 / 60, 0, 0, heroes);
    for (const h of hs) fx.hero(h);
    fx.end();
  }
}
const from = (p: Pool, x: number): number => p.bursts.filter((b) => Math.abs(b.pos.x - x) < 0.6).length;

afterEach(() => {
  uninstallNature();
  setTierExt(null);
});

describe('definitions', () => {
  it('all 10 elements, shapes and fades match Particles.js, the CSS key is the element', () => {
    expect(Object.keys(NATURE).sort()).toEqual([...ELEMENTS].sort());
    for (const [k, v] of Object.entries(NSHAPE)) expect(SHAPE[k as keyof typeof SHAPE], k).toBe(v);
    for (const [k, v] of Object.entries(NFADE)) expect(FADE[k as keyof typeof FADE], k).toBe(v);
    for (const e of ELEMENTS) {
      const d = NATURE[e];
      expect(d.element).toBe(e);
      expect(d.css).toBe(e);
      expect(d.life[0]).toBeLessThanOrEqual(d.life[1]);
      expect(d.rateMatch).toBeGreaterThan(1);
      expect(d.rateMatch).toBeLessThanOrEqual(2);
      expect(Object.values(NSHAPE)).toContain(d.shape);
    }
    // leaves and smoke are not additive (they would vanish on the bright map)
    expect(NATURE.DARK.additive).toBe(false);
    expect(NATURE.GRASS.additive).toBe(false);
  });
  it('natureOfLook: the worn card skin element and rung, null without a card', () => {
    putSkin({ id: 'cat.nat1', catId: 'nat1', name: 'Simas', element: 'ICE', tierRung: 'EPIC', bond: 0, rung: 'EPIC', coat: { pattern: 'solid', base: 0, deep: 0, light: 0, cream: 0, patch: 0, stripe: 0 }, eyes: {} as CatSkin['eyes'], earInner: 0, nose: 0, rev: 0, source: 'family', order: 0 } as CatSkin);
    expect(natureOfLook(cardLook('cat.nat1'))).toEqual({ element: 'ICE', rung: 'EPIC' });
    expect(natureOfLook(cardLook('cat.missing'))).toBeNull();
    expect(natureOfLook({ coat: null, chroma: 'FIRE' })).toBeNull();
    expect(natureOfLook(null)).toBeNull();
  });
  it('caps: lobby rates scale by rung and Low, reduced motion stops them; match caps per hero', () => {
    expect(lobbyRate('FIRE', 'LEGENDARY', false, false)).toBe(NATURE.FIRE.rateLobby);
    expect(lobbyRate('FIRE', 'COMMON', false, false)).toBeLessThan(lobbyRate('FIRE', 'EPIC', false, false));
    expect(lobbyRate('FIRE', 'LEGENDARY', true, false)).toBeCloseTo(NATURE.FIRE.rateLobby * 0.3);
    for (const t of TIERS) expect(lobbyRate('ICE', t, false, true)).toBe(0);
    expect(matchCap(true, false, false)).toBe(MATCH_SELF_MAX);
    expect(matchCap(true, true, false)).toBe(MATCH_LOW_MAX);
    expect(matchCap(true, false, true)).toBe(MATCH_SELF_MAX);
    expect(matchCap(false, false, false)).toBe(MATCH_OTHER_MAX);
    expect(matchCap(false, true, false)).toBe(0);
    expect(matchCap(false, false, true)).toBe(0);
  });
});

describe('in a match (TierFx extension)', () => {
  it('own hero: about one mote per 0.5–0.7 s, under its live cap, and it runs next to the card flourish', () => {
    let flourish = 0;
    setTierExt(() => void flourish++);
    installNature(false);
    for (const e of ELEMENTS) {
      const p = pool();
      const fx = new TierFx(p);
      play(fx, [hero({ element: e })], 10);
      const per = 10 / p.bursts.length;
      expect(per, e).toBeGreaterThan(0.38);
      expect(per, e).toBeLessThan(0.95);
      expect(p.bursts.every((b) => (b.o.alpha as number) <= 0.85)).toBe(true);
    }
    expect(flourish).toBeGreaterThan(0);
  });
  it('another hero on Med / High, nothing on Low; own hero on Low capped at 4 live', () => {
    installNature(false);
    const p = pool();
    const fx = new TierFx(p);
    const me = hero({ id: 0, x: 0, element: 'SAND' });
    const them = hero({ id: 1, x: 30, self: false, element: 'FIRE' });
    play(fx, [me, them], 6);
    expect(from(p, 30)).toBeGreaterThan(5);
    const q = pool();
    const low = new TierFx(q);
    low.low = true;
    // a long life so the cap, not the rate, limits it
    play(low, [me, them], 1.2);
    expect(from(q, 30)).toBe(0);
    expect(from(q, 0)).toBeLessThanOrEqual(MATCH_LOW_MAX);
  });
  it('per-hero live caps hold: own ≤ 10, other ≤ 6 within one mote lifetime', () => {
    installNature(false);
    const p = pool();
    const fx = new TierFx(p);
    // ICE motes live ~1.9 s at 1.67/s: well under the caps, so check the cap by bursting a fast element for 1 s
    play(fx, [hero({ element: 'SAND' }), hero({ id: 1, x: 30, self: false, element: 'SAND' })], 1);
    expect(from(p, 0)).toBeLessThanOrEqual(MATCH_SELF_MAX);
    expect(from(p, 30)).toBeLessThanOrEqual(MATCH_OTHER_MAX);
  });
  it('Off, Mine only, team fights, stealth, death, reduced motion and the pool guard', () => {
    installNature(false);
    const them = (): FxHero => hero({ id: 1, x: 30, self: false });
    const cases: [string, (fx: TierFx) => void, FxHero, number][] = [
      ['off (own)', (fx) => (fx.mode = 'off'), hero(), 0],
      ['mine only (other)', (fx) => (fx.mode = 'mine'), them(), 0],
      ['stealth', () => undefined, hero({ stealth: true }), 0],
      ['dead', () => undefined, hero({ dead: true }), 0],
    ];
    for (const [name, set, h, n] of cases) {
      const p = pool();
      const fx = new TierFx(p);
      set(fx);
      play(fx, [h], 3);
      expect(p.bursts.length, name).toBe(n);
    }
    const crowd = [0, 1, 2, 3].map((i) => ({ x: i, z: 0, dead: false }));
    const p = pool();
    const fx = new TierFx(p);
    play(fx, [them()], 3, crowd);
    expect(p.bursts.length, 'team fight').toBe(0);
    const full = pool();
    full.add.count = 900;
    play(new TierFx(full), [hero()], 3);
    expect(full.bursts.length, 'pool guard').toBe(0);
    uninstallNature();
    installNature(true);
    const r = pool();
    play(new TierFx(r), [hero(), them()], 4);
    expect(from(r, 30), 'reduced: others').toBe(0);
    expect(from(r, 0), 'reduced: own still shows').toBeGreaterThan(0);
  });
  it('no gold on another hero; own hero keeps the element colour', () => {
    for (const e of ELEMENTS) for (const accent of [false, true]) expect(isGoldFamily(moteColor(e, false, accent)), e).toBe(false);
    expect(moteColor('ELECTRIC', true, false)).toBe(NATURE.ELECTRIC.primary);
  });
  it('reuses one option object per element (no per-frame allocation)', () => {
    installNature(false);
    const p = pool();
    play(new TierFx(p), [hero({ element: 'GRASS' })], 6);
    const refs = new Set(p.bursts.map((b) => b.o.ref));
    expect(refs.size).toBe(1);
  });
  it('a direct call without install also respects the caps (TierFx gate aside)', () => {
    const p = pool();
    const fx = new TierFx(p);
    fx.begin(0.016, 0, 0, alone);
    natureMote(fx, hero(), false);
    expect(p.bursts.length).toBe(1);
  });
});

describe('lobby', () => {
  const stub = (): Pool => pool();
  it('streams motes up to the cap (60, Low 24), none without a card or with reduced motion', () => {
    const scene = new THREE.Scene();
    const p = stub();
    const n = new LobbyNature(scene, p, { reduced: false });
    expect(scene.getObjectByName('lobby-nature-glow')).toBeTruthy();
    for (let i = 0; i < 300; i++) n.update(1 / 60);
    expect(p.bursts.length).toBe(0);
    n.setElement('SAND', 'LEGENDARY');
    for (let i = 0; i < 600; i++) {
      n.update(1 / 60);
      expect(n.alive()).toBeLessThanOrEqual(LOBBY_MAX);
    }
    expect(p.bursts.length).toBeGreaterThan(100);
    const low = new LobbyNature(new THREE.Scene(), stub(), { low: () => true, reduced: false });
    low.setElement('SAND', 'LEGENDARY');
    for (let i = 0; i < 600; i++) {
      low.update(1 / 60);
      expect(low.alive()).toBeLessThanOrEqual(LOBBY_MAX_LOW);
    }
    const q = stub();
    const rm = new LobbyNature(new THREE.Scene(), q, { reduced: true });
    rm.setElement('FIRE', 'LEGENDARY');
    for (let i = 0; i < 300; i++) rm.update(1 / 60);
    rm.burst();
    expect(q.bursts.length + q.rings).toBe(0);
    expect(rm.glow.visible).toBe(true);
    expect(rm.glow.material.opacity).toBeGreaterThan(0);
  });
  it('the equip burst is a ring plus a rising burst in the element; rarer cards stream more', () => {
    const p = stub();
    const n = createLobbyNature(new THREE.Scene(), p, () => false);
    n.reduced = false;
    n.setElement('FAIRY', 'EPIC');
    n.burst();
    expect(p.rings).toBe(1);
    expect(p.bursts.at(-1)?.o.shape).toBe(NATURE.FAIRY.shape);
    const count = (rung: 'COMMON' | 'LEGENDARY'): number => {
      const q = stub();
      const m = new LobbyNature(new THREE.Scene(), q, { reduced: false });
      m.setElement('WATER', rung);
      for (let i = 0; i < 120; i++) m.update(1 / 60);
      return q.bursts.length;
    };
    expect(count('LEGENDARY')).toBeGreaterThan(count('COMMON'));
  });
  it('dispose removes the glow', () => {
    const scene = new THREE.Scene();
    const n = new LobbyNature(scene, stub(), { reduced: false });
    n.dispose();
    expect(scene.getObjectByName('lobby-nature-glow')).toBeUndefined();
  });
});

describe('cosmetic only', () => {
  const run = (seed: number): string => {
    const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
    const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
    for (let t = 0; t < 900; t++) step(m, []);
    return String(hash(m));
  };
  it('same sim hash with Nature installed and emitting', () => {
    const before = [5, 41].map(run);
    installNature(false);
    const fx = new TierFx(pool());
    play(fx, ELEMENTS.map((e: Element, i) => hero({ id: i, x: i * 3, element: e, self: i === 0 })), 2);
    expect([5, 41].map(run)).toEqual(before);
  });
  it('render/nature and ui/nature import nothing from src/sim (type imports aside)', () => {
    const root = path.resolve(__dirname, '../../src');
    for (const dir of ['render/nature', 'ui/nature']) {
      for (const f of fs.readdirSync(path.join(root, dir))) {
        if (!/\.ts$/.test(f)) continue;
        const src = fs.readFileSync(path.join(root, dir, f), 'utf8');
        for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)) expect(m[1], `${dir}/${f}`).not.toMatch(/(^|\/)sim(\/|$)/);
      }
    }
  });
});
