/**
 * CARD-SKINS.md MVP: the shared skin-effect kit (render/skins/effectKit.ts, coatRung.ts). Profile resolution (card
 * beats coat, pack cats stay Common, coats never read bond, Awakened only from a tier-counting origin with bond 30),
 * per-hero and total particle caps over a scripted 60 s team fight, pooled emission (no per-call objects), Low draws
 * extras for the own hero only, and every colour drawn on another player's hero is team-safe.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEMO_ROSTER } from '../../tools/fixtures/demoRoster';
import { parseRoster, type CatTier } from '../../src/meta/roster';
import { PAID_COATS } from '../../src/render/cosmetics';
import { CARD_MAX, CardVfx } from '../../src/render/skins/cardFx';
import { coatRung, profileFromCoat, skinFxFor } from '../../src/render/skins/coatRung';
import { AWAKEN_FOIL, ELEMENT_SHAPE, HERO_FX_CAP, LEGENDARY_FOIL, MotifEmitter, emptyProfile, foilOf, motifOf, profileFromCard, stageOf, type SkinFxProfile } from '../../src/render/skins/effectKit';
import { getSkin, isGoldFamily, setRosterSkins, skinIdOf } from '../../src/render/skins/registry';
import { COSMETIC_MAX, TierFx, type FxHero } from '../../src/render/skins/tierFx';
import { HeroView } from '../../src/render/views/heroView';
import { cardLook } from '../../src/render/cosmetics';
import { hsl } from '../../src/render/skins/classify';
import { TEAM } from '../../src/render/palette';

const roster = parseRoster(DEMO_ROSTER, { isApp: false });
const skin = (name: string) => getSkin(skinIdOf(`demo-${name}`))!;
const EFFECT_COATS = ['coat.duchess.s1_eclipse', 'coat.clem.s1_sunforged', 'coat.pixel.store_moonwhisker', 'coat.marshmallow.store_frostbell', 'coat.brutus.store_thunderpaw', 'coat.sage.store_bloomtail'];

/** Particle stand-ins that record every option object, position vector and colour they are handed. */
function pools() {
  const opts = new Set<object>();
  const vecs = new Set<object>();
  const colors: number[] = [];
  const p = {
    add: { count: 0, limit: 1000 },
    alpha: { count: 0, limit: 600 },
    calls: 0,
    note(pos: THREE.Vector3, o: Record<string, unknown>) {
      p.calls++;
      opts.add(o);
      vecs.add(pos);
      if (typeof o.color === 'number') colors.push(o.color);
    },
    burst(pos: THREE.Vector3, o: Record<string, unknown>) {
      p.note(pos, o);
    },
    ring(pos: THREE.Vector3, o: Record<string, unknown>) {
      p.note(pos, o);
    },
    single(pos: THREE.Vector3, o: Record<string, unknown>) {
      p.note(pos, o);
    },
  };
  return { p, opts, vecs, colors, shock: { start: () => ({}) } };
}

const inBand = (c: number, team: 0 | 1): boolean => {
  const [th] = hsl(TEAM[team === 0 ? 1 : 0].main);
  const [h, s] = hsl(c);
  return Math.abs(((h - th + 540) % 360) - 180) <= 25 && s > 0.45;
};

describe('profile resolution', () => {
  it('a card beats a coat; coats give their fixed rung and element; below Rare is null', () => {
    setRosterSkins(roster, {});
    const both = skinFxFor(skin('rascal'), 'coat.clem.s1_sunforged', 'clem', 0, true, 0, true, false, 1);
    expect(both?.source).toBe('card');
    expect(both?.rung).toBe('RARE');
    const coat = skinFxFor(null, 'coat.clem.s1_sunforged', 'clem', 0, true, 0, true, false, 1);
    expect(coat).toMatchObject({ source: 'coat', rung: 'LEGENDARY', element: 'FIRE', motif: 'stripes', awakened: false });
    expect(skinFxFor(null, 'coat.clem.s1_sunforged', 'sage', 0, true, 0, true, false, 1)).toBeNull(); // not this hero's
    expect(skinFxFor(null, 'coat.clem.s1_honey_tabby', 'clem', 0, true, 0, true, false, 1)).toBeNull(); // free row: Common
    expect(skinFxFor(skin('pickles'), 'coat.clem.s1_sunforged', 'clem', 0, true, 0, true, false, 1)).toBeNull(); // Common card worn
    expect(coatRung('coat.duchess.s1_eclipse')).toEqual({ rung: 'EPIC', element: 'DARK' });
    expect(coatRung('coat.brutus.store_thunderpaw')).toEqual({ rung: 'LEGENDARY', element: 'ELECTRIC' });
    expect(coatRung('coat.clem.store_calico')?.rung).toBe('RARE');
    expect(motifOf('calico')).toBe('tri');
    expect(motifOf(undefined)).toBe('ring');
  });

  it('pack cats stay Common; coats never read bond; Awakened only from a tier origin with bond 30', () => {
    setRosterSkins(roster, { 'demo-grey': 0 });
    expect(skin('grey').rung).toBe('COMMON'); // an Epic pack cat: no look depends on pack luck
    setRosterSkins(roster, { 'demo-grey': 30, 'demo-pinkie': 30, 'demo-ficus': 29 });
    expect(skin('grey').rung).toBe('LEGENDARY'); // bond lifts it by play
    expect(skin('grey').awakened).toBe(false); // but a pack origin never awakens
    expect(skin('pinkie').awakened).toBe(false); // an Epic cat with bond 30 is Legendary, not Awakened
    expect(skin('ficus').awakened).toBe(false); // bond 29
    setRosterSkins(roster, { 'demo-ficus': 30 });
    expect(skin('ficus').awakened).toBe(true);
    // coats: the same profile whatever the bond table says (a faked bond cannot unlock a sold look)
    const a = profileFromCoat('coat.brutus.store_thunderpaw', 'brutus', 1, true, 0, true, false);
    setRosterSkins(roster, { 'demo-ficus': 999, 'demo-grey': 999 });
    const b = profileFromCoat('coat.brutus.store_thunderpaw', 'brutus', 1, true, 0, true, false);
    expect(b).toEqual(a);
    expect(b?.awakened).toBe(false);
  });

  it('the Awakened stage follows the hero level (4, 7, 10) and drives the foil; Low has none', () => {
    setRosterSkins(roster, { 'demo-ficus': 30 });
    expect([1, 3, 4, 6, 7, 9, 10, 15].map(stageOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    const p = profileFromCard(skin('ficus'), 0, true, 0, true, false, 10)!;
    expect(p.stage).toBe(3);
    expect(foilOf(p)).toBe(AWAKEN_FOIL[3]);
    expect(foilOf({ ...p, stage: 1 })).toBe(AWAKEN_FOIL[1]);
    // every Awakened stage, stage 0 too, is a lasting step above a plain Legendary (not only a one-off burst)
    for (const st of [0, 1, 2, 3] as const) expect(foilOf({ ...p, stage: st })).toBeGreaterThan(LEGENDARY_FOIL);
    for (let i = 1; i < 4; i++) expect(AWAKEN_FOIL[i]).toBeGreaterThan(AWAKEN_FOIL[i - 1]);
    expect(foilOf({ ...p, low: true })).toBe(0);
    setRosterSkins(roster, {});
    expect(foilOf(profileFromCard(skin('ficus'), 0, true, 0, true, false, 10))).toBe(0.15); // plain Legendary
    expect(foilOf(profileFromCard(skin('pinkie'), 0, true, 0, true, false, 10))).toBe(0); // Epic
  });

  it('every element has its own motif shape', () => {
    const shapes = Object.values(ELEMENT_SHAPE);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('flat motifs and the wave paws sit fully above the ground (the particle material depth-tests) and paws stay put', () => {
    const singles: { y: number; size: number; vy: number }[] = [];
    const kp = { single: (at: { y: number }, o: Record<string, unknown>) => singles.push({ y: at.y, size: o.size0 as number, vy: o.vy as number }) };
    const k = new MotifEmitter();
    const p = { ...emptyProfile(), rung: 'LEGENDARY' as const, extras: true };
    k.emit(kp as never, p, 0, 0.12, 0, 6, 0.95, 0.9, true, 0.25);
    k.glyph(kp as never, 15, 0xffffff, 0, 0.5, 0, 0.9, 0.5, 0, 1, 0);
    for (const s of singles.slice(0, 6)) expect(s.y - s.size / 2).toBeGreaterThan(0);
    expect(singles[6].vy).toBe(0);
  });
});

describe('budgets and pooling', () => {
  it('a scripted 60 s team fight keeps every cap: CARD_MAX, COSMETIC_MAX and each hero’s rung cap', () => {
    setRosterSkins(roster, { 'demo-ficus': 30 });
    const { p, shock } = pools();
    const cards = new CardVfx(p, shock);
    const tier = new TierFx(p);
    const profs: SkinFxProfile[] = [];
    for (let id = 0; id < 10; id++) {
      const team: 0 | 1 = id < 5 ? 0 : 1;
      const coat = EFFECT_COATS[id % EFFECT_COATS.length];
      const pr = id === 0 ? profileFromCard(skin('ficus'), 0, true, 0, true, false, 1) : profileFromCoat(coat, null, id, false, team, true, false);
      profs.push(pr!);
    }
    const h: FxHero = { id: 0, x: 0, z: 0, rung: 'COMMON', element: 'FIRE', self: false, moving: true, stealth: false, dead: false, napping: false, phase: 0 };
    const at = new THREE.Vector3();
    let maxTotal = 0;
    let maxTier = 0;
    const maxHero = new Array(10).fill(0);
    for (let f = 0; f < 60 * 30; f++) {
      const t = f / 30;
      cards.tick(1 / 30);
      tier.begin(1 / 30, 0, 0, []);
      for (let id = 0; id < 10; id++) {
        const pr = profs[id];
        pr.stage = pr.awakened ? stageOf(1 + Math.floor(t / 5)) : 0;
        // every event the kit answers, far more often than a real fight
        if ((f + id) % 7 === 0) cards.castSparkle(id, 0, pr);
        if ((f + id) % 3 === 0) cards.impactBurst(at.set(id, 1, 0), id, 0.8, pr, (f + id) % 2 === 0);
        if ((f + id) % 4 === 0) cards.hitMotif(at.set(id, 1, 0), 0.8, pr);
        if ((f + id) % 11 === 0) cards.takedown(id, 0, pr);
        if ((f + id) % 23 === 0) cards.signature(id, 0, 6, pr);
        if (id === 0 && f % 9 === 0) cards.multiKill(0, 0, f, pr);
        h.id = id;
        h.x = id * 3 + (f % 120 === 0 ? 20 : 0);
        h.z = 0;
        h.rung = pr.rung;
        h.element = pr.element;
        h.self = pr.self;
        h.profile = pr;
        h.napping = (f + id * 13) % 200 < 60;
        h.phase = f * 0.4;
        tier.hero(h);
        maxHero[id] = Math.max(maxHero[id], cards.alive(id) + tier.alive(id));
        expect(cards.alive(id)).toBeLessThanOrEqual(HERO_FX_CAP[pr.rung]);
        expect(tier.alive(id)).toBeLessThanOrEqual(HERO_FX_CAP[pr.rung]);
      }
      tier.end();
      maxTotal = Math.max(maxTotal, cards.alive());
      maxTier = Math.max(maxTier, tier.alive());
    }
    expect(maxTotal).toBeLessThanOrEqual(CARD_MAX);
    expect(maxTier).toBeLessThanOrEqual(COSMETIC_MAX);
    expect(cards.emitted).toBeGreaterThan(500); // it really drew
    expect(tier.emitted).toBeGreaterThan(50);
  });

  it('nothing is allocated per call: the same option objects and vectors every time, one profile object per slot', () => {
    setRosterSkins(roster, {});
    const { p, opts, vecs, shock } = pools();
    const cards = new CardVfx(p, shock);
    const kit = new MotifEmitter();
    const pr = profileFromCoat('coat.sage.store_bloomtail', 'sage', 2, true, 0, true, false)!;
    const at = new THREE.Vector3();
    for (let i = 0; i < 400; i++) {
      cards.tick(1);
      cards.castSparkle(0, 0, pr);
      cards.impactBurst(at, 2, 0.8, pr, true);
      cards.hitMotif(at, 0.8, pr);
      cards.takedown(0, 0, pr);
      cards.signature(0, 0, 5, pr);
      cards.multiKill(0, 0, i * 10, pr);
      kit.emit(p, pr, 0, 0, 0, 4, 1, 0.5);
    }
    expect(p.calls).toBeGreaterThan(2000);
    // CardVfx: sparkle, flourish and the kit's single opts; the kit: one opts object. Vectors: the module's and the kit's.
    expect(opts.size).toBeLessThanOrEqual(4);
    expect(vecs.size).toBeLessThanOrEqual(4);
    // HeroView reuses one profile per slot across frames
    const hv = new HeroView();
    hv.tierFx = new TierFx(null);
    hv.mySlot = 0;
    hv.looks.set(0, { coat: 'coat.sage.store_bloomtail', chroma: null });
    const first = hv.cardOf(0);
    for (let i = 0; i < 50; i++) expect(hv.cardOf(0)).toBe(first);
  });

  it('Low draws extras for the own hero only, with reduced counts and no hit motif', () => {
    setRosterSkins(roster, {});
    const hv = new HeroView();
    hv.tierFx = new TierFx(null);
    hv.mySlot = 0;
    hv.looks.set(0, { coat: 'coat.brutus.store_thunderpaw', chroma: null });
    hv.looks.set(3, { coat: 'coat.brutus.store_thunderpaw', chroma: null });
    hv.looks.set(4, cardLook(skin('ficus').id));
    hv.tierFx.low = true;
    expect(hv.cardOf(0)).toMatchObject({ extras: true, low: true, source: 'coat', rung: 'LEGENDARY' });
    expect(hv.cardOf(3)?.extras).toBe(false);
    expect(hv.cardOf(4)?.extras).toBe(false);
    const { p, shock } = pools();
    const cards = new CardVfx(p, shock);
    const own = hv.cardOf(0)!;
    const other = { ...hv.cardOf(3)! };
    expect(cards.hitMotif(new THREE.Vector3(), 0.8, own)).toBe(false); // none on Low
    const before = p.calls;
    expect(cards.castSparkle(0, 0, own)).toBe(true);
    expect(cards.alive(0)).toBe(4); // Low: 4 instead of 6
    expect(cards.castSparkle(0, 0, other)).toBe(false);
    expect(cards.takedown(0, 0, other)).toBe(false);
    expect(p.calls).toBe(before + 1);
    // TierFx on Low: the own hero's recall nap ring, nothing for another hero
    const tp = pools();
    const tier = new TierFx(tp.p);
    tier.low = true;
    tier.begin(1, 0, 0, []);
    const h = (id: number, self: boolean, profile: SkinFxProfile): FxHero => ({ id, x: id, z: 0, rung: profile.rung, element: profile.element, self, moving: false, stealth: false, dead: false, napping: true, phase: 0, profile });
    tier.hero(h(0, true, own));
    expect(tier.alive(0)).toBeGreaterThan(0);
    tier.hero(h(3, false, other));
    expect(tier.alive(3)).toBe(0);
    expect(tier.hero(h(0, true, own))).toBe(0); // no foil on Low
  });

  it("every colour drawn on another player's hero is team-safe (never gold, never the opposing team's hue)", () => {
    setRosterSkins(roster, { 'demo-ficus': 30 });
    let checked = 0;
    const coats = Object.keys(PAID_COATS).filter((id) => PAID_COATS[id].rung !== 'COMMON');
    for (const team of [0, 1] as const) {
      const { p, colors, shock } = pools();
      const cards = new CardVfx(p, shock);
      const tier = new TierFx(p);
      const at = new THREE.Vector3();
      const profs = [...coats.map((c) => profileFromCoat(c, null, 3, false, team, true, false)!), profileFromCard(skin('ficus'), 3, false, team, true, false, 10)!];
      for (const pr of profs) {
        cards.tick(5);
        tier.begin(5, 0, 0, []);
        cards.castSparkle(0, 0, pr);
        cards.impactBurst(at, 3, 0.8, pr, true);
        cards.hitMotif(at, 0.8, pr);
        cards.takedown(0, 0, pr);
        cards.signature(0, 0, 6, pr);
        tier.hero({ id: 3, x: 0, z: 0, rung: pr.rung, element: pr.element, self: false, moving: false, stealth: false, dead: false, napping: true, phase: 0, profile: pr });
        tier.end();
      }
      // cream-family neutrals are drawn on purpose (flourish, glyph); everything coloured must be team-safe
      for (const c of colors) {
        expect(isGoldFamily(c), `${c.toString(16)} team ${team}`).toBe(false);
        expect(inBand(c, team), `${c.toString(16)} team ${team}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('the emitted footprint stays inside the asked radius (readability: no bigger effect)', () => {
    const kit = new MotifEmitter();
    const pos: { x: number; y: number; s: number }[] = [];
    const p = { add: { count: 0, limit: 1 }, alpha: { count: 0, limit: 1 }, single: (v: THREE.Vector3, o: Record<string, unknown>) => void pos.push({ x: v.x, y: v.y, s: o.size0 as number }) };
    for (const pattern of ['solid', 'tabby', 'spots', 'points', 'tuxedo', 'calico'] as const) {
      const pr: SkinFxProfile = { ...emptyProfile(), motif: motifOf(pattern) };
      for (const n of [1, 4, 6, 12]) {
        pos.length = 0;
        kit.emit(p, pr, 0, 0, 0, n, 1, 0.5);
        for (const q of pos) expect(Math.hypot(q.x, q.y) + q.s / 2, `${pattern} ${n}`).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('rung bands (CARD-SKINS.md §5)', () => {
  it('the effect coats carry their rung and element; store and premium pass coats are Rare; free rows Common', () => {
    const want: Record<string, [CatTier, string]> = {
      'coat.duchess.s1_eclipse': ['EPIC', 'DARK'],
      'coat.clem.s1_sunforged': ['LEGENDARY', 'FIRE'],
      'coat.pixel.store_moonwhisker': ['EPIC', 'STELLAR'],
      'coat.marshmallow.store_frostbell': ['EPIC', 'ICE'],
      'coat.clem.store_club_sandwich': ['EPIC', 'SAND'],
      'coat.frankie.store_kebab_king': ['EPIC', 'FIRE'],
      'coat.brutus.store_thunderpaw': ['LEGENDARY', 'ELECTRIC'],
      'coat.sage.store_bloomtail': ['LEGENDARY', 'GRASS'],
    };
    for (const [id, [rung, el]] of Object.entries(want)) expect([PAID_COATS[id].rung, PAID_COATS[id].element], id).toEqual([rung, el]);
    expect(PAID_COATS['coat.clem.store_calico'].rung).toBe('RARE');
    expect(PAID_COATS['coat.meatball.s1_caramel'].rung).toBe('RARE');
    expect(PAID_COATS['coat.clem.s1_honey_tabby'].rung).toBe('COMMON');
    const counts = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of Object.values(PAID_COATS)) counts[c.rung]++;
    expect(counts).toEqual({ COMMON: 6, RARE: 16 + 21, EPIC: 5, LEGENDARY: 3 });
  });
});
