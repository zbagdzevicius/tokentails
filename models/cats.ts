import { IImage } from "./image";
import { IStatusValue, StatusType } from "./status";

export const Prices = {
  generatedCat: 5,
  lootBox: 3,
};

export enum BlessingStatus {
    WAITING = 'WAITING',
    RECOVERING = 'RECOVERING',
    ADOPTED = 'ADOPTED',
    HEAVEN = 'HEAVEN',
}

export type IBlessing = {
  status: BlessingStatus;
  _id: string;
  name: string;
  description: string;
  image: IImage;
  savior?: IImage;
  birthDate: Date;
  instagram?: string;
};

export type IShelter = {
  _id: string;
  name: string;
  image?: IImage;
  description?: string;
  slug: string;
  address?: string;
  website?: string;
  facebook?: string;
  tiktok?: string;
  instagram?: string;
};

export enum CatAbilityType {
  ELECTRIC = "ELECTRIC",
  STORM = "STORM",
  FIRE = "FIRE",
  WIND = "WIND",
  DARK = "DARK",
  WATER = "WATER",
  AIR = "AIR",
  EARTH = "EARTH",
  ICE = "ICE",
  NATURE = "NATURE",
  SAND = "SAND",
  TAILS = "TAILS",
  LEGENDARY = "LEGENDARY",
  CAMP = "CAMP",
}

export const names = [
  "Peanut",
  "Snowball",
  "Pinkie",
  "Cookie",
  "Pickle",
  "Rainbow",
  "Bagel",
];

export const resqueStory = (name: string) => {
  const stories = {
    [names[0]]: `Found wandering near an ancient temple, ${name} now uses its mystical powers to help lost and scared kittens find their way.`,
    [names[1]]: `Once caught in a fierce storm, ${name} now harnesses the power of thunder to protect its companions from danger.`,
    [names[2]]: `Found in a cold, abandoned building, ${name}'s fiery spirit helped her survive and now inspires resilience in others.`,
    [names[3]]: `Once a shy, elusive shadow, ${name} now uses its speed to deliver messages and help between shelters.`,
    [names[4]]: `Emerging from the shadows of the streets, ${name} now uses its stealth to protect the shelter from threats unseen.`,
    [names[5]]: `Once adrift and alone, ${name} now soothes troubled spirits with its serene presence.`,
    [names[6]]: `Once left, ${name} now dreams to find a loving owner.`,
  };

  return stories[name];
};

export type ICatStatus = Partial<Record<StatusType, IStatusValue>>;

export enum CatAIStatus {
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
}

export interface ICat {
  _id?: string;
  name: string;
  type: CatAbilityType;
  owner: string;
  resqueStory: string;
  status: ICatStatus;
  supply: number;
  totalSupply: number;
  staked: Date | null;
  spriteImg: string;
  catImg: string;
  expiresAt?: string;
  blessing: IBlessing;
  shelter?: any;
}

export const cardsColor: Record<CatAbilityType, string> = {
  [CatAbilityType.AIR]: "#c3dacd",
  [CatAbilityType.DARK]: "#e7d6e4",
  [CatAbilityType.EARTH]: "#f28282",
  [CatAbilityType.ELECTRIC]: "#fdf599",
  [CatAbilityType.FIRE]: "#ff7f7f",
  [CatAbilityType.ICE]: "#d4e7f4",
  [CatAbilityType.LEGENDARY]: "#f2ab5c",
  [CatAbilityType.NATURE]: "#a0ca93",
  [CatAbilityType.SAND]: "#f5f0c5",
  [CatAbilityType.STORM]: "#e7eae9",
  [CatAbilityType.TAILS]: "#f3aea4",
  [CatAbilityType.WATER]: "#9fe1fb",
  [CatAbilityType.WIND]: "#f6c7ba",
  [CatAbilityType.CAMP]: "#ff6d01",
};
