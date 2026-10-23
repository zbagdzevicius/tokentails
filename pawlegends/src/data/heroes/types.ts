/** Shared shape of hero data (POC.md §6). Integer units: mm, mm/s, ticks, bp, angle steps (1/4096 turn). */
/** HERO_IDS order is the sim index; the four shelter champions (sim v9) are appended so 0..3 keep their values. */
export type HeroId = 'clem' | 'sage' | 'brutus' | 'cacklejaw' | 'lambo' | 'aviete' | 'bengas' | 'gabe';
export type HeroSide = 'cat' | 'dog';
export type HeroRole = 'fighter' | 'marksman' | 'tank' | 'assassin' | 'mage' | 'support';
export type Element = 'FAIRY' | 'WIND' | 'SAND' | 'DARK' | 'STELLAR' | 'ELECTRIC' | 'FIRE';
export type AbilitySlot = 'q' | 'w' | 'e' | 'r';

export interface HeroBase {
  hp: number;
  hpPerLevel: number;
  attack: number;
  attackPerLevel: number;
  /** Ticks between basic attacks. */
  attackEvery: number;
  range: number;
  speed: number;
  armour: number;
  armourPerLevel: number;
  /** Wave C (C1): overrides of the role's level growth (data/heroes/growth.ts ROLE_GROWTH). */
  attackSpeedPerLevelBp?: number;
  speedPerLevel?: number;
}

/** Ability numbers. Fields an ability does not use are absent; the kit code in src/sim/heroes reads them by name. */
export type AbilityData = Readonly<Record<string, number | undefined>> & { readonly cooldown: number };

export interface TalentData {
  id: string;
  name: string;
  /** Changed numbers, by ability slot ('passive' too). Absent = no number change (a bespoke hook in the kit). */
  mods?: Readonly<Partial<Record<AbilitySlot | 'passive', Readonly<Record<string, number>>>>>;
}

export interface HeroData {
  id: HeroId;
  name: string;
  side: HeroSide;
  role: HeroRole;
  element: Element;
  /**
   * Hero-vs-hero damage tuning per hero (sim v8, playtest round 2: "balance is a hidden species stat edge"; it
   * replaced data/heroes SIDE_EDGE with the same numbers): this hero's damage to enemy heroes × dmgBp, enemy heroes'
   * damage to it × takenBp. Only where DifficultyRules.sideEdge is on (Normal and Hard; the sim's G.SideEdge flag).
   */
  pvp: Readonly<{ dmgBp: number; takenBp: number }>;
  base: HeroBase;
  passive: Readonly<Record<string, number>>;
  abilities: Readonly<Record<AbilitySlot, AbilityData>>;
  /**
   * Wave C (C2): what each rank above 1 adds to an ability's numbers (a delta, applied once per rank; negative
   * cooldowns are cuts). Ranks come with levels (growth.ts RANK_LEVELS) and merge before the talents, so a talent that
   * sets a number replaces the ranked one. Only numbers the ability already has may be ranked.
   */
  ranks: Readonly<Partial<Record<AbilitySlot, Readonly<Record<string, number>>>>>;
  /** Three tiers (levels 3, 6, 9) of two options each; bots choose by seed (sim v10, `botTalentChoice`). */
  talents: readonly (readonly TalentData[])[];
}
