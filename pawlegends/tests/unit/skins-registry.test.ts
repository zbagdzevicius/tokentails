/**
 * Card skins (GDD §7.2): the registry. Sprite URL parsing and the folder aliases, the palette fallback order, the
 * tier rung (fails closed: pack AND a missing origin are Common), the Bond ladder, the opposing-team hue clamp, the
 * look key (changes only with the palette revision), and app builds (no featured skins).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanSprite, spriteParts } from '../../src/embed/bridge';
import { parseRoster, rosterCosmetics, type RosterCat } from '../../src/meta/roster';
import { BREED_COAT, ELEMENT_COLOR, lookKey, resolveLook, cardLook, type Owned } from '../../src/render/cosmetics';
import { hsl } from '../../src/render/skins/classify';
import { bondRungOf, buildFeaturedSkin, buildSkin, clampForTeam, isGoldFamily, trimForTeam, familyRow, maxRung, nextBond, ownedSkins, paletteOf, resetRegistry, setFeaturedSkins, setRosterSkins, tierRungOf } from '../../src/render/skins/registry';
import { getSkin, putSkin, skinRev } from '../../src/render/skins/skinStore';
import { resetProbe } from '../../src/render/skins/spriteProbe';
import { TEAM } from '../../src/render/palette';


const CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';
const cat = (over: Partial<RosterCat> = {}): RosterCat => ({ id: 'c1', name: 'Mochi', type: 'FIRE', tier: 'COMMON', isStarter: false, ...over });

beforeEach(() => {
  resetRegistry();
  resetProbe();
});

describe('sprite URLs', () => {
  it('parses the breed folder and variant from the cleaned URL (bucket and path-style hosts)', () => {
    expect(spriteParts(`${CDN}/assets/PICKLES/hat-samurai.png`)).toEqual({ family: 'PICKLES', variant: 'hat-samurai' });
    expect(spriteParts('https://fra1.cdn.digitaloceanspaces.com/tokentails-nfts/assets/SOLO-SURVIVOR/base.png')).toEqual({ family: 'SOLO-SURVIVOR', variant: 'base' });
    expect(spriteParts(`${CDN}/assets/cats/mochi.png`)).toBeNull();
  });
  it('cleanSprite: allowlisted CDN .png only; trailing spaces are trimmed by new URL()', () => {
    expect(cleanSprite(`${CDN}/assets/GREY/base.png `)).toBe(`${CDN}/assets/GREY/base.png`);
    expect(cleanSprite(`${CDN}/assets/GREY/cat-tate/JUMPING.gif`)).toBeUndefined();
    expect(cleanSprite('https://tokentails.com/cats/pinkie/sprites/base.png')).toBeUndefined();
    expect(cleanSprite('https://evil.example/assets/GREY/base.png')).toBeUndefined();
  });
  it('the roster keeps the sprite, family and variant', () => {
    const [c] = parseRoster([{ id: 'a1', name: 'Samurai', type: 'FIRE', tier: 'COMMON', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/PICKLES/hat-samurai.png` }]);
    expect(c).toMatchObject({ family: 'PICKLES', variant: 'hat-samurai', sprite: `${CDN}/assets/PICKLES/hat-samurai.png` });
  });
  it('aliases: PEACHES (local peachies) and OBISDIAN (reads the OBSIDIAN row) have rows', () => {
    expect(familyRow('PEACHES')).not.toBeNull();
    expect(familyRow('OBISDIAN')).toEqual(familyRow('OBSIDIAN'));
    expect(familyRow('SOLO-SURVIVOR')).not.toBeNull();
    expect(familyRow('NOPE')).toBeNull();
  });
  it('the review overrides are merged (SIAMESE reads as colour points)', () => {
    expect(familyRow('SIAMESE')?.p).toBe('points');
  });
});

describe('palette fallback order', () => {
  it('1 family table, 2 probe (none cached), 3 starter breed, 4 element preset', () => {
    expect(paletteOf({ id: 'a', type: 'FIRE', sprite: `${CDN}/assets/GREY/base.png`, starterBreed: 'PINKIE' }).source).toBe('family');
    expect(paletteOf({ id: 'a', type: 'FIRE', sprite: `${CDN}/assets/UNKNOWN/base.png`, starterBreed: 'PINKIE' }).source).toBe('breed');
    const breed = paletteOf({ id: 'a', type: 'FIRE', starterBreed: 'SCOUT' });
    expect(breed.coat.base).toBe(BREED_COAT.SCOUT.base);
    expect(breed.coat.pattern).toBe('tabby');
    expect(paletteOf({ id: 'a', type: 'FIRE', starterBreed: 'SHADOW' }).coat.pattern).toBe('solid');
    expect(paletteOf({ id: 'a', type: 'ICE' }).source).toBe('element');
  });
});

describe('rarity rung', () => {
  it('tier counts only for adopt / redeem / portrait / starter; pack AND a missing origin are Common', () => {
    for (const origin of ['adopt', 'redeem', 'portrait', 'starter']) expect(tierRungOf({ tier: 'EPIC', origin })).toBe('EPIC');
    expect(tierRungOf({ tier: 'LEGENDARY', origin: 'pack' })).toBe('COMMON');
    expect(tierRungOf({ tier: 'LEGENDARY', origin: undefined })).toBe('COMMON');
    expect(buildSkin(cat({ tier: 'LEGENDARY', origin: 'pack' }), 0).rung).toBe('COMMON');
    expect(buildSkin(cat({ tier: 'LEGENDARY' }), 0).rung).toBe('COMMON');
  });
  it('Bond: 0–2 Common, 3–9 Rare, 10–29 Epic, 30+ Legendary; the rung is the better of tier and Bond', () => {
    expect([0, 2, 3, 9, 10, 29, 30, 99].map(bondRungOf)).toEqual(['COMMON', 'COMMON', 'RARE', 'RARE', 'EPIC', 'EPIC', 'LEGENDARY', 'LEGENDARY']);
    expect(nextBond(0)).toBe(3);
    expect(nextBond(12)).toBe(30);
    expect(nextBond(30)).toBeNull();
    expect(maxRung('RARE', 'EPIC')).toBe('EPIC');
    // a pack cat earns its look by play only
    expect(buildSkin(cat({ tier: 'LEGENDARY', origin: 'pack' }), 10).rung).toBe('EPIC');
    expect(buildSkin(cat({ tier: 'EPIC', origin: 'adopt' }), 3).rung).toBe('EPIC');
  });
  it('a featured (unowned) skin is capped at Rare', () => {
    const s = buildFeaturedSkin({ catalogId: '65a1b2c3d4e5f6a7b8c9d0e1', name: 'Nova', type: 'STELLAR', tier: 'LEGENDARY' });
    expect(s?.rung).toBe('RARE');
    expect(s?.featured).toBe(true);
    expect(buildFeaturedSkin({ catalogId: '65a1b2c3d4e5f6a7b8c9d0e2', name: 'Pip', type: 'ICE' })?.rung).toBe('COMMON');
  });
  it('the carousel orders owned skins by rung, then Bond, then newest', () => {
    setRosterSkins([cat({ id: 'a' }), cat({ id: 'b', tier: 'RARE', origin: 'adopt' }), cat({ id: 'c' }), cat({ id: 'd' })], { c: 2, d: 2 });
    expect(ownedSkins().map((s) => s.catId)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('opposing-team hue clamp (match only)', () => {
  const sat = (c: number | string): number => hsl(c as number)[1];
  it('pink fur on a Woof hero (team 1) drops to saturation 0.35; on a Purrhaven hero it stays', () => {
    const pink = { pattern: 'solid' as const, base: 0xff6f91, deep: 0xe05a80, light: 0xffc0d0, cream: 0xffffff };
    expect(sat(clampForTeam(pink, 1).base)).toBeCloseTo(0.35, 1);
    expect(clampForTeam(pink, 0).base).toBe(pink.base);
    expect(clampForTeam(pink, 1).cream).toBe(0xffffff);
  });
  it('saturated blue fur on a Purrhaven hero (team 0) is clamped against the Woof hue', () => {
    const navy = { pattern: 'solid' as const, base: 0x2a4fc0, deep: 0x26396b, light: 0x8a9ad0, cream: 0xffffff };
    expect(sat(clampForTeam(navy, 0).base)).toBeCloseTo(0.35, 1);
    expect(clampForTeam(navy, 1).base).toBe(navy.base);
  });
});

describe('looks', () => {
  it('lookKey is coat@rev|chroma and changes only with the palette revision', () => {
    setRosterSkins([cat({ id: 'x' })]);
    const k0 = lookKey(cardLook('cat.x'));
    expect(k0).toBe('cat.x@0|-');
    expect(lookKey(cardLook('cat.x'))).toBe(k0);
    putSkin({ ...(getSkin('cat.x') as NonNullable<ReturnType<typeof getSkin>>), rev: 1 });
    expect(skinRev('cat.x')).toBe(1);
    expect(lookKey(cardLook('cat.x'))).toBe('cat.x@1|-');
    // the existing looks keep their keys
    expect(lookKey({ coat: null, chroma: 'FIRE' })).toBe('-|FIRE');
  });
  it('lookKey changes when Bond crosses 3, 10 and 30 (a new rung rebuilds the cached geometry), not in between', () => {
    const key = (bond: number): string => {
      setRosterSkins([cat({ id: 'x' })], { x: bond });
      return lookKey(cardLook('cat.x'));
    };
    const seen = [0, 1, 2, 3, 4, 9, 10, 29, 30, 31].map(key);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[1]).toBe(seen[2]);
    expect(seen[3]).not.toBe(seen[2]);
    expect(seen[4]).toBe(seen[3]);
    expect(seen[6]).not.toBe(seen[5]);
    expect(seen[8]).not.toBe(seen[7]);
    expect(seen[9]).toBe(seen[8]);
    expect(new Set(seen).size).toBe(4);
    // a tier or origin change (a roster refresh) also changes it
    setRosterSkins([cat({ id: 'y' })]);
    const y0 = lookKey(cardLook('cat.y'));
    setRosterSkins([cat({ id: 'y', tier: 'EPIC', origin: 'adopt' })]);
    expect(lookKey(cardLook('cat.y'))).not.toBe(y0);
  });
  it('resolveLook: a stored card skin while the cat is owned, else Classic; never with a chroma', () => {
    const roster = rosterCosmetics([cat({ id: 'x' })]);
    const owned: Owned = { items: new Set(), unlocks: new Set(), roster };
    expect(resolveLook('lambo', owned, { coat: 'cat.x', chroma: 'FIRE' })).toEqual({ coat: 'cat.x', chroma: null });
    expect(resolveLook('lambo', owned, { coat: 'cat.gone', chroma: null })).toEqual({ coat: null, chroma: null });
  });
  it('app builds: the app passes no featured cats, so there are no featured skins', () => {
    setFeaturedSkins([]);
    setRosterSkins([cat({ id: 'x' })]);
    expect(getSkin('cat.f.65a1b2c3d4e5f6a7b8c9d0e1')).toBeNull();
    setFeaturedSkins([{ catalogId: '65a1b2c3d4e5f6a7b8c9d0e1', name: 'Nova', type: 'STELLAR' }]);
    expect(getSkin('cat.f.65a1b2c3d4e5f6a7b8c9d0e1')?.featured).toBe(true);
    // the roster's own app filter: a pack cat never reaches an app build's skins
    const appRoster = parseRoster([{ id: 'p', name: 'Packy', type: 'ICE', tier: 'EPIC', isStarter: false, origin: 'pack' }], { isApp: true });
    expect(appRoster).toEqual([]);
  });
});

describe('card-skin trim on another player\'s hero (showcase bots)', () => {
  it('every element on both teams: never the gold "you" family, never within 25° of the opposing team (saturated)', () => {
    for (const el of Object.keys(ELEMENT_COLOR) as (keyof typeof ELEMENT_COLOR)[])
      for (const team of [0, 1] as const) {
        const c = trimForTeam(ELEMENT_COLOR[el], team);
        expect(isGoldFamily(c), `${el} team ${team}`).toBe(false);
        const [th] = hsl(TEAM[team === 0 ? 1 : 0].main);
        const [h, sat] = hsl(c);
        const d = Math.abs(((h - th + 540) % 360) - 180);
        expect(d > 25 || sat <= 0.45, `${el} team ${team}`).toBe(true);
      }
  });
});
