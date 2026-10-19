/**
 * Card skins on the champions (GDD §7.2, render/chars/specs.ts): budgets for every hero × 6 patterns × 4 rungs, the
 * dog costume, team colour parts kept, the cape body on team colour, Clem's bow never near the pink bow, and the
 * existing looks byte-identical to before card skins (tests/fixtures/skins/golden-looks.json, captured from HEAD).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { HERO_IDS } from '../../src/data/heroes';
import { DETAIL, HERO_CACHE_MAX, heroBuilt, heroCacheStats, makeHero } from '../../src/render/chars';
import { cardLook, type Look } from '../../src/render/cosmetics';
import { deltaE } from '../../src/render/skins/classify';
import { putSkin, type CatSkin } from '../../src/render/skins/skinStore';
import { eyesOf } from '../../src/render/skins/registry';
import { skinBow } from '../../src/render/chars/specs';
import { TEAM } from '../../src/render/palette';
import { PAL } from '../../src/render/ppk/characters/palette.js';
import type { CatTier } from '../../src/meta/roster';
import type { CoatSpec } from '../../src/render/chars/chibi';

const HEROES: HeroId[] = [...HERO_IDS];
const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const PATTERNS: CoatSpec['pattern'][] = ['solid', 'tabby', 'points', 'spots', 'tuxedo', 'calico'];
const RUNGS: CatTier[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

function skin(id: string, pattern: CoatSpec['pattern'], rung: CatTier, over: Partial<CatSkin> = {}): CatSkin {
  const s: CatSkin = {
    id: `cat.${id}`,
    catId: id,
    name: id,
    element: 'WATER',
    tierRung: rung,
    bond: 0,
    rung,
    coat: { pattern, base: 0x8a6a4a, deep: 0x2a1a10, light: 0xe0c8a8, cream: 0xfff3dc, patch: 0xe07a2a, stripe: 0.55 },
    eyes: eyesOf(0x8fd11e),
    earInner: 0xd58971,
    nose: 0x6a4438,
    rev: 0,
    source: 'family',
    order: 0,
    ...over,
  };
  putSkin(s);
  return s;
}

/** Colour counts of a geometry (rounded rgb → vertex count). */
function colours(g: THREE.BufferGeometry): Map<string, number> {
  const c = g.getAttribute('color');
  const m = new Map<string, number>();
  for (let i = 0; i < c.count; i++) {
    const k = [c.getX(i), c.getY(i), c.getZ(i)].map((v) => Math.round(v * 1000)).join(',');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
const keyOf = (hex: number): string => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b].map((v) => Math.round(v * 1000)).join(',');
};

describe('card skins on every champion (≤ 6k triangles, 0 extra meshes)', () => {
  beforeAll(() => {
    for (const p of PATTERNS) for (const r of RUNGS) skin(`${p}-${r}`, p, r);
  });
  for (const hero of HEROES) {
    it(`${hero}: 6 patterns × 4 rungs stay ≤ 6k triangles at Med`, () => {
      for (const p of PATTERNS)
        for (const r of RUNGS) {
          const g = heroBuilt(hero, 0, cardLook(`cat.${p}-${r}`), DETAIL.med, { match: true }).geometry;
          expect(tris(g)).toBeLessThanOrEqual(6000);
        }
      const h = makeHero(hero, 1, cardLook('cat.calico-LEGENDARY'), { detail: DETAIL.low, match: true });
      let meshes = 0;
      h.object.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes++));
      expect(meshes).toBe(1);
      h.dispose();
    });
  }
  it('the dog costume costs at most 160 triangles (Brutus cat ears; Cacklejaw swaps his round ears)', () => {
    skin('dog', 'tabby', 'COMMON');
    for (const hero of ['brutus', 'cacklejaw'] as const) {
      const plain = tris(heroBuilt(hero, 0, null, 1).geometry);
      const suit = tris(heroBuilt(hero, 0, cardLook('cat.dog'), 1).geometry);
      console.log(`${hero}: ${suit - plain} triangles for the cat costume`);
      expect(suit - plain).toBeLessThanOrEqual(160);
    }
  });
  it('team colour parts keep TEAM[t].main under a card skin (the cape body included: never the chroma path)', () => {
    skin('team', 'tuxedo', 'LEGENDARY', { element: 'FIRE' });
    for (const hero of HEROES)
      for (const team of [0, 1] as const) {
        const plain = colours(heroBuilt(hero, team, null, 1).geometry).get(keyOf(TEAM[team].main)) ?? 0;
        const card = colours(heroBuilt(hero, team, cardLook('cat.team'), 1, { match: true }).geometry).get(keyOf(TEAM[team].main)) ?? 0;
        // the mantle, pauldrons, hood, helmet crest and shield rim stay: at least as much team colour as the default
        expect(card, `${hero} team ${team}`).toBeGreaterThanOrEqual(plain * 0.95);
        expect(card).toBeGreaterThan(0);
      }
  });
  it('Clem\'s bow is never within ΔE 25 of the retired pink bow, whatever the accent', () => {
    const bow = parseInt(String(PAL.bow).slice(1), 16);
    for (const accent of [undefined, bow, 0xff9fd6, 0xffb3c8, 0xd02020, 0x2a6fc0]) {
      const s = skin(`bow${accent ?? 'x'}`, 'solid', 'RARE', accent === undefined ? {} : { accent });
      const b = skinBow(s);
      expect(deltaE(b.main, bow)).toBeGreaterThanOrEqual(25);
      const g = heroBuilt('clem', 0, cardLook(s.id), 1).geometry;
      expect(colours(g).get(keyOf(bow)) ?? 0).toBe(0);
    }
    expect(skinBow(skin('red', 'solid', 'COMMON', { accent: 0xd02020 })).main).toBe(0xd02020);
  });
  it('a bot in a card skin: no gold trim, no opposing-team hem; the player\'s own hero keeps the true element', () => {
    skin('volt', 'solid', 'RARE', { element: 'ELECTRIC' });
    skin('fairy', 'solid', 'RARE', { element: 'FAIRY' });
    const n = (id: string, team: 0 | 1, self: boolean, hex: number): number => colours(heroBuilt('lambo', team, cardLook(id), 1, { match: true, self }).geometry).get(keyOf(hex)) ?? 0;
    for (const team of [0, 1] as const) {
      expect(n('cat.volt', team, true, 0xffe24d)).toBeGreaterThan(0);
      expect(n('cat.volt', team, false, 0xffe24d)).toBe(0);
    }
    expect(n('cat.fairy', 1, true, 0xff9fd6)).toBeGreaterThan(0);
    expect(n('cat.fairy', 1, false, 0xff9fd6)).toBe(0);
    // the bot's cape hem stays the team's deep colour
    expect(n('cat.fairy', 1, false, TEAM[1].deep)).toBeGreaterThanOrEqual(n('cat.fairy', 1, true, TEAM[1].deep));
  });
  it('Rare and up add the element trim; Common only the chest gem', () => {
    const el = 0x4da6ff; // WATER
    skin('common', 'solid', 'COMMON');
    skin('rare', 'solid', 'RARE');
    const n = (id: string): number => colours(heroBuilt('lambo', 0, cardLook(id), 1).geometry).get(keyOf(el)) ?? 0;
    expect(n('cat.common')).toBeGreaterThan(0);
    expect(n('cat.rare')).toBeGreaterThan(n('cat.common'));
  });
});

describe('golden: the existing looks are unchanged', () => {
  it('every hero × team × 6 existing looks × Low/Med matches the colours and positions captured before card skins', () => {
    const golden = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/skins/golden-looks.json'), 'utf8')) as Record<string, string>;
    const looks: (Look | null)[] = [null, { coat: null, chroma: 'FIRE' }, { coat: 'coat.breed.SCOUT', chroma: null }, { coat: 'skin.clem.pink_bow', chroma: 'ICE' }, { coat: 'coat.founder.brutus', chroma: null }, { coat: 'coat.brutus.biscuit', chroma: 'DARK' }];
    let n = 0;
    for (const h of HEROES)
      for (const t of [0, 1] as const)
        for (const l of looks)
          for (const d of [DETAIL.low, DETAIL.med]) {
            const g = heroBuilt(h, t, l, d).geometry;
            const c = g.getAttribute('color').array as Float32Array;
            const p = g.getAttribute('position').array as Float32Array;
            let a = 0x811c9dc5;
            for (const v of c) {
              a ^= Math.round(v * 1e5);
              a = Math.imul(a, 0x01000193) >>> 0;
            }
            for (const v of p) {
              a ^= Math.round(v * 1e5);
              a = Math.imul(a, 0x01000193) >>> 0;
            }
            expect(a.toString(16), `${h}:${t}:${l ? `${l.coat}|${l.chroma}` : '-'}:${d}`).toBe(golden[`${h}:${t}:${l ? `${l.coat}|${l.chroma}` : '-'}:${d}`]);
            n++;
          }
    expect(n).toBe(192);
  });
});

describe('hero geometry cache (reference-counted LRU)', () => {
  it(`keeps at most ${HERO_CACHE_MAX} entries and never evicts one a live character uses`, () => {
    for (let i = 0; i < 40; i++) skin(`lru${i}`, 'solid', 'COMMON', { coat: { pattern: 'solid', base: 0x100000 + i, deep: 0x111111, light: 0xeeeeee, cream: 0xffffff } });
    const held = makeHero('sage', 0, cardLook('cat.lru0'), { detail: 1 });
    for (let i = 1; i < 40; i++) heroBuilt('sage', 0, cardLook(`cat.lru${i}`), 1);
    const st = heroCacheStats();
    expect(st.size).toBeLessThanOrEqual(HERO_CACHE_MAX + 1);
    expect(st.inUse).toBeGreaterThanOrEqual(1);
    // the held geometry is still intact
    expect(held.mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(heroBuilt('sage', 0, cardLook('cat.lru0'), 1).geometry).toBe(held.mesh.geometry);
    held.dispose();
  });
});
