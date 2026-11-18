/**
 * Map colour schemes (render only, render/mapSchemes.ts + render/views/schemeGrade.ts): every map has at least three
 * schemes with its native look first, the pick is a pure function of the match seed and the map (the same on every
 * client), and every scheme keeps the reads: Catnip Bushes against the walkable ground and the raised caps, the caps
 * against the ground, the relation and team colours against the ground (CIE76 ΔE on the reference colours each map
 * paints with), team paint on the ground untouched, the light's nudge mild.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAP_IDS } from '../../src/sim/api';
import { RELATION, TEAM } from '../../src/render/palette';
import { BASE_DAY, DAYLIGHT, dayLightAt } from '../../src/render/daylight';
import { HW, HW_RAISE } from '../../src/render/views/hearthwoodView';
import { mapTheme } from '../../src/render/views/mapThemes';
import { ROLES, SCHEME_MAPS, gradeHex, gradeUniforms, mapBands, mapSchemes, pickScheme, rgb01, schemeDay, type MapScheme, type Role } from '../../src/render/mapSchemes';
import { gradeMaterial, gradeState, injectGrade, setGrade } from '../../src/render/views/schemeGrade';

const lab = (hex: number): number[] => {
  const c = rgb01(hex).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047);
  const Y = f(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  const Z = f((0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const dE = (a: number, b: number): number => {
  const x = lab(a);
  const y = lab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const hex = (s: string): number => parseInt(s.slice(1), 16);
const mul = (a: number, b: number): number => rgb01(a).reduce((acc, v, i) => (acc << 8) | Math.round(v * rgb01(b)[i] * 255), 0);
/** The raised cap draws its vertex colour × the grass tile (mapView grassTile, #9fd383). */
const TILE = 0x9fd383;
const GREEN_BUSH = [0x5fae62, 0x72c070];

/** What each map paints with: walkable ground, the raised cap as drawn, the cliff side, the bushes, a tree. */
function refs(map: string): { ground: number; cap: number; side: number; bush: number[]; tree: number } {
  if (map === 'hearthwood') return { ground: hex(HW.grass), cap: HW_RAISE.cap, side: HW_RAISE.side, bush: [...HW.bush], tree: HW.leaves[0] };
  const th = mapTheme(map);
  return { ground: hex(th.grass[1]), cap: mul(th.raise.cap, TILE), side: th.raise.side, bush: GREEN_BUSH, tree: 0x5aa35a };
}

const g = (s: MapScheme, map: string, role: Role, c: number): number => gradeHex(c, gradeUniforms(s.grade[role], mapBands(map)[role]));

describe('every map has its schemes', () => {
  it('a table for every map id', () => {
    expect([...SCHEME_MAPS].sort()).toEqual([...MAP_IDS].sort());
  });
  for (const map of MAP_IDS) {
    it(`${map}: at least 3 schemes, native first, ids unique`, () => {
      const all = mapSchemes(map);
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all[0].season).toBe('native');
      expect(Object.keys(all[0].grade)).toEqual([]);
      expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
      expect(new Set(all.map((s) => s.season)).size).toBe(all.length);
      for (const s of all) expect(s.id.startsWith(`${map}:`)).toBe(true);
    });
  }
});

describe('the pick follows the match seed', () => {
  it('same seed and map: same scheme; the wish wins', () => {
    for (const map of MAP_IDS)
      for (const seed of [0, 1, 7, 123456789, 0xffffffff, -5]) {
        expect(pickScheme(map, seed).id).toBe(pickScheme(map, seed).id);
        expect(pickScheme(map, seed, 'frost').season).toBe('frost');
        expect(pickScheme(map, seed, `${map}:native`).season).toBe('native');
        // a wish the map lacks falls back to the seed's pick
        expect(pickScheme(map, seed, 'nope').id).toBe(pickScheme(map, seed).id);
      }
  });
  it('every scheme comes up across seeds (rotation), none hogs it', () => {
    for (const map of MAP_IDS) {
      const n = new Map<string, number>();
      for (let seed = 0; seed < 2000; seed++) {
        const id = pickScheme(map, (seed * 2654435761) >>> 0).id;
        n.set(id, (n.get(id) ?? 0) + 1);
      }
      const all = mapSchemes(map);
      expect(n.size).toBe(all.length);
      for (const c of n.values()) expect(c / 2000).toBeGreaterThan(0.6 / all.length);
    }
  });
  it('consecutive seeds do not all land on one scheme', () => {
    const seen = new Set(Array.from({ length: 12 }, (_, i) => pickScheme('crossing', 1000 + i).season));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('readability in every scheme', () => {
  for (const map of MAP_IDS) {
    for (const s of mapSchemes(map)) {
      if (s.season === 'native') continue;
      it(`${s.id}: bushes, caps, rings and team colours read`, () => {
        const r = refs(map);
        const ground = g(s, map, 'ground', r.ground);
        const cap = g(s, map, 'cap', r.cap);
        const bush = r.bush.map((c) => g(s, map, 'bush', c));
        for (const b of bush) {
          // a bush never melts into the ground or the raised block next to it
          expect(dE(b, ground), `bush ${b.toString(16)} vs ground ${ground.toString(16)}`).toBeGreaterThanOrEqual(14);
          expect(dE(b, cap), `bush ${b.toString(16)} vs cap ${cap.toString(16)}`).toBeGreaterThanOrEqual(12);
        }
        // the raised block reads apart from the walkable ground (its rim and sides add to this)
        expect(dE(cap, ground)).toBeGreaterThanOrEqual(12);
        expect(dE(g(s, map, 'cliff', r.side), cap)).toBeGreaterThanOrEqual(12);
        // rings, bars and telegraphs (never graded) against the graded ground
        for (const c of [RELATION.self, RELATION.ally, RELATION.enemy, RELATION.danger, RELATION.neutral]) expect(dE(c, ground), c.toString(16)).toBeGreaterThanOrEqual(25);
        for (const t of [TEAM[0].main, TEAM[1].main]) expect(dE(t, ground), t.toString(16)).toBeGreaterThanOrEqual(25);
        // team paint on the ground (plaza paw prints, threads) is outside the green band: untouched
        for (const c of [TEAM[0].main, TEAM[0].deep, TEAM[1].main, TEAM[1].second, 0xefe2c9, 0xdcc39a]) expect(dE(g(s, map, 'ground', c), c)).toBeLessThan(3);
        // the season shows: the ground or the trees really change
        expect(Math.max(dE(ground, r.ground), dE(g(s, map, 'trees', r.tree), r.tree))).toBeGreaterThan(10);
      });
    }
  }
  it('the native scheme is the identity', () => {
    for (const map of MAP_IDS) {
      const s = mapSchemes(map)[0];
      for (const role of ROLES) for (const c of [0x9fd383, 0x5fae62, 0x3d8bff, 0xb3562c, 0x6f7a4a]) expect(g(s, map, role, c)).toBe(c);
    }
  });
  it("the light's nudge stays mild (daylight readability bounds)", () => {
    for (const map of MAP_IDS)
      for (const s of mapSchemes(map))
        for (const t of [0, 1]) {
          const base = dayLightAt(DAYLIGHT[map] ?? { look: '', day: BASE_DAY, dusk: BASE_DAY }, t);
          const d = schemeDay(dayLightAt(DAYLIGHT[map] ?? { look: '', day: BASE_DAY, dusk: BASE_DAY }, t), s.light);
          const toHex = (v: number[]): number => v.reduce((a, x) => (a << 8) | Math.round(x * 255), 0);
          expect(dE(toHex(d.sun), toHex(base.sun))).toBeLessThan(6);
          expect(dE(toHex(d.sky), toHex(base.sky))).toBeLessThan(8);
          expect(d.sunI).toBe(base.sunI);
          expect(d.dir).toEqual(base.dir);
        }
  });
});

describe('the shader grade', () => {
  it('injects the functions before main and the call at the end of main', () => {
    const src = injectGrade(THREE.ShaderLib.lambert.fragmentShader);
    expect(src.indexOf('vec3 plGrade(')).toBeLessThan(src.search(/void\s+main/));
    expect(src.trimEnd().endsWith('gl_FragColor.rgb = plGrade(gl_FragColor.rgb);\n}'.trimEnd())).toBe(true);
    expect(src.lastIndexOf('#include <dithering_fragment>')).toBeLessThan(src.lastIndexOf('plGrade(gl_FragColor'));
  });
  it('keeps each material its own program key, plus the role', () => {
    const a = new THREE.MeshLambertMaterial();
    a.onBeforeCompile = (sh) => void (sh.fragmentShader += '\n// a');
    const b = new THREE.MeshLambertMaterial();
    b.onBeforeCompile = (sh) => void (sh.fragmentShader += '\n// b');
    const c = new THREE.MeshLambertMaterial();
    c.customProgramCacheKey = () => 'mine';
    const before = [a.customProgramCacheKey(), b.customProgramCacheKey()];
    gradeMaterial(a, 'ground');
    gradeMaterial(b, 'ground');
    gradeMaterial(c, 'bush');
    gradeMaterial(c, 'ground');
    expect(a.customProgramCacheKey()).toBe(`${before[0]}|pl-grade-ground`);
    expect(b.customProgramCacheKey()).toBe(`${before[1]}|pl-grade-ground`);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(c.customProgramCacheKey()).toBe('mine|pl-grade-bush');
    // the old hook still runs, then the grade
    const sh = { uniforms: {}, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: '' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    a.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect(sh.fragmentShader).toContain('// a');
    expect(sh.fragmentShader).toContain('plGrade(gl_FragColor.rgb)');
    expect(Object.keys(sh.uniforms)).toEqual(['plGA', 'plGB', 'plGT']);
  });
  it('setGrade writes the scheme into the shared uniforms; null puts the native back', () => {
    setGrade('crossing', pickScheme('crossing', 0, 'frost'));
    expect(gradeState('ground').b[0]).toBe(1);
    expect(gradeState('cliff').tint[2]).toBeCloseTo(0xea / 255, 5);
    setGrade('crossing', null);
    for (const r of ROLES) expect(gradeState(r)).toEqual({ a: [0, 0, 0, 0], b: [0, 1, 1, 0], tint: [1, 1, 1] });
  });
});
