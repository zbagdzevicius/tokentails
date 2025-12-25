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

export const BlessingStatusTexts: Record<BlessingStatus, string> = {
  [BlessingStatus.WAITING]: "Waiting for home",
  [BlessingStatus.RECOVERING]: "Recovering",
  [BlessingStatus.ADOPTED]: "Adopted",
  [BlessingStatus.HEAVEN]: "Heaven",
};

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
  catAvatar: string;
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
  blessing: IBlessing;
  shelter?: IShelter;
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
  [CatAbilityType.DARK]: "#e7d6e4",
  [CatAbilityType.ELECTRIC]: "#fdf599",
  [CatAbilityType.FIRE]: "#ff7f7f",
  [CatAbilityType.ICE]: "#d4e7f4",
  [CatAbilityType.SAND]: "#f5f0c5",
  [CatAbilityType.WATER]: "#9fe1fb",
  [CatAbilityType.WIND]: "#f6c7ba",
};

export const cardsBorderColor: Record<CatAbilityType, string> = {
  [CatAbilityType.DARK]: "#A9A9A9",
  [CatAbilityType.ELECTRIC]: "#FFF9B8",
  [CatAbilityType.FIRE]: "#FFDBF1",
  [CatAbilityType.ICE]: "#d4e7f4",
  [CatAbilityType.SAND]: "#FCDDC3",
  [CatAbilityType.WATER]: "#80C5FF",
  [CatAbilityType.WIND]: "#FFFFFF",
  [CatAbilityType.AIR]: "#FFFFFF",
  [CatAbilityType.GRASS]: "#B3E7DB",
  [CatAbilityType.STELLAR]: "#C5BDFF",
  [CatAbilityType.FAIRY]: "#FFFFFF",
};

export const cardsBodyColor: Record<CatAbilityType, string> = {
  [CatAbilityType.DARK]: "#A9A9A9",
  [CatAbilityType.ELECTRIC]: "#FFF9B8",
  [CatAbilityType.FIRE]: "#FFDBF1",
  [CatAbilityType.ICE]: "#d4e7f4",
  [CatAbilityType.SAND]: "#FCDDC3",
  [CatAbilityType.WATER]: "#80C5FF",
  [CatAbilityType.WIND]: "#FFFFFF",
  [CatAbilityType.AIR]: "#FFFFFF",
  [CatAbilityType.GRASS]: "#B3E7DB",
  [CatAbilityType.STELLAR]: "#C5BDFF",
  [CatAbilityType.FAIRY]: "#FF6FC6",
};

export const cardsBackground: Record<CatAbilityType, string> = {
  [CatAbilityType.DARK]: "/cards/backgrounds/dark.webp",
  [CatAbilityType.ELECTRIC]: "/cards/backgrounds/electric.webp",
  [CatAbilityType.FIRE]: "/cards/backgrounds/fire.webp",
  [CatAbilityType.ICE]: "/cards/backgrounds/ice.webp",
  [CatAbilityType.SAND]: "/cards/backgrounds/sand.webp",
  [CatAbilityType.WATER]: "/cards/backgrounds/water.webp",
  [CatAbilityType.WIND]: "/cards/backgrounds/wind.webp",
  [CatAbilityType.AIR]: "/cards/backgrounds/wind.webp",
  [CatAbilityType.GRASS]: "/cards/backgrounds/grass.webp",
  [CatAbilityType.FAIRY]: "/cards/backgrounds/fairy.webp",
  [CatAbilityType.STELLAR]: "/cards/backgrounds/stellar.webp",
};

export const cardsGradient: Record<CatAbilityType, string> = {
  [CatAbilityType.FIRE]:
    "radial-gradient(circle at 60% 30%, #FFDBF1 0%, #FF6F71 100%)",
  [CatAbilityType.SAND]:
    "radial-gradient(circle at 60% 30%, #FCDDC3 0%, #F9BA88 100%)",
  [CatAbilityType.ELECTRIC]:
    "radial-gradient(circle at 60% 30%, #FFF9B8 0%, #FFF371 100%)",
  [CatAbilityType.GRASS]:
    "radial-gradient(circle at 60% 30%, #B3E7DB 0%, #68D0B6 100%)",
  [CatAbilityType.WATER]:
    "radial-gradient(circle at 60% 30%, #B3E7DB 0%, #B3E7DB 100%)",
  [CatAbilityType.STELLAR]:
    "radial-gradient(circle at 60% 30%, #C5BDFF 0%, #8B7CFF 100%)",
  [CatAbilityType.DARK]:
    "radial-gradient(circle at 60% 30%, #A9A9A9 0%, #545454 100%)",
  [CatAbilityType.WIND]:
    "radial-gradient(circle at 60% 30%, #FFFFFF 0%, #D2D2D2 100%)",
  [CatAbilityType.AIR]:
    "radial-gradient(circle at 60% 30%, #FFFFFF 0%, #D2D2D2 100%)",
  [CatAbilityType.ICE]:
    "radial-gradient(circle at 60% 30%, #d4e7f4 0%, #a0d1f0 100%)",
  [CatAbilityType.FAIRY]:
    "linear-gradient(135deg, #FF6FC6 0%, #F9BA88 20%, #FFE371 40%, #68D0B6 60%, #008CFF 80%, #8B7CFF 100%)",
};

export const cardsIcon: Record<CatAbilityType, string> = {
  [CatAbilityType.DARK]: "/cards/icons/dark.webp",
  [CatAbilityType.ELECTRIC]: "/cards/icons/electric.webp",
  [CatAbilityType.FIRE]: "/cards/icons/fire.webp",
  [CatAbilityType.ICE]: "/cards/icons/ice.webp",
  [CatAbilityType.SAND]: "/cards/icons/sand.webp",
  [CatAbilityType.WATER]: "/cards/icons/water.webp",
  [CatAbilityType.WIND]: "/cards/icons/wind.webp",
  [CatAbilityType.AIR]: "/cards/icons/air.webp",
  [CatAbilityType.GRASS]: "/cards/icons/grass.webp",
  [CatAbilityType.STELLAR]: "/cards/icons/stellar.webp",
  [CatAbilityType.FAIRY]: "/cards/icons/fairy.webp",
};
