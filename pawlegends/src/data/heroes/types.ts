/** Shared shape of hero data (POC.md §6). Integer units: mm, mm/s, ticks, bp, angle steps (1/4096 turn). */
export type HeroId = 'clem' | 'sage' | 'brutus' | 'cacklejaw';
export type HeroSide = 'cat' | 'dog';
export type HeroRole = 'fighter' | 'marksman' | 'tank' | 'assassin';
export type Element = 'FAIRY' | 'WIND' | 'SAND' | 'DARK';
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
  base: HeroBase;
  passive: Readonly<Record<string, number>>;
  abilities: Readonly<Record<AbilitySlot, AbilityData>>;
  /** Three tiers (levels 3, 6, 9) of two options each; bots take the first. */
  talents: readonly (readonly TalentData[])[];
}
