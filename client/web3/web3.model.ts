import { cdnFile } from "@/constants/utils";
import { EntityType } from "@/models/save";

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
  name: string;
  key: string;
  image: string;
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
    name: "Chapter 1 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_1,
    image: cdnFile("catnip-chaos/badges/chapter1.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 1st chapter of Catnip Chaos",
    },
  },
  {
    name: "Chapter 2 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_2,
    image: cdnFile("catnip-chaos/badges/chapter2.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 2nd chapter of Catnip Chaos",
    },
  },
  {
    name: "Chapter 3 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_3,
    image: cdnFile("catnip-chaos/badges/chapter3.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 3rd chapter of Catnip Chaos",
    },
  },
  {
    name: "Chapter 4 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_4,
    image: cdnFile("catnip-chaos/badges/chapter4.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 4th chapter",
    },
  },
  {
    name: "Chapter 5 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_5,
    image: cdnFile("catnip-chaos/badges/chapter5.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 5th chapter",
    },
  },
  {
    name: "Chapter 6 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_6,
    image: cdnFile("catnip-chaos/badges/chapter6.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 6th chapter",
    },
  },
  {
    name: "Chapter 7 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_7,
    image: cdnFile("catnip-chaos/badges/chapter7.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 7th chapter",
    },
  },
  {
    name: "Chapter 8 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_8,
    image: cdnFile("catnip-chaos/badges/chapter8.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 8th chapter",
    },
  },
  {
    name: "Chapter 9 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_9,
    image: cdnFile("catnip-chaos/badges/chapter9.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 9th chapter",
    },
  },
  {
    name: "Chapter 10 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_10,
    image: cdnFile("catnip-chaos/badges/chapter10.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 10th chapter",
    },
  },
  {
    name: "Chapter 11 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_11,
    image: cdnFile("catnip-chaos/badges/chapter11.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 11th chapter",
    },
  },
  {
    name: "Chapter 12 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_12,
    image: cdnFile("catnip-chaos/badges/chapter12.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 12th chapter",
    },
  },
  {
    name: "Chapter 13 Badge",
    key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_13,
    image: cdnFile("catnip-chaos/badges/chapter13.webp"),
    requirements: {
      type: MysteryBoxRequirementType.CHAPTER,
      text: "Complete 13th chapter",
    },
  },
];
