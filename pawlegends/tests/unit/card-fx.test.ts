/**
 * Wave C (C4), render/skins/cardFx.ts: card-tier ability effects. The ladder (Common default, Rare tint, Epic cast
 * sparkle, Legendary paw burst + takedown flourish + paw-print ultimate wave), colour-only tints with the default
 * sizes, gold only on the own hero, the Skin effects setting and the extras caps, the preview copy, the demo roster,
 * and the proof that it is cosmetic: a played match has the same replay (inputs, hash trail, final hash) with and
 * without a card equipped, and neither the sim nor the backend verifier knows about cards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEMO_ROSTER } from '../../src/app/skinDemo';
import { ELEMENTS, parseRoster, type CatTier } from '../../src/meta/roster';
import {
  CARD_MAX, CardVfx, PAW, cardFxDetail, cardFxFor, cardFxLine, cardTint, coatGlow, hasSignature, hasSparkle, tinted, type CardFx,
} from '../../src/render/skins/cardFx';
import { getSkin, setRosterSkins, skinIdOf, isGoldFamily } from '../../src/render/skins/registry';
import { hsl, hslToHex, mixHex } from '../../src/render/skins/classify';
import { HEROES } from '../../src/data/heroes';
import { ELEMENT_COLOR } from '../../src/render/cosmetics';
import { TEAM } from '../../src/render/palette';
import { Effects, impactFlash, ultWaveRadius, type EffectsHooks, type Who } from '../../src/render/effects';
import { CombatVfx } from '../../src/render/fx/combatVfx';
import { Particles } from '../../src/render/fx/Particles.js';
import { ProjectileView } from '../../src/render/views/projectileView';
import { HeroView } from '../../src/render/views/heroView';
import { TierFx } from '../../src/render/skins/tierFx';
import { cardLook } from '../../src/render/cosmetics';
import { cardFxPreview } from '../../src/ui/cardFxView';
import { createMatch, fillPicks, hashTrail, replayRecord, result, snapshot, step } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { NO_TARGET, Op, type CastSlot, type HeroId, type SimEvent } from '../../src/sim/api';
import { PROJECTILE_KIND } from '../../src/data/towers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

setRosterSkins(parseRoster(DEMO_ROSTER, { isApp: false }), {});
const demo = (name: string) => getSkin(skinIdOf(`demo-${name}`))!;
const RUNG_OF: Record<string, CatTier> = { ficus: 'LEGENDARY', pinkie: 'EPIC', rascal: 'RARE', pickles: 'COMMON' };

/** Damage numbers need a camera; these tests only look at particles. */
const quiet = (e: Effects): void => void Object.assign(e, { numbers: { show() {}, pop() {}, render() {}, dispose() {} } });

const fx = (rung: CatTier, over: Partial<CardFx> = {}): CardFx => ({ rung, name: 'Ficus', tint: 0x66ccff, self: true, team: 0, extras: true, ...over });

/** Particles + shockwave stand-ins that record what C4 draws. */
const pools = () => {
  const p = {
    add: { count: 0, limit: 1000 },
    alpha: { count: 0, limit: 600 },
    singles: [] as { pos: THREE.Vector3; o: Record<string, unknown> }[],
    rings: [] as Record<string, unknown>[],
    bursts: 0,
    burst() {
      p.bursts++;
    },
    ring(_pos: THREE.Vector3, o: Record<string, unknown>) {
      p.rings.push({ ...o });
    },
    single(pos: THREE.Vector3, o: Record<string, unknown>) {
      p.singles.push({ pos: pos.clone(), o: { ...o } });
    },
  };
  const waves: { r1: number; color: string }[] = [];
  const shock = { start: (_p: unknown, o: { r1: number; color: string }) => (waves.push({ ...o }), {}) };
  return { p, shock, waves };
};

describe('C4 the rarity ladder from the demo roster', () => {
  it('the demo skins give each rung; Common (and no card) is the default', () => {
    for (const [n, r] of Object.entries(RUNG_OF)) expect(demo(n).rung, n).toBe(r);
    expect(cardFxFor(demo('pickles'), true, 0, true)).toBeNull();
    expect(cardFxFor(null, true, 0, true)).toBeNull();
    expect(cardFxFor(demo('rascal'), true, 0, true)?.rung).toBe('RARE');
    expect(tinted(0x123456, null)).toBe(0x123456);
  });

  it('Rare tints, Epic adds the cast sparkle, Legendary the paw burst, takedown flourish and signature', () => {
    for (const rung of ['RARE', 'EPIC', 'LEGENDARY'] as CatTier[]) expect(tinted(0x2050ff, fx(rung, { tint: 0xff4040 }))).not.toBe(0x2050ff);
    expect(hasSparkle(fx('RARE'))).toBe(false);
    expect(hasSparkle(fx('EPIC'))).toBe(true);
    expect(hasSignature(fx('EPIC'))).toBe(false);
    expect(hasSignature(fx('LEGENDARY'))).toBe(true);
    const at = new THREE.Vector3(10, 1, -10);
    for (const rung of ['RARE', 'EPIC', 'LEGENDARY'] as CatTier[]) {
      const { p, shock } = pools();
      const c = new CardVfx(p, shock);
      const spark = c.castSparkle(10, -10, fx(rung));
      const paw = c.impactBurst(at, 0, 0.8, fx(rung), true);
      const td = c.takedown(10, -10, fx(rung));
      const sig = c.signature(10, -10, 5, fx(rung));
      expect([spark, paw, td, sig], rung).toEqual([rung !== 'RARE', rung === 'LEGENDARY', rung === 'LEGENDARY', rung === 'LEGENDARY']);
    }
  });

  it('copy: "Legendary card: <name> burst", one line per rung, looks only', () => {
    expect(cardFxLine('LEGENDARY', 'Ficus')).toBe('Legendary card: Ficus burst');
    expect(cardFxLine('EPIC', 'Pinkie')).toBe('Epic card: Pinkie sparkle');
    expect(cardFxLine('RARE', 'Rascal')).toBe('Rare card: Rascal tint');
    expect(cardFxLine('COMMON', 'Pickles')).toBe('Common card: Pickles look');
    for (const r of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as CatTier[]) {
      expect(cardFxDetail(r)).not.toMatch(/\d+ ?%|damage|power|stronger|faster|win|buy|price|\$/i);
      const html = cardFxPreview({ name: 'Ficus', rung: r, tint: 0x66ccff });
      expect(html).toContain(`data-card-fx="${r}"`);
      expect(html).toContain('Looks only.');
    }
    expect(cardFxPreview({ name: 'Ficus', rung: 'LEGENDARY', tint: 0x66ccff })).toContain('--fx:#66ccff');
  });
});

describe('C4 readability: colour only, the default footprint, gold only on you', () => {
  it('a carded hit calls the same impact (amount, ability, big) and only the colour changes', () => {
    const calls: unknown[][] = [];
    const run = (card: CardFx | null) => {
      const particles = new Particles({ rng: () => 0.5, groundY: () => 0 });
      const vfx = new CombatVfx(particles, { start: () => ({}), crack: () => ({}) } as never);
      vfx.setTier('high');
      vfx.impact = (...a: unknown[]) => void calls.push(a.slice(1));
      const whos = new Map<number, Who>([
        [0, { id: 0, kind: 'hero', team: 0, hero: 'sage', x: 10, z: -30, yaw: 0, level: 5, maxHp: 900 }],
        [3, { id: 3, kind: 'hero', team: 1, hero: 'brutus', x: 12, z: -30, yaw: 0, level: 5, maxHp: 1200 }],
      ]);
      const juice = new Proxy({}, { get: () => () => {} });
      const hooks: EffectsHooks = { who: (id) => whos.get(id) ?? null, mySlot: 0, myTeam: 0, trickOf: () => 'pounce', onSwing: () => {}, onCast: () => {}, onHit: () => {}, card: () => card };
      const e = new Effects(particles, { start: () => ({}), crack: () => ({}), thud: () => {} } as never, juice as never, hooks, null);
      e.vfx = vfx;
      quiet(e);
      e.handle({ type: 'hit', tick: 1, src: 0, dst: 3, amount: 180, kind: 'ability', shielded: 0 } as SimEvent);
    };
    run(null);
    run(fx('RARE', { tint: 0xff3366 }));
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(calls[1][0]); // amount
    expect(calls[0].slice(2)).toEqual(calls[1].slice(2)); // ability, big
    expect(calls[0][1]).not.toBe(calls[1][1]); // the colour
  });

  it('a carded projectile trail keeps the default size', () => {
    const sizes: number[][] = [];
    for (const card of [null, fx('LEGENDARY')]) {
      const particles = new Particles({ rng: () => 0.5, groundY: () => 0 });
      const v = new ProjectileView(particles);
      const vfx = new CombatVfx(particles, { start: () => ({}), crack: () => ({}) } as never);
      const got: number[] = [];
      vfx.trail = (_p, color, size) => void got.push(size, color);
      v.vfx = vfx;
      v.card = () => card;
      const frame = { projectiles: [{ id: 1, kind: PROJECTILE_KIND.hero, team: 0, owner: 0, x: 1000, y: 1000, fx: 1000, fy: 1000, vx: 10, vy: 0 }], zones: [], byId: new Map([[0, { hero: 'sage' as HeroId }]]) };
      v.update(frame as never, 1);
      sizes.push(got);
    }
    expect(sizes[0][0]).toBe(sizes[1][0]);
    expect(sizes[0][1]).not.toBe(sizes[1][1]);
  });

  it('the paw burst fits inside the default impact flash; the paw-print wave inside the ultimate wave', () => {
    const { p, shock, waves } = pools();
    const c = new CardVfx(p, shock);
    for (const amount of [20, 120, 400, 2000]) {
      p.singles.length = 0;
      const flash = impactFlash(amount);
      c.impactBurst(new THREE.Vector3(0, 1, 0), 0, flash, fx('LEGENDARY'), true);
      expect(p.singles).toHaveLength(PAW.length);
      for (const s of p.singles) {
        const reach = Math.hypot(s.pos.x, s.pos.y - 1) + (s.o.size0 as number) / 2;
        expect(reach, String(amount)).toBeLessThanOrEqual(flash);
      }
      c.tick(1);
    }
    for (const [r, k] of [[2, 1], [6, 1.36], [12, 1.36]] as const) {
      const r1 = ultWaveRadius(r, k);
      p.singles.length = 0;
      c.signature(0, 0, r1, fx('LEGENDARY'));
      c.tick(1);
      expect(waves[waves.length - 1].r1).toBeLessThan(r1);
      for (const s of p.singles) expect(Math.hypot(s.pos.x, s.pos.z) + (s.o.size0 as number) / 2).toBeLessThanOrEqual(r1);
    }
  });

  it("another player's tint is never gold and never the opposing team's hue; your own keeps the coat glow", () => {
    const coats = [0xffd34d, 0xf2b84b, 0xffe066, 0xe0a030, 0xff5a7a, 0x7c5cff, 0x40a0ff, 0x9a9a9a, 0x3a2a1e];
    for (const base of coats) {
      const skin = { coat: { pattern: 'solid' as const, base, deep: base, light: base, cream: base } };
      for (const team of [0, 1] as const) {
        const t = cardTint(skin, false, team);
        expect(isGoldFamily(t), base.toString(16)).toBe(false);
        const [th] = hsl(TEAM[team === 0 ? 1 : 0].main);
        const [h, s] = hsl(t);
        const d = Math.abs(((h - th + 540) % 360) - 180);
        expect(d > 25 || s <= 0.45, `${base.toString(16)} team ${team}`).toBe(true);
        for (const el of ELEMENTS) expect(isGoldFamily(tinted(0xffd34d, { rung: 'RARE', name: 'x', tint: t, self: false, team, extras: true })), el).toBe(false);
      }
      expect(cardTint(skin, true, 0)).toBe(coatGlow(skin));
    }
  });

  it("the drawn colour (default mixed with the tint) is never gold and never the opposing team's hue on another hero", () => {
    const inBand = (c: number, team: 0 | 1): boolean => {
      const [th] = hsl(TEAM[team === 0 ? 1 : 0].main);
      const [h, s] = hsl(c);
      return Math.abs(((h - th + 540) % 360) - 180) <= 25 && s > 0.45;
    };
    // Coats: one per element accent on a brown coat, and a hue sweep of saturated coats.
    const coats: { coat: { pattern: 'solid'; base: number; deep: number; light: number; cream: number }; accent?: number }[] = [];
    const brown = { pattern: 'solid' as const, base: 0x553322, deep: 0x332211, light: 0x775544, cream: 0x998877 };
    for (const el of ELEMENTS) coats.push({ coat: brown, accent: ELEMENT_COLOR[el] });
    for (let h = 0; h < 360; h += 5) for (const l of [0.45, 0.6, 0.72]) {
      const c = hslToHex(h, 0.8, l);
      coats.push({ coat: { pattern: 'solid', base: c, deep: c, light: c, cream: c } });
    }
    let checked = 0;
    for (const hero of Object.values(HEROES)) {
      const team: 0 | 1 = hero.side === 'dog' ? 1 : 0;
      const el = ELEMENT_COLOR[hero.element];
      // The real defaults: the element colour (trails, ability sparks) and its blend with the team colour (basic hits).
      const bases = [el, mixHex(TEAM[team].main, el, 0.35), mixHex(TEAM[team].main, el, 0.45)];
      for (const skin of coats) {
        const f = cardFxFor({ ...demo('ficus'), ...skin, rung: 'RARE' } as never, false, team, true)!;
        for (const base of bases) {
          const c = tinted(base, f);
          expect(isGoldFamily(c), `${hero.name} ${base.toString(16)} -> ${c.toString(16)}`).toBe(false);
          expect(inBand(c, team), `${hero.name} ${base.toString(16)} -> ${c.toString(16)}`).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('the Skin effects setting, Low and team fights: tints for all, extras only where tierFx allows', () => {
    const hv = new HeroView();
    hv.tierFx = new TierFx(null);
    hv.mySlot = 0;
    hv.looks.set(0, cardLook(demo('ficus').id));
    hv.looks.set(3, cardLook(demo('ficus').id));
    hv.looks.set(4, cardLook(demo('pickles').id));
    expect(hv.cardOf(0)?.extras).toBe(true);
    expect(hv.cardOf(3)?.extras).toBe(true);
    expect(hv.cardOf(4)).toBeNull(); // Common
    expect(hv.cardOf(1)).toBeNull(); // no card
    hv.tierFx.low = true;
    expect(hv.cardOf(0)?.extras).toBe(true);
    expect(hv.cardOf(3)?.rung).toBe('LEGENDARY');
    expect(hv.cardOf(3)?.extras).toBe(false);
    hv.tierFx.low = false;
    hv.tierFx.mode = 'mine';
    expect(hv.cardOf(0)).not.toBeNull();
    expect(hv.cardOf(3)).toBeNull();
    hv.tierFx.mode = 'off';
    expect(hv.cardOf(0)).toBeNull();
  });

  it('the extras stay under CARD_MAX and skip a full pool; basic-hit paws pace per hero', () => {
    const { p, shock } = pools();
    const c = new CardVfx(p, shock);
    const at = new THREE.Vector3();
    for (let i = 0; i < 50; i++) c.signature(0, 0, 6, fx('LEGENDARY'));
    expect(c.alive()).toBeLessThanOrEqual(CARD_MAX);
    c.tick(5);
    expect(c.impactBurst(at, 2, 0.8, fx('LEGENDARY'), false)).toBe(true);
    expect(c.impactBurst(at, 2, 0.8, fx('LEGENDARY'), false)).toBe(false);
    expect(c.impactBurst(at, 3, 0.8, fx('LEGENDARY'), false)).toBe(true);
    c.tick(5);
    p.add.count = 900;
    expect(c.castSparkle(0, 0, fx('LEGENDARY'))).toBe(false);
    expect(c.impactBurst(at, 2, 0.8, fx('LEGENDARY', { extras: false }), true)).toBe(false);
  });
});

/** A played match with every sim event fed to an Effects director; `card` decides what each hero's card adds. */
function playMatch(card: ((id: number) => CardFx | null) | null): { rec: ReturnType<typeof replayRecord>; trail: readonly number[]; drawn: number } {
  const seed = 4242;
  const { picks, tricks } = fillPicks(seed, 'sage', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
  const particles = new Particles({ rng: () => 0.5, groundY: () => 0 });
  const sh = { start: () => ({}), crack: () => ({}), thud: () => {} };
  const whos = new Map<number, Who>();
  const juice = new Proxy({}, { get: () => () => {} });
  const hooks: EffectsHooks = { who: (id) => whos.get(id) ?? null, mySlot: 0, myTeam: 0, trickOf: () => 'pounce', onSwing: () => {}, onCast: () => {}, onHit: () => {}, ...(card ? { card } : {}) };
  const e = new Effects(particles, sh as never, juice as never, hooks, null);
  const vfx = new CombatVfx(particles, sh as never);
  vfx.setTier('high');
  e.vfx = vfx;
  quiet(e);
  const cards = new CardVfx(particles, sh);
  e.cards = cards;
  for (let t = 0; !result(m); t++) {
    if (t % 97 === 0) step(m, [{ op: Op.Move, x: 10000 + ((t * 37) % 80000), y: 5000 + ((t * 13) % 50000) }]);
    else if (t % 61 === 0) step(m, [{ op: Op.Cast, slot: ((t / 61) % 4) as CastSlot, x: 50000, y: 30000, id: NO_TARGET }]);
    else step(m);
    const s = snapshot(m, 0);
    for (const u of s.entities) whos.set(u.id, { id: u.id, kind: u.kind, team: u.team, ...(u.hero ? { hero: u.hero } : {}), x: u.x / 1000, z: -u.y / 1000, yaw: u.facing, level: u.level ?? 1, maxHp: u.maxHp });
    for (const ev of s.events) e.handle(ev);
    e.render(1 / 30);
  }
  return { rec: replayRecord(m), trail: hashTrail(m), drawn: cards.emitted };
}

describe('C4 is cosmetic only', { timeout: 240000 }, () => {
  it('the same replay (inputs, hash trail, final hash) with and without a card equipped', () => {
    const legendary = (id: number) => cardFxFor(demo('ficus'), id === 0, id < 3 ? 0 : 1, true);
    const plain = playMatch(null);
    const carded = playMatch(legendary);
    expect(carded.drawn).toBeGreaterThan(0); // the card really drew
    expect(plain.drawn).toBe(0);
    expect(carded.trail).toEqual(plain.trail);
    expect(carded.rec).toEqual(plain.rec);
    const v = verifyReplay(carded.rec!);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.finalHash).toBe(plain.rec!.finalHash);
  });

  it('the sim, the backend verifier and the vendored bundles never mention cards or card effects', () => {
    const walk = (dir: string): string[] =>
      fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])) : [];
    const files = [...walk(path.join(ROOT, 'src/sim')), ...walk(path.join(ROOT, '../backend/src/vendor/pawlegends-sim')), ...walk(path.join(ROOT, '../backend/src/pawlegends'))];
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const bad of ['cardFx', 'CardFx', 'CardVfx', 'skinStore', 'tierFx', 'coatGlow']) expect(src.includes(bad), `${path.relative(ROOT, f)}: ${bad}`).toBe(false);
    }
    const mine = fs.readFileSync(path.join(ROOT, 'src/render/skins/cardFx.ts'), 'utf8');
    expect(/from '(\.\.\/)+sim\//.test(mine)).toBe(false);
  });
});
