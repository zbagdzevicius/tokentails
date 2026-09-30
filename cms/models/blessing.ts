import { ICat } from './cat';
import { CatAbilityType } from './cats';
import { IImage } from './image';
import { IMintedNFTs } from './nft';
import { IProfile } from './profile';

export enum BlessingType {
  CAT = 'CAT',
  SUPPLIES = 'SUPPLIES',
  MEDICAL = 'MEDICAL',
  BILLS = 'BILLS'
}

export enum Status {
    WAITING = 'WAITING',
    RECOVERING = 'RECOVERING',
    ADOPTED = 'ADOPTED',
    HEAVEN = 'HEAVEN',
}

export const Statuses = [
  Status.WAITING,
  Status.RECOVERING,
  Status.ADOPTED,
  Status.HEAVEN,
]

export interface IBlessing {
  _id?: string;
  tokenId?: number;
  status?: Status;
  cat?: ICat;
  name: string;
  description: string;
  image: IImage;
  savior: IImage;
  creator?: IProfile;
  owner?: IProfile;
  token?: IMintedNFTs;
  shelter?: string;
  instagram?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Write payload for POST/PUT /blessing (and the /custom variants): images and
 * the creator are sent as ids, and custom blessings carry the cat props inline.
 */
export type IBlessingInput = Partial<
  Omit<IBlessing, 'image' | 'savior' | 'creator' | 'cat' | 'owner' | 'token'>
> & {
  image?: string;
  savior?: string;
  creator?: string;
  type?: BlessingType | CatAbilityType;
  resqueStory?: string;
  spriteImg?: string;
  catImg?: string;
};

export type ICustomBlessing = Pick<
  IBlessing,
  | '_id'
  | 'name'
  | 'description'
  | 'image'
  | 'shelter'
  | 'instagram'
> &
  Pick<
    ICat,
    'type' | 'resqueStory' | 'spriteImg' | 'catImg'
  >;
