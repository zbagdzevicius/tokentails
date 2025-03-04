import { EntityType } from "@/models/save";
import { ChainType } from "./contracts";

export enum NftType {
  CAT = "CAT",
}

export interface ITransfer {
  price: number;
  entityType?: EntityType;
  _id?: string;
}

export interface ITransaction {
  transfer: ITransfer;
  address: string;
  hash: `0x${string}`;
  userId: string;
}

export interface IMysteryBox {
  address: string;
  name: string;
  chain: ChainType;
  image: string;
  faucet?: string;
}

export const mysteryBoxes: Partial<
  Record<
    ChainType,
    {
      address: string;
      name: string;
      chain: ChainType;
      image: string;
      faucet?: string;
    }
  >
> = {
  [ChainType.ZETA]: {
    address: "0xd51e3c8c7A547523C3AB31483fBF2833f8f01c30",
    name: "ZetaChain Mystery Box",
    chain: ChainType.ZETA,
    image: "/utilities/mystery-boxes/mystery-box.png",
  },
  [ChainType.CAMP_TEST]: {
    address: "0xd51e3c8c7A547523C3AB31483fBF2833f8f01c30",
    name: "Camp Mystery Box",
    chain: ChainType.CAMP_TEST,
    image: "/utilities/mystery-boxes/mystery-box-camp.jpg",
    faucet: "https://www.campnetwork.xyz/faucet_l1",
  },
};
