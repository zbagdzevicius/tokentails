/**
 * gaps3 coat-fx (render/skins/coatFx.ts): every Epic and Legendary coat has its own ultimate, recall and takedown
 * effect in its theme, every Rare coat the shared Rare set in its colours; each effect stays inside its declared cost
 * and the hero's rung cap, Low draws fewer, another hero's needs `extras`, a card skin never draws them, the budgets
 * hold, and TierFx / Effects route the coat's nap, landing, ultimate and takedown through it. The Heroes browser's
 * coat clips (ui/preview/skillSandbox.ts) land a recall in the box and finish the dummy for each themed coat's hero.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAID_COATS } from '../../src/render/cosmetics';
import { COAT_PARTS } from '../../src/render/chars/coatParts';
import { COAT_COST, COAT_MAX, COAT_THEMES, CoatVfx, RARE_SET, coatFxWords, type CoatTheme } from '../../src/render/skins/coatFx';
import { HERO_FX_CAP, emptyProfile, profileFromCard, type SkinFxProfile } from '../../src/render/skins/effectKit';
import { profileFromCoat } from '../../src/render/skins/coatRung';
import { rungAtLeast } from '../../src/render/skins/registry';
import { TierFx, type FxHero } from '../../src/render/skins/tierFx';
import { coatLine } from '../../src/ui/store';
import { SkillSandbox, coatScenario, ME, DUMMY } from '../../src/ui/preview/skillSandbox';
import type { HeroId } from '../../src/sim/api';

function pool() {
  const p = {
    add: { count: 0, limit: 1000 },
    alpha: { count: 0, limit: 600 },
    sprites: 0,
    calls: [] as Record<string, unknown>[],
    single(_pos: THREE.Vector3, o: Record<string, unknown>) {
      p.sprites++;
      p.calls.push({ ...o });
    },
    burst(_pos: THREE.Vector3, o: Record<string, unknown>) {
      p.sprites += Number(o.n ?? 1);
      p.calls.push({ ...o });
    },
    ring(_pos: THREE.Vector3, o: Record<string, unknown>) {
      p.sprites += Number(o.n ?? 1);
    },
  };
  return p;
}
const shock = () => {
  const s = { n: 0, start: () => void s.n++ };
  return s;
};

const EPIC_PLUS = Object.entries(PAID_COATS).filter(([, c]) => rungAtLeast(c.rung, 'EPIC'));
const RARE = Object.entries(PAID_COATS).filter(([, c]) => c.rung === 'RARE');

const coatProfile = (id: string, o: { self?: boolean; extras?: boolean; low?: boolean; slot?: number } = {}): SkinFxProfile =>
  profileFromCoat(id, PAID_COATS[id].hero, o.slot ?? 0, o.self ?? true, 0, o.extras ?? true, o.low ?? false, undefined, true)!;

describe('every Epic and Legendary coat has its own effects; Rare coats share a recoloured set', () => {
  it('the six coats with model parts each have a theme (and words); nothing below Epic has one', () => {
    expect(EPIC_PLUS.length).toBeGreaterThanOrEqual(6);
    for (const [id] of EPIC_PLUS) {
      expect(COAT_THEMES[id], `${id} has no signature theme`).toBeTruthy();
      expect(COAT_PARTS[id]).toBeTruthy();
      const w = coatFxWords(id, PAID_COATS[id].rung)!;
      for (const k of ['ult', 'recall', 'takedown'] as const) expect(w[k].length).toBeGreaterThan(8);
      expect(coatLine(id)).toContain('Ultimate:');
    }
    const themes = new Set(Object.values(COAT_THEMES).map((t) => t.theme));
    expect(themes.size).toBe(Object.keys(COAT_THEMES).length);
    for (const id of Object.keys(COAT_THEMES)) expect(rungAtLeast(PAID_COATS[id].rung, 'EPIC')).toBe(true);
    expect(RARE.length).toBeGreaterThan(0);
    for (const [id] of RARE) expect(coatFxWords(id, 'RARE')).toBe(RARE_SET);
    expect(coatFxWords('coat.x', 'COMMON')).toBeNull();
  });

  it('each effect stays inside its declared cost, the cost inside the rung cap, and Low draws fewer', () => {
    for (const [id, c] of [...EPIC_PLUS, RARE[0]]) {
      const theme: CoatTheme | 'rare' = c.rung === 'RARE' ? 'rare' : COAT_THEMES[id].theme;
      for (const low of [false, true]) {
        for (const kind of ['ult', 'nap', 'land', 'takedown'] as const) {
          const p = pool();
          let bolts = 0;
          const fx = new CoatVfx(p as never, shock());
          fx.bolt = () => void bolts++;
          const prof = coatProfile(id, { low });
          const cost = COAT_COST[theme][kind][low ? 1 : 0];
          expect(cost, `${id} ${kind}`).toBeLessThanOrEqual(HERO_FX_CAP[c.rung]);
          const drew = kind === 'ult' ? fx.ult(0, 0, 4, prof) : kind === 'nap' ? fx.nap(0, 0, prof) : kind === 'land' ? fx.land(0, 0, prof) : fx.takedown(0, 0, prof);
          // the Rare set naps with the kit's motif ring (tierFx), not here
          expect(drew, `${id} ${kind} low=${low}`).toBe(!(theme === 'rare' && kind === 'nap'));
          // a bolt draws a few particles: counted as BOLT_COST each in the declared cost
          expect(p.sprites + bolts * 3, `${id} ${kind} low=${low}`).toBeLessThanOrEqual(cost);
          if (drew) expect(fx.alive(0)).toBe(cost);
        }
        if (!low) {
          const hi = pool();
          const lo = pool();
          new CoatVfx(hi as never, null).ult(0, 0, 4, coatProfile(id));
          new CoatVfx(lo as never, null).ult(0, 0, 4, coatProfile(id, { low: true }));
          expect(lo.sprites).toBeLessThan(hi.sprites);
        }
      }
    }
  });

  it('a Legendary ultimate adds one shockwave (inside the ultimate wave), Epic and Rare none, Low none', () => {
    for (const [id, c] of [...EPIC_PLUS, RARE[0]]) {
      const s = shock();
      new CoatVfx(pool() as never, s).ult(0, 0, 4, coatProfile(id));
      expect(s.n, id).toBe(c.rung === 'LEGENDARY' ? 1 : 0);
      const l = shock();
      new CoatVfx(pool() as never, l).ult(0, 0, 4, coatProfile(id, { low: true }));
      expect(l.n).toBe(0);
    }
  });

  it('only a coat with extras draws: no card skin, no Common, nothing for another hero without extras', () => {
    const fx = new CoatVfx(pool() as never, null);
    const [id] = EPIC_PLUS[0];
    expect(fx.ult(0, 0, 4, coatProfile(id, { self: false, extras: false }))).toBe(false);
    expect(fx.ult(0, 0, 4, null)).toBe(false);
    const card = profileFromCard({ id: 'cat.x', catId: 'x', name: 'X', element: 'FIRE', tierRung: 'LEGENDARY', bond: 30, rung: 'LEGENDARY', coat: { pattern: 'tabby', base: 0xc8891a, deep: 0x3a2a20, light: 0xf0d8b0, cream: 0xfff3dc, stripe: 0.55 }, eyes: { inner: 0, outer: 0, ring: 0 }, earInner: 0, nose: 0, rev: 0, source: 'family', order: 0 } as never, 0, true, 0, true, false, 1);
    expect(card?.coatId).toBeNull();
    expect(fx.themeOf(card)).toBeNull();
    expect(fx.takedown(0, 0, card)).toBe(false);
    const common = emptyProfile();
    common.source = 'coat';
    common.extras = true;
    expect(fx.themeOf(common)).toBeNull();
  });

  it('budgets: the per-hero cap, COAT_MAX in all, and the pool guard', () => {
    const [id] = EPIC_PLUS.find(([, c]) => c.rung === 'LEGENDARY')!;
    const p = pool();
    const fx = new CoatVfx(p as never, null);
    expect(fx.ult(0, 0, 4, coatProfile(id))).toBe(true);
    // a second ultimate the same instant does not fit the hero's Legendary cap
    expect(fx.ult(0, 0, 4, coatProfile(id))).toBe(false);
    fx.tick(1);
    expect(fx.alive(0)).toBe(0);
    // many heroes at once never pass COAT_MAX
    for (let s = 0; s < 10; s++) fx.ult(0, 0, 4, coatProfile(id, { slot: s }));
    expect(fx.alive()).toBeLessThanOrEqual(COAT_MAX);
    fx.tick(1);
    p.add.count = 900;
    expect(fx.ult(0, 0, 4, coatProfile(id))).toBe(false);
  });

  it('another player hero is drawn team-safe: the profile colours (never raw gold) are what the sprites use', () => {
    const id = 'coat.brutus.store_thunderpaw';
    const p = pool();
    const prof = coatProfile(id, { self: false });
    new CoatVfx(p as never, null).takedown(0, 0, prof);
    const allowed = new Set([prof.tint, prof.accent, prof.cream, prof.elementTint]);
    for (const c of p.calls) expect(allowed.has(c.color as number)).toBe(true);
  });
});

describe('TierFx routes a coat nap and landing through the coat effects', () => {
  const tparticles = () => ({ ...pool(), add: { count: 0, limit: 1000 }, alpha: { count: 0, limit: 600 } });
  it('a themed coat naps in its theme and lands on landAt; the Legendary purrs', () => {
    const id = 'coat.clem.s1_sunforged';
    const fx = new TierFx(tparticles() as never);
    const coats = new CoatVfx(pool() as never, null);
    fx.coats = coats;
    let purrs = 0;
    fx.onRecallLand = () => void purrs++;
    const prof = coatProfile(id);
    const h: FxHero = { id: 0, x: 0, z: 0, rung: prof.rung, element: prof.element, self: true, moving: false, stealth: false, dead: false, napping: true, phase: 0, profile: prof, coat: true };
    for (let i = 0; i < 3; i++) {
      fx.begin(1.1, 0, 0, [{ x: 0, z: 0, dead: false }]);
      fx.hero(h);
      fx.end();
      coats.tick(1.1);
    }
    expect(coats.drawn.nap).toBe(3);
    h.napping = false;
    fx.landAt(0);
    fx.begin(0.1, 0, 0, [{ x: 0, z: 0, dead: false }]);
    fx.hero(h);
    fx.end();
    expect(coats.drawn.land).toBe(1);
    expect(purrs).toBe(1);
    // the real landing: a jump of more than 8 m right after napping
    h.napping = true;
    coats.tick(2);
    fx.begin(0.1, 0, 0, [{ x: 0, z: 0, dead: false }]);
    fx.hero(h);
    fx.end();
    h.napping = false;
    h.x = 40;
    fx.begin(0.1, 40, 0, [{ x: 40, z: 0, dead: false }]);
    fx.hero(h);
    fx.end();
    expect(coats.drawn.land).toBe(2);
  });
});

describe('the Heroes browser coat clips (skill sandbox)', () => {
  const heroes = [...new Set(Object.keys(COAT_THEMES).map((id) => PAID_COATS[id].hero))] as HeroId[];
  it('recall: the nap runs its channel and lands back in the box once a loop', () => {
    for (const h of heroes) {
      const sb = new SkillSandbox(h, 'r', undefined, 'recall');
      const loop = coatScenario(h, 'recall').loop;
      let napping = 0;
      let landedAt = -1;
      for (let t = 0; t < loop; t++) {
        const f = sb.next();
        const me = f.snap.entities.find((e) => e.id === ME);
        if (me?.state === 'napping') napping++;
        if (f.landed) landedAt = t;
      }
      expect(napping, h).toBeGreaterThan(90);
      expect(landedAt, h).toBeGreaterThan(0);
      expect(sb.lands).toBe(1);
    }
  });
  it('takedown: the dummy falls inside the loop', () => {
    for (const h of heroes) {
      const sb = new SkillSandbox(h, 'r', undefined, 'takedown');
      const loop = coatScenario(h, 'takedown').loop;
      let down = false;
      for (let t = 0; t < loop && !down; t++) {
        const f = sb.next();
        down = f.snap.events.some((e) => e.type === 'death' && e.id === DUMMY);
      }
      expect(down, h).toBe(true);
    }
  });
});
