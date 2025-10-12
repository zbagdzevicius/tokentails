import { EntityType } from "@/models/save";
import { ChainType } from "./contracts";
import { cdnFile } from "@/constants/utils";

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

export const chainTypeRpcUrl: Record<ChainType, string> = {
  [ChainType.BNB]: "https://bsc-dataseed.binance.org",
  [ChainType.BNB_TEST]: "https://data-seed-prebsc-1-s1.binance.org:8545",
  [ChainType.STELLAR]: "https://mainnet.sorobanrpc.com",
  [ChainType.STELLAR_TEST]: "https://soroban-testnet.stellar.org:443",
  [ChainType.SOLANA]: "https://api.mainnet-beta.solana.com",
  [ChainType.SOLANA_TEST]: "https://api.devnet.solana.com",
  [ChainType.CAMP]: "https://rpc.camp.network",
  [ChainType.SEI]: "https://evm-rpc.sei-apis.com",
};

export enum MYSTERY_BOX_TYPE {
  CAMP_6 = "CAMP_6",
  CAMP_7 = "CAMP_7",
  CAMP_8 = "CAMP_8",
  CAMP_9 = "CAMP_9",
  CATNIP_CHAOS_1 = "CATNIP_CHAOS_1",
  CATNIP_CHAOS_2 = "CATNIP_CHAOS_2",
  CATNIP_CHAOS_3 = "CATNIP_CHAOS_3",
  CATNIP_CHAOS_4 = "CATNIP_CHAOS_4",
  CATNIP_CHAOS_5 = "CATNIP_CHAOS_5",
  CATNIP_CHAOS_6 = "CATNIP_CHAOS_6",
  CATNIP_CHAOS_7 = "CATNIP_CHAOS_7",
}

export const mysteryBoxes: Partial<Record<ChainType, IMysteryBox[]>> = {
  [ChainType.CAMP]: [
    {
      address: "0xaE09454FA54F84E2eDAa43FA3A29d762335bBc73",
      name: "Campt Mystery Box - Cats Fan",
      key: MYSTERY_BOX_TYPE.CAMP_6,
      chain: ChainType.CAMP,
      image: cdnFile("utilities/mystery-boxes/mystery-box-camp6.jpg"),
      requirements: {
        type: MysteryBoxRequirementType.TITLES,
        metadata: {
          titles: 1,
        },
        text: "Complete the Codex",
      },
    },
    {
      address: "0x4F83314E4752E7f732210D043B218B269989a181",
      name: "Campt Mystery Box - Cats Fan",
      key: MYSTERY_BOX_TYPE.CAMP_7,
      chain: ChainType.CAMP,
      image: cdnFile("utilities/mystery-boxes/mystery-box-camp7.jpg"),
      requirements: {
        type: MysteryBoxRequirementType.CATNIP,
        metadata: {
          catnip: 120,
        },
        text: "Collect 120 catnip",
      },
    },
    {
      address: "0x650048c5A9b864Fd24b61680030FDEDbdaf39304",
      name: "Campt Mystery Box - Cats Fan",
      key: MYSTERY_BOX_TYPE.CAMP_8,
      chain: ChainType.CAMP,
      image: cdnFile("utilities/mystery-boxes/mystery-box-camp8.jpg"),
      requirements: {
        type: MysteryBoxRequirementType.STREAK,
        metadata: {
          streak: 20,
        },
        text: "Check-in 20 times",
      },
    },
    {
      address: "0xcCDF4C5EE94CCB06640545b7D7088A19870C0e4F",
      name: "Campt Mystery Box - Cats Fan",
      key: MYSTERY_BOX_TYPE.CAMP_9,
      chain: ChainType.CAMP,
      image: cdnFile("utilities/mystery-boxes/mystery-box-camp9.jpg"),
      requirements: {
        type: MysteryBoxRequirementType.TITLES,
        metadata: {
          titles: 2,
        },
        text: "Earn 2 $TAILS guard titles",
      },
    },
  ],
  [ChainType.STELLAR]: [
    {
      address: "CBK4KAHLHNWOF4HEZFY2W57NYMSC4DLZGLGCM4HZUPAUU3PDPM3IMRS4",
      key: MYSTERY_BOX_TYPE.KEYBOARD_CAT,
      name: "KEYBOARD_CAT",
      chain: ChainType.STELLAR,
      image: cdnFile("utilities/mystery-boxes/keyboard-cat.webp"),
      requirements: {
        text: "MINT AND REDEEM TO VIBE",
      },
    },
  ],
};

export const chaptersBadges: Partial<Record<ChainType, IMysteryBox[]>> = {
  [ChainType.CAMP]: [
    {
      address: "0x2E7801A267Ac403fB9C2Ebd2D596F7A049C0C413",
      name: "Catnip Chaos - Chapter 1 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_1,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter1.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 1st chapter of Catnip Chaos",
      },
    },
    {
      address: "0x088C74D5cae0A3C08A34B1AEF87c6B0BA2F88A84",
      name: "Catnip Chaos - Chapter 2 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_2,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter2.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 2nd chapter of Catnip Chaos",
      },
    },
    {
      address: "0x701e95Af733116F119E227Fc96dd84B88619490f",
      name: "Catnip Chaos - Chapter 3 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_3,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter3.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 3rd chapter of Catnip Chaos",
      },
    },
    {
      address: "0x4e4AB24f37CFAdB06C5a2e00e8f1D3dE3c8A3408",
      name: "Catnip Chaos - Chapter 4 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_4,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter4.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 4th chapter of Catnip Chaos",
      },
    },
    {
      address: "0xeEE8C60861bDD9CF0b0C3c0A54021F5153220408",
      name: "Catnip Chaos - Chapter 5 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_5,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter5.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 5th chapter of Catnip Chaos",
      },
    },
    {
      address: "0xa0D4687483F049c53e6EC8cBCbc0332C74180168",
      name: "Catnip Chaos - Chapter 6 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_6,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter6.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 6th chapter of Catnip Chaos",
      },
    },
    {
      address: "0x3ebb468B41569307D69648022ee9a3B415977461",
      name: "Catnip Chaos - Chapter 7 Badge",
      key: MYSTERY_BOX_TYPE.CATNIP_CHAOS_7,
      chain: ChainType.CAMP,
      image: cdnFile("catnip-chaos/badges/chapter7.webp"),
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CHAPTER,
        text: "Complete 7th chapter of Catnip Chaos",
      },
    },
  ],
  [ChainType.STELLAR]: [],
};
