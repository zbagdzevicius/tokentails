import { ICat } from './cat';
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
