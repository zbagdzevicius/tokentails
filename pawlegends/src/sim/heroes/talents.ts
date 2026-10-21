/**
 * Talents (POC.md §6.1): tiers at levels 3, 6 and 9, two options each. Sim v10 (GAPS B0): bots pick 0 or 1 from their
 * own seeded stream (`botTalentChoice`), so both options are played; before v10 they took the first. A chosen talent changes
 * ability numbers through its `mods` (merged here once, at module load, for every hero and every combination of
 * choices) or switches on a bespoke hook in the hero's kit (`hasTalent`).
 *
 * Wave C (C2): ability ranks come with levels (data/heroes RANK_LEVELS), the same for every hero and every bot. Each
 * rank above 1 adds the hero's `ranks` deltas to the base numbers; the talents' `mods` merge after them, so a talent
 * that sets a number wins over the ranked one. The table is per hero, per level and per talent combination.
 */
import { HERO_IDS, HEROES, RANK_KEYS, RANK_LEVELS, type AbilitySlot } from '../../data/heroes';
import { XP } from '../../data/xp';
import { HUMAN_SLOT, type BotTalentMode } from '../api';
import { idiv, imod } from '../fixed';
import { Rng } from '../rng';
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

const SLOTS: readonly AbilitySlot[] = ['q', 'w', 'e', 'r'];
const LEVELS = XP.maxLevel;

/** Rank (1 up) of ability `slot` at `level`; 0 = not learned yet (R before level 4). Pure: the HUD reads it too. */
export function abilityRank(level: number, slot: number): number {
  const steps = slot === 3 ? RANK_LEVELS.ultimate : RANK_LEVELS.basic;
  let n = 0;
  while (n < steps.length && level >= steps[n]) n++;
  return n;
}

/** Highest rank of ability `slot`. */
export const maxRank = (slot: number): number => (slot === 3 ? RANK_LEVELS.ultimate : RANK_LEVELS.basic).length;

/** `nums` with `delta` added (rank − 1) times; only RANK_KEYS numbers the ability has. */
function ranked(nums: Nums, delta: Nums | undefined, rank: number): Nums {
  if (!delta || rank <= 1) return nums;
  const out: Record<string, number> = { ...nums };
  for (let i = 0; i < RANK_KEYS.length; i++) {
    const k = RANK_KEYS[i];
    const d = delta[k];
    if (d !== undefined && out[k] !== undefined) out[k] = out[k] + d * (rank - 1);
  }
  return out;
}

function build(): KitNumbers[] {
  const table: KitNumbers[] = [];
  for (let h = 0; h < HERO_IDS.length; h++) {
    const hero = HEROES[HERO_IDS[h]];
    for (let level = 1; level <= LEVELS; level++) {
      const at: Nums[] = [];
      for (let s = 0; s < SLOTS.length; s++) {
        at.push(ranked(hero.abilities[SLOTS[s]] as Nums, hero.ranks[SLOTS[s]], Math.max(1, abilityRank(level, s))));
      }
      for (let combo = 0; combo < COMBOS; combo++) {
        let q = { ...at[0] } as Nums;
        let w = { ...at[1] } as Nums;
        let e = { ...at[2] } as Nums;
        let r = { ...at[3] } as Nums;
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
  const level = Math.min(LEVELS, Math.max(1, w.level[id]));
  return TABLE[(w.sub[id] * LEVELS + level - 1) * COMBOS + combo];
}

/** Numbers of hero `heroIndex` (HERO_IDS order) at level 1 with no talents (tests, tools). */
export const baseNumbers = (heroIndex: number): KitNumbers => TABLE[heroIndex * LEVELS * COMBOS];

/**
 * Numbers of hero `heroIndex` at `level` with talent `choices` (per tier −1 none, 0 or 1): what the HUD tooltips and
 * the talent screen show, from the same table the sim reads.
 */
export function kitNumbers(heroIndex: number, level: number, choices: readonly number[] = []): KitNumbers {
  let combo = 0;
  let scale = 1;
  for (let t = 0; t < TALENT_TIERS; t++) {
    const c = choices[t] ?? -1;
    combo += (c < 0 ? 0 : c > 1 ? 2 : c + 1) * scale;
    scale *= STATES;
  }
  const lv = Math.min(LEVELS, Math.max(1, level));
  return TABLE[(heroIndex * LEVELS + lv - 1) * COMBOS + combo];
}

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

/**
 * Sim v10 (GAPS B0): a bot's choice in `tier`. 'seeded' (every real match and replay): draw number `tier` of the slot's
 * own stream `fork('talent:' + slot)`, which depends on the seed alone, so no other draw moves. 'first' is the
 * pre-v10 rule (option 0); 'branch' takes option 1 at tier 1 (level 6, where GAPS B6 puts the shape branches) and the
 * seeded choice elsewhere. The two test modes exist for headless runs only (`MatchConfig.botTalents`).
 */
export function botTalentChoice(seed: number, slot: number, tier: number, mode: BotTalentMode = 'seeded'): 0 | 1 {
  if (mode === 'first') return 0;
  if (mode === 'branch' && tier === 1) return 1;
  const rng = new Rng(seed >>> 0).fork('talent:' + slot);
  let choice = 0;
  for (let t = 0; t <= tier; t++) choice = rng.int(2);
  return choice === 0 ? 0 : 1;
}

/** The talent mode of this match's bots (the in-sim bots and the headless player-bot). */
export const botTalentMode = (m: MatchHandle): BotTalentMode => m.config.botTalents ?? 'seeded';

/** A talent tier just unlocked at `id`'s new level: offer it; bots choose at once (`botTalentChoice`). */
export function offerTalent(m: MatchHandle, id: number, tier: number): void {
  const w = m.world;
  m.events.push({ type: 'talentOffer', tick: w.globals[G.Tick], slot: id, tier: tier as 0 | 1 | 2 });
  if (id !== HUMAN_SLOT) chooseTalent(m, id, tier, botTalentChoice(m.config.seed, id, tier, botTalentMode(m)));
}
