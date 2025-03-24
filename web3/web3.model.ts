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
      address: "0xa0D4687483F049c53e6EC8cBCbc0332C74180168",
      name: "Camp Mystery Box - Beginner Tier",
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp.jpg",
      faucet: "https://www.campnetwork.xyz/faucet_l1",
    },
    {
      address: "0x0A65888A4F76D821A3148620866BC65A5db599BB",
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
      address: "0x5B1793d4AA54a36ad5F53d20C9ad1eEd8609410C",
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
      address: "0xec735A2Ba32703215b3e40d669C61FBd849b422a",
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
