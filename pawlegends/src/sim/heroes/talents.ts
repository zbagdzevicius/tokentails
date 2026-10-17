/**
 * Talents (POC.md §6.1): tiers at levels 3, 6 and 9, two options each; bots take the first. A chosen talent changes
 * ability numbers through its `mods` (merged here once, at module load, for every hero and every combination of
 * choices) or switches on a bespoke hook in the hero's kit (`hasTalent`).
 */
import { HERO_IDS, HEROES } from '../../data/heroes';
import { XP } from '../../data/xp';
import { HUMAN_SLOT } from '../api';
import { idiv, imod } from '../fixed';
import type { MatchHandle } from '../state';
import { G, TALENT_TIERS, type World } from '../world';

export type Nums = Readonly<Record<string, number>>;

/** A hero's effective numbers for one set of talent choices. */
export interface KitNumbers {
  readonly q: Nums;
  readonly w: Nums;
  readonly e: Nums;
  readonly r: Nums;
  readonly passive: Nums;
}

/** Each tier is unchosen, choice 0 or choice 1: combo = Σ (choice + 1) × STATES^tier. */
const STATES = 3;
const COMBOS = STATES * STATES * STATES;

/** Choice (−1, 0, 1) of `tier` in `combo`. */
function digit(combo: number, tier: number): number {
  let c = combo;
  for (let t = 0; t < tier; t++) c = idiv(c, STATES);
  return imod(c, STATES) - 1;
}

function build(): KitNumbers[] {
  const table: KitNumbers[] = [];
  for (let h = 0; h < HERO_IDS.length; h++) {
    const hero = HEROES[HERO_IDS[h]];
    for (let combo = 0; combo < COMBOS; combo++) {
      let q = { ...hero.abilities.q } as Nums;
      let w = { ...hero.abilities.w } as Nums;
      let e = { ...hero.abilities.e } as Nums;
      let r = { ...hero.abilities.r } as Nums;
      let passive = { ...hero.passive } as Nums;
      for (let t = 0; t < TALENT_TIERS; t++) {
        const c = digit(combo, t);
        if (c < 0) continue;
        const mods = hero.talents[t][c].mods;
        if (!mods) continue;
        q = { ...q, ...mods.q };
        w = { ...w, ...mods.w };
        e = { ...e, ...mods.e };
        r = { ...r, ...mods.r };
        passive = { ...passive, ...mods.passive };
      }
      table.push(Object.freeze({ q, w, e, r, passive }));
    }
  }
  return table;
}

const TABLE: readonly KitNumbers[] = build();

/** Effective numbers of hero `id` with its chosen talents. */
export function abil(w: World, id: number): KitNumbers {
  let combo = 0;
  let scale = 1;
  const base = id * TALENT_TIERS;
  for (let t = 0; t < TALENT_TIERS; t++) {
    combo += (w.talents[base + t] + 1) * scale;
    scale *= STATES;
  }
  return TABLE[w.sub[id] * COMBOS + combo];
}

/** Numbers of hero `heroIndex` (HERO_IDS order) with no talents (tests, tools). */
export const baseNumbers = (heroIndex: number): KitNumbers => TABLE[heroIndex * COMBOS];

/** Does hero `id` have talent `talentId` (a bespoke hook)? */
export function hasTalent(w: World, id: number, talentId: string): boolean {
  const tiers = HEROES[HERO_IDS[w.sub[id]]].talents;
  for (let t = 0; t < TALENT_TIERS; t++) {
    const c = w.talents[id * TALENT_TIERS + t];
    if (c >= 0 && tiers[t][c].id === talentId) return true;
  }
  return false;
}

/** Highest tier `id` may pick at its level (−1 none). */
export function unlockedTiers(w: World, id: number): number {
  let n = 0;
  while (n < XP.talentLevels.length && w.level[id] >= XP.talentLevels[n]) n++;
  return n;
}

/** Pick `choice` in `tier` (Talent command). Refused when the tier is locked or already chosen. */
export function chooseTalent(m: MatchHandle, id: number, tier: number, choice: number): boolean {
  const w = m.world;
  if (tier < 0 || tier >= TALENT_TIERS || choice < 0 || choice > 1) return false;
  if (tier >= unlockedTiers(w, id) || w.talents[id * TALENT_TIERS + tier] >= 0) return false;
  w.talents[id * TALENT_TIERS + tier] = choice;
  return true;
}

/** A talent tier just unlocked at `id`'s new level: offer it; bots take the first option at once. */
export function offerTalent(m: MatchHandle, id: number, tier: number): void {
  const w = m.world;
  m.events.push({ type: 'talentOffer', tick: w.globals[G.Tick], slot: id, tier: tier as 0 | 1 | 2 });
  if (id !== HUMAN_SLOT) chooseTalent(m, id, tier, 0);
}
