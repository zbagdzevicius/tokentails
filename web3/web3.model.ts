import { cdnFile } from "@/constants/utils";
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

export enum MysteryBoxRequirementType {
  APP_DOWNLOAD = "APP_DOWNLOAD",
  TAILS = "TAILS",
  PURCHASE = "PURCHASE",
  CATNIP = "CATNIP",
  STREAK = "STREAK",
  CHAPTER = "CHAPTER",
  TITLES = "TITLES",
}

export interface IMysteryBox {
  address: string;
  name: string;
  key: string;
  chain: ChainType;
  image: string;
  faucet?: string;
  requirements?: {
    type?: MysteryBoxRequirementType;
    metadata?: any;
    text?: string;
  };
}

export enum MYSTERY_BOX_TYPE {
  CATNIP_CHAOS_1 = "CATNIP_CHAOS_1",
  CATNIP_CHAOS_2 = "CATNIP_CHAOS_2",
  CATNIP_CHAOS_3 = "CATNIP_CHAOS_3",
  CATNIP_CHAOS_4 = "CATNIP_CHAOS_4",
  CATNIP_CHAOS_5 = "CATNIP_CHAOS_5",
  CATNIP_CHAOS_6 = "CATNIP_CHAOS_6",
  CATNIP_CHAOS_7 = "CATNIP_CHAOS_7",
  CATNIP_CHAOS_8 = "CATNIP_CHAOS_8",
  CATNIP_CHAOS_9 = "CATNIP_CHAOS_9",
  CATNIP_CHAOS_10 = "CATNIP_CHAOS_10",
  CATNIP_CHAOS_11 = "CATNIP_CHAOS_11",
  CATNIP_CHAOS_12 = "CATNIP_CHAOS_12",
  CATNIP_CHAOS_13 = "CATNIP_CHAOS_13",
  CATNIP_CHAOS_14 = "CATNIP_CHAOS_14",
  CATNIP_CHAOS_15 = "CATNIP_CHAOS_15",
  CATNIP_CHAOS_16 = "CATNIP_CHAOS_16",
  CATNIP_CHAOS_17 = "CATNIP_CHAOS_17",
  CATNIP_CHAOS_18 = "CATNIP_CHAOS_18",
  CATNIP_CHAOS_19 = "CATNIP_CHAOS_19",
  CATNIP_CHAOS_20 = "CATNIP_CHAOS_20",
}

export const chaptersBadges: IMysteryBox[] = [
  {
    address: "0x40a41BA829F36edaD073Ae768bE4DC29F14CDD25",
    name: "Chapter 1 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_1,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter1.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 1st chapter of Catnip Chaos",
    },
  },
  {
    address: "0xe7246BdB86e0abEeFA83ce81d967709ce1cDdd25",
    name: "Chapter 2 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_2,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter2.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 2nd chapter of Catnip Chaos",
    },
  },
  {
    address: "0xa518F2f416b90250e0CC46FbD9920a0EC7940bA0",
    name: "Chapter 3 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_3,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter3.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 3rd chapter of Catnip Chaos",
    },
  },
  {
    address: "0x92B355908a597Aac295aee96131DD88Fe220E6E3",
    name: "Chapter 4 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_4,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter4.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 4th chapter",
    },
  },
  {
    address: "0xb2b912D64B154Ac73C5bf5564a21F5852025A4B2",
    name: "Chapter 5 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_5,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter5.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 5th chapter",
    },
  },
  {
    address: "0x2e9F67A2Ca352e2672491a9c75dB7769B83bbef0",
    name: "Chapter 6 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_6,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter6.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 6th chapter",
    },
  },
  {
    address: "0x413E1D2C1df418544b615ee2716e386D736eeA73",
    name: "Chapter 7 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_7,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter7.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 7th chapter",
    },
  },
  {
    address: "0x5399A2BB42B9D7e04599b6c26deFc76A568e3C29",
    name: "Chapter 8 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_8,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter8.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 8th chapter",
    },
  },
  {
    address: "0xEBd5f0EFAd954096a4442C13293337af0B5B9D79",
    name: "Chapter 9 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_9,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter9.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 9th chapter",
    },
  },
  {
    address: "0xc7f42A7c096734c551c06cBa51Ff972425AE405f",
    name: "Chapter 10 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_10,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter10.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 10th chapter",
    },
  },
  {
    address: "0xc7f42A7c096734c551c06cBa51Ff972425AE405f",
    name: "Chapter 11 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_11,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter11.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 11th chapter",
    },
  },
  {
    address: "0xc7f42A7c096734c551c06cBa51Ff972425AE405f",
    name: "Chapter 12 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_12,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter12.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 12th chapter",
    },
  },
  {
    address: "0xc7f42A7c096734c551c06cBa51Ff972425AE405f",
    name: "Chapter 13 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_13,
    chain: ChainType.SEI,
    image: cdnFile("catnip-chaos/badges/chapter13.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 13th chapter",
    },
  },
];
