import { IBlessing } from './blessing';
import { CatAbilityType } from './cats';
import { IMintedNFTs } from './nft';

export const catAbilityTypes = Object.values(CatAbilityType);

export interface ICat {
  name: string;
  _id: string;
  createdAt?: string;
  updatedAt?: string;
  blessings: IBlessing[];
  isBlueprint: boolean;
  owner?: string;
  type: CatAbilityType;
  resqueStory: string;
  token?: Partial<IMintedNFTs>;
  spriteImg: string;
  catImg: string;
  cardImg: string;
}

export const cardsColor: Record<CatAbilityType, string> = {
  [CatAbilityType.WIND]: '#c3dacd',
  [CatAbilityType.DARK]: '#e7d6e4',
  [CatAbilityType.GRASS]: '#f28282',
  [CatAbilityType.ELECTRIC]: '#fdf599',
  [CatAbilityType.FIRE]: '#ff7f7f',
  [CatAbilityType.ICE]: '#d4e7f4',
  [CatAbilityType.SAND]: '#f5f0c5',
  [CatAbilityType.STELLAR]: '#f3aea4',
  [CatAbilityType.WATER]: '#9fe1fb',
  [CatAbilityType.FAIRY]: '#f6c7ba'
};
