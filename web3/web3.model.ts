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

export enum MysteryBoxRequirementType {
  APP_DOWNLOAD = "APP_DOWNLOAD",
  COINS = "COINS",
  PURCHASE = "PURCHASE",
}

export interface IMysteryBox {
  address: string;
  name: string;
  chain: ChainType;
  image: string;
  faucet?: string;
  requirements?: {
    type: MysteryBoxRequirementType;
    metadata?: any;
    text?: string;
  };
}

export const mysteryBoxes: Partial<Record<ChainType, IMysteryBox[]>> = {
  [ChainType.CAMP_TEST]: [
    {
      address: "0xd51e3c8c7A547523C3AB31483fBF2833f8f01c30",
      name: "Camp Mystery Box - Beginner Tier",
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp.jpg",
      faucet: "https://www.campnetwork.xyz/faucet_l1",
    },
    {
      address: "0x088C74D5cae0A3C08A34B1AEF87c6B0BA2F88A84",
      name: "Camp Mystery Box - Explorer Tier",
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp2.jpg",
      faucet: "https://www.campnetwork.xyz/faucet_l1",
      requirements: {
        type: MysteryBoxRequirementType.COINS,
        metadata: {
          catpoints: 50000,
        },
        text: "Collect 50k coins",
      },
    },
    {
      address: "0x701e95Af733116F119E227Fc96dd84B88619490f",
      name: "Camp Mystery Box - Cat Lover Tier",
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp3.jpg",
      faucet: "https://www.campnetwork.xyz/faucet_l1",
      requirements: {
        type: MysteryBoxRequirementType.APP_DOWNLOAD,
        text: "Coming Soon !",
      },
    },
    {
      address: "0x4e4AB24f37CFAdB06C5a2e00e8f1D3dE3c8A3408",
      name: "Camp Mystery Box - Cat Savior Tier",
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp4.jpg",
      faucet: "https://www.campnetwork.xyz/faucet_l1",
      requirements: {
        type: MysteryBoxRequirementType.PURCHASE,
        text: "Save a cat",
      },
    },
  ],
};
