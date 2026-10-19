/**
 * Card skins (GDD §7.2): every owned Token Tails cat is a skin every champion can wear. This module turns roster
 * cats (and the ≤ 2 featured cats) into `CatSkin`s in render/skins/skinStore.ts. Render only: no skin is ever sim
 * input (tests/unit/determinism.test.ts checks the import graph).
 *
 * Palette, first hit wins: (1) the generated family table (families.gen.ts + overrides.json), (2) the runtime
 * sprite probe (spriteProbe.ts, families missing from the table), (3) the starter breed coat, (4) an element preset.
 * A variant sprite (`hat-samurai`, `bow-tie-red`) also asks the probe for its accent colour (Clem's bow).
 *
 * Rarity rung = max(tier rung, bond rung). The tier counts only for cats with origin adopt / redeem / portrait /
 * starter; every other origin, a pack and a missing origin included, is Common (decision #19 fails closed: no look
 * depends on pack luck). Bond is earned by play: finished matches wearing the skin, 3 → Rare, 10 → Epic, 30 → Legendary.
 */
import type { CoatSpec, EyeSpec } from '../chars/chibi';
import { BREED_COAT, ELEMENT_COLOR, companionCoat, type Coat } from '../cosmetics';
import { KITTEN_COATS, stableIndex, TIERS, type CatTier, type Element, type RosterCat } from '../../meta/roster';
import type { FeaturedCat } from '../../embed/bridge';
import { spriteParts } from '../../embed/bridge';
import { TEAM } from '../palette';
import { AMBER_EYES, hsl, hslToHex, mixHex, shadeHex, type SkinRow } from './classify';
import { FAMILIES, type FamilyRow } from './families.gen';
import OVERRIDES from './overrides.json';
import { probeResult, requestProbe } from './spriteProbe';
import { FEATURED_SKIN_PREFIX, getSkin, putSkin, putSkins, skinIdOf, type CatSkin } from './skinStore';

export { getSkin, skinIdOf, isCardSkinId, allSkins, FEATURED_SKIN_PREFIX, SKIN_PREFIX, type CatSkin } from './skinStore';

/** Origins whose tier shows on the ladder (anything else, a missing origin included, is Common). */
export const TIER_ORIGINS: readonly string[] = Object.freeze(['adopt', 'redeem', 'portrait', 'starter']);
/** Bond thresholds (finished matches wearing the skin), best first. */
export const BOND_RUNGS: readonly (readonly [number, CatTier])[] = Object.freeze([
  [30, 'LEGENDARY'],
  [10, 'EPIC'],
  [3, 'RARE'],
] as const);

export const rungIndex = (t: CatTier): number => TIERS.indexOf(t);
export const maxRung = (a: CatTier, b: CatTier): CatTier => (rungIndex(a) >= rungIndex(b) ? a : b);
export const rungAtLeast = (r: CatTier, min: CatTier): boolean => rungIndex(r) >= rungIndex(min);

export function tierRungOf(cat: Pick<RosterCat, 'tier' | 'origin'>): CatTier {
  return cat.origin !== undefined && TIER_ORIGINS.includes(cat.origin) ? cat.tier : 'COMMON';
}

export function bondRungOf(matches: number): CatTier {
  for (const [n, r] of BOND_RUNGS) if (matches >= n) return r;
  return 'COMMON';
}

/** The next bond threshold above `matches` (null at Legendary). */
export function nextBond(matches: number): number | null {
  const up = [...BOND_RUNGS].reverse().find(([n]) => matches < n);
  return up ? up[0] : null;
}

const hexOf = (v: unknown): number | undefined => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : typeof v === 'number' ? v : undefined);

/** The family row with its review overrides; OBISDIAN (no base sheet) reads the OBSIDIAN row. */
export function familyRow(family: string | undefined): FamilyRow | null {
  if (!family) return null;
  const key = family === 'OBISDIAN' ? 'OBSIDIAN' : family;
  const base = FAMILIES[key];
  if (!base) return null;
  const o = (OVERRIDES as unknown as Record<string, Record<string, unknown> | undefined>)[key];
  if (!o) return base;
  const out: FamilyRow = { ...base };
  if (typeof o.p === 'string') out.p = o.p as FamilyRow['p'];
  for (const k of ['b', 'd', 'l', 'c', 'x', 'e', 'n', 'i'] as const) {
    const v = hexOf(o[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const fromRow = (r: SkinRow): FamilyRow => ({ p: r.pattern, b: r.base, d: r.deep, l: r.light, c: r.cream, ...(r.patch !== undefined ? { x: r.patch } : {}), e: r.eyes, n: r.nose, i: r.earInner, k: r.confidence });

function coatFromRow(r: FamilyRow): CoatSpec {
  return { pattern: r.p, base: r.b, deep: r.d, light: r.l, cream: r.c, stripe: 0.55, ...(r.x !== undefined ? { patch: r.x } : {}) };
}

function coatFromKitten(c: Coat, tabby: boolean): CoatSpec {
  return { pattern: tabby ? 'tabby' : 'solid', base: c.base, deep: c.dark, light: c.light, cream: c.light, stripe: 0.55 };
}

export function eyesOf(eye: number): EyeSpec {
  return { inner: mixHex(eye, 0xffffff, 0.35), outer: eye, ring: shadeHex(eye, 0.5) };
}

interface Source {
  row: FamilyRow | null;
  coat: CoatSpec;
  eyes: number;
  nose: number;
  earInner: number;
  accent?: number;
  source: CatSkin['source'];
}

/** The palette chain for one cat (no side effects; probes are requested by `wantProbe`). */
export function paletteOf(cat: { id: string; type: Element; starterBreed?: RosterCat['starterBreed']; sprite?: string }): Source {
  const parts = cat.sprite ? spriteParts(cat.sprite) : null;
  const fam = familyRow(parts?.family);
  const probe = cat.sprite ? probeResult(cat.sprite) : undefined;
  const accent = probe?.ok && typeof probe.accent === 'number' ? probe.accent : undefined;
  if (fam) return { row: fam, coat: coatFromRow(fam), eyes: fam.e, nose: fam.n, earInner: fam.i, ...(accent !== undefined ? { accent } : {}), source: 'family' };
  if (probe?.ok && probe.row) {
    const r = fromRow(probe.row);
    return { row: r, coat: coatFromRow(r), eyes: r.e, nose: r.n, earInner: r.i, ...(accent !== undefined ? { accent } : {}), source: 'probe' };
  }
  if (cat.starterBreed) {
    const b = BREED_COAT[cat.starterBreed];
    return { row: null, coat: coatFromKitten(b, cat.starterBreed === 'SCOUT' || cat.starterBreed === 'SUNNY'), eyes: AMBER_EYES, nose: b.accent, earInner: b.accent, source: 'breed' };
  }
  const c = companionCoat(stableIndex(cat.id, KITTEN_COATS), cat.type);
  return { row: null, coat: coatFromKitten(c, false), eyes: AMBER_EYES, nose: c.accent, earInner: c.accent, source: 'element' };
}

/** Does this cat still need a probe (no table row, or a variant without a known accent)? */
export function needsProbe(sprite: string | undefined): boolean {
  if (!sprite) return false;
  const parts = spriteParts(sprite);
  if (!parts) return false;
  if (probeResult(sprite)) return false;
  return !familyRow(parts.family) || parts.variant !== 'base';
}

let revs = new Map<string, number>();
const listeners = new Set<() => void>();
/** Called when a probe changed a skin (the app redraws the pick screen and the lobby). */
export function onSkinsChanged(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function buildSkin(cat: RosterCat, bond: number, order = 0): CatSkin {
  const id = skinIdOf(cat.id);
  const p = paletteOf(cat);
  const parts = cat.sprite ? spriteParts(cat.sprite) : null;
  const tierRung = tierRungOf(cat);
  return {
    id,
    catId: cat.id,
    name: cat.name,
    element: cat.type,
    tierRung,
    bond,
    rung: maxRung(tierRung, bondRungOf(bond)),
    ...(parts ? { family: parts.family, variant: parts.variant } : {}),
    ...(cat.art ? { art: cat.art } : {}),
    ...(cat.sprite ? { sprite: cat.sprite } : {}),
    coat: p.coat,
    eyes: eyesOf(p.eyes),
    earInner: p.earInner,
    nose: p.nose,
    ...(p.accent !== undefined ? { accent: p.accent } : {}),
    rev: revs.get(id) ?? 0,
    source: p.source,
    ...(cat.origin === 'pack' ? { fromPack: true } : {}),
    ...(cat.catalogId ? { catalogId: cat.catalogId } : {}),
    order,
  };
}

/**
 * A featured (unowned) cat as a preview or showcase skin: never above Rare (its trim shows from Rare; Epic and
 * Legendary effects are earned by play only).
 */
export function buildFeaturedSkin(f: FeaturedCat): CatSkin | null {
  if (!(f.type in ELEMENT_COLOR)) return null;
  const tier = (TIERS as readonly string[]).includes(f.tier ?? '') ? (f.tier as CatTier) : 'COMMON';
  const cat: RosterCat = { id: `f.${f.catalogId}`, name: f.name, type: f.type as Element, tier: 'COMMON', isStarter: false, ...(f.sprite ? { sprite: f.sprite } : {}), ...(f.art ? { art: f.art } : {}) };
  const s = buildSkin(cat, 0);
  const rung: CatTier = rungAtLeast(tier, 'RARE') ? 'RARE' : 'COMMON';
  return { ...s, id: `${FEATURED_SKIN_PREFIX}${f.catalogId}`, tierRung: rung, rung, featured: true, catalogId: f.catalogId };
}

let rosterCats: readonly RosterCat[] = [];
let featuredCats: readonly FeaturedCat[] = [];
let bondOf: Readonly<Record<string, number>> = {};

/** What a skin's built geometry depends on (besides its id): the rung (trim from Rare) and the palette. */
const lookPrint = (s: CatSkin): string => JSON.stringify([s.rung, s.element, s.coat, s.eyes, s.earInner, s.nose, s.accent ?? null]);

function rebuild(): void {
  const list: CatSkin[] = rosterCats.map((c, i) => buildSkin(c, bondOf[c.id] ?? 0, i));
  for (const f of featuredCats) {
    const s = buildFeaturedSkin(f);
    if (s) list.push(s);
  }
  // a new rung (Bond 3, 10, 30; a tier or origin change) or palette bumps the rev, so the geometry, lobby and
  // portrait caches (all keyed by lookKey) rebuild instead of serving the old look
  for (const s of list) {
    const old = getSkin(s.id);
    if (old && lookPrint(old) !== lookPrint(s)) {
      const rev = Math.max(revs.get(s.id) ?? 0, old.rev) + 1;
      revs.set(s.id, rev);
      s.rev = rev;
    }
  }
  putSkins(list);
}

/** The owned roster and the bond counts (meta/profile.ts `bond`). */
export function setRosterSkins(cats: readonly RosterCat[], bond: Readonly<Record<string, number>> = {}): void {
  rosterCats = cats;
  bondOf = bond;
  rebuild();
}

/** The host's featured cats (web only; app builds pass []). */
export function setFeaturedSkins(list: readonly FeaturedCat[]): void {
  featuredCats = list;
  rebuild();
}

/** Ask for the probe a skin still needs (a tile on screen, a skin worn). Its rev bumps when the probe lands. */
export function wantProbe(id: string): void {
  const s = getSkin(id);
  if (!s?.sprite || !needsProbe(s.sprite)) return;
  const fam = familyRow(s.family);
  const colours = fam ? [fam.b, fam.d, fam.l, fam.c, fam.e, fam.n, fam.i] : [];
  requestProbe(s.sprite, colours, () => {
    const cur = getSkin(id);
    if (!cur) return;
    revs.set(id, (revs.get(id) ?? 0) + 1);
    const cat = rosterCats.find((c) => skinIdOf(c.id) === id);
    if (cat) putSkin(buildSkin(cat, bondOf[cat.id] ?? 0, cur.order));
    else {
      const f = featuredCats.find((x) => `${FEATURED_SKIN_PREFIX}${x.catalogId}` === id);
      const fs = f ? buildFeaturedSkin(f) : null;
      if (fs) putSkin(fs);
    }
    for (const l of listeners) l();
  });
}

/**
 * GDD §7.2: locked featured tiles (with a Preview) and showcase bots follow the Meet offer's gates. Web only, never
 * in the first play session; showcase bots also never in the first match. App builds: neither.
 */
export function showcaseGate(o: { isApp: boolean; playSession: number; firstMatch: boolean }): { tiles: boolean; bots: boolean } {
  const tiles = !o.isApp && o.playSession >= 2;
  return { tiles, bots: tiles && !o.firstMatch };
}

/** Owned skins for the carousel: by rung (best first), then bond, then newest. */
export function ownedSkins(): CatSkin[] {
  return rosterCats
    .map((c) => getSkin(skinIdOf(c.id)))
    .filter((s): s is CatSkin => !!s)
    .sort((a, b) => rungIndex(b.rung) - rungIndex(a.rung) || b.bond - a.bond || b.order - a.order);
}

/**
 * Match only: a coat slot within 25° of the OPPOSING team's hue and saturated above 0.45 drops to saturation 0.35,
 * so pink fur on a Woof hero never reads as Purrhaven (and navy never as Woof on a cat). Lobby and portraits keep the
 * true colours.
 */
/** The yellow "this is you" family (RELATION.self 0xffd34d and its neighbours). */
export function isGoldFamily(c: number): boolean {
  const [h, s, l] = hsl(c);
  return h >= 35 && h <= 62 && s > 0.5 && l >= 0.4 && l <= 0.85;
}

/**
 * Match only, another player's hero (a showcase bot): a card skin's element trim or gem never in the gold "you"
 * family (mixed toward white, as the glints) and never within 25° of the opposing team's hue (saturation 0.35, as
 * the fur). The player's own hero and the lobby keep the true element colour.
 */
export function trimForTeam(c: number, team: 0 | 1): number {
  let out = isGoldFamily(c) ? mixHex(c, 0xffffff, 0.7) : c;
  const [th] = hsl(TEAM[team === 0 ? 1 : 0].main);
  const [h, s, l] = hsl(out);
  const d = Math.abs(((h - th + 540) % 360) - 180);
  if (d <= 25 && s > 0.45) out = hslToHex(h, 0.35, l);
  return out;
}

export function clampForTeam(coat: CoatSpec, team: 0 | 1): CoatSpec {
  const [th] = hsl(TEAM[team === 0 ? 1 : 0].main);
  const fix = (c: number | string): number | string => {
    if (typeof c !== 'number') return c;
    const [h, s, l] = hsl(c);
    const d = Math.abs(((h - th + 540) % 360) - 180);
    return d <= 25 && s > 0.45 ? hslToHex(h, 0.35, l) : c;
  };
  const out: CoatSpec = { ...coat, base: fix(coat.base), deep: fix(coat.deep), light: fix(coat.light), cream: fix(coat.cream) };
  if (coat.patch !== undefined) out.patch = fix(coat.patch);
  return out;
}

/** Tests only. */
export function resetRegistry(): void {
  rosterCats = [];
  featuredCats = [];
  bondOf = {};
  revs = new Map();
  putSkins([]);
}
