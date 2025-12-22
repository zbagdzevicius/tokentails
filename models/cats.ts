import { IImage } from "./image";
import { IStatusValue, StatusType } from "./status";

export const Prices = {
  generatedCat: 5,
  lootBox: 3,
};

export enum BlessingStatus {
  WAITING = "WAITING",
  RECOVERING = "RECOVERING",
  ADOPTED = "ADOPTED",
  HEAVEN = "HEAVEN",
}

export type IBlessing = {
  _id: string;
  name: string;
  description: string;
  image: IImage;
  images: IImage[];
  birthDate: string;
  price: number;
  instagram?: string;
  creator: string;
  cat: string;
  shelter?: string | IShelter;
  owner: string;
  status?: BlessingStatus;
  savior?: IImage;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
};

export type IShelter = {
  _id: string;
  name: string;
  image?: IImage;
  description?: string;
  // USE COUNTRY SHORTCODE and FIND AN IMAGE TO EMBED INTO CARDS, e.g. LT, US, UK, DE, FR, ES, IT, CH, CA, AU, NZ
  country?: string;
  slug: string;
  address?: string;
  website?: string;
  facebook?: string;
  tiktok?: string;
  instagram?: string;
};

export enum CatAbilityType {
  ICE = "ICE",

  ELECTRIC = "ELECTRIC",
  FIRE = "FIRE",
  WIND = "WIND",
  DARK = "DARK",
  WATER = "WATER",
  AIR = "AIR",
  GRASS = "GRASS",
  SAND = "SAND",
  FAIRY = "FAIRY",
  STELLAR = "STELLAR",
}

export type ICatStatus = Partial<Record<StatusType, IStatusValue>>;

export enum Tier {
  COMMON = "COMMON",
  RARE = "RARE",
  EPIC = "EPIC",
  LEGENDARY = "LEGENDARY",
}

export interface ICat {
  _id?: string;
  name: string;
  type: CatAbilityType;
  owner: string;
  resqueStory: string;
  status: ICatStatus;
  supply: number;
  origin: string;
  totalSupply: number;
  staked?: Date | null;
  spriteImg: string;
  catImg: string;
  expiresAt?: string;
  blessings?: IBlessing[];
  shelter?: string | IShelter;
  tier: Tier;
  tokenId?: number;
  token?: {
    sei: string | null;
  };
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
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
