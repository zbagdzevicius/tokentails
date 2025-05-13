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
  CATNIP = "CATNIP",
  STREAK = "STREAK",
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
  [ChainType.SKALE]: "https://mainnet.skalenodes.com/v1/green-giddy-denebola",
  [ChainType.SKALE_TEST]:
    "https://testnet.skalenodes.com/v1/lanky-ill-funny-testnet",
  [ChainType.BNB]: "https://bsc-dataseed.binance.org",
  [ChainType.TORUS]: "https://rpc.toruschain.com",
  [ChainType.DIAM]: "https://mainnet.diamcircle.io",
  [ChainType.BNB_TEST]: "https://data-seed-prebsc-1-s1.binance.org:8545",
  [ChainType.STELLAR]: "https://mainnet.sorobanrpc.com",
  [ChainType.STELLAR_TEST]: "https://soroban-testnet.stellar.org:443",
  [ChainType.SOLANA]: "https://api.mainnet-beta.solana.com",
  [ChainType.SOLANA_TEST]: "https://api.devnet.solana.com",
  [ChainType.CAMP_TEST]: "https://rpc.camp.network",
};

enum MYSTERY_BOX_TYPE {
  CAMP_1 = "CAMP_1",
  CAMP_2 = "CAMP_2",
  CAMP_3 = "CAMP_3",
  CAMP_4 = "CAMP_4",
  CAMP_5 = "CAMP_5",
  KEYBOARD_CAT = "KEYBOARD_CAT",
}

export const mysteryBoxes: Partial<Record<ChainType, IMysteryBox[]>> = {
  [ChainType.CAMP_TEST]: [
    {
      address: "0xa0D4687483F049c53e6EC8cBCbc0332C74180168",
      name: "Camp Mystery Box - Beginner Tier",
      key: MYSTERY_BOX_TYPE.CAMP_1,
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp.jpg",
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        text: "Joined Token Tails",
      },
    },
    {
      address: "0x0A65888A4F76D821A3148620866BC65A5db599BB",
      name: "Camp Mystery Box - Explorer Tier",
      key: MYSTERY_BOX_TYPE.CAMP_2,
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp2.jpg",
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.COINS,
        metadata: {
          catpoints: 50000,
        },
        text: "Collect 50k coins",
      },
    },
    {
      address: "0xec735A2Ba32703215b3e40d669C61FBd849b422a",
      name: "Camp Mystery Box - Cat Savior Tier",
      key: MYSTERY_BOX_TYPE.CAMP_3,
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp3.jpg",
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.PURCHASE,
        text: "Save a cat",
      },
    },
    {
      address: "0x5B1793d4AA54a36ad5F53d20C9ad1eEd8609410C",
      name: "Camp Mystery Box - Cat Lover Tier",
      key: MYSTERY_BOX_TYPE.CAMP_4,
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp4.jpg",
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.CATNIP,
        metadata: {
          catnip: 60,
        },
        text: "Collect 60 catnip",
      },
    },
    {
      address: "0xD6265283Af414697b61a46272669f21e6131628f",
      name: "Campt Mystery Box - Cats Fan",
      key: MYSTERY_BOX_TYPE.CAMP_5,
      chain: ChainType.CAMP_TEST,
      image: "/utilities/mystery-boxes/mystery-box-camp5.jpg",
      faucet: "https://faucet.campnetwork.xyz",
      requirements: {
        type: MysteryBoxRequirementType.STREAK,
        metadata: {
          streak: 10,
        },
        text: "Check-in 10 times (10 streak)",
      },
    },
  ],
  [ChainType.STELLAR]: [
    {
      address: "CBK4KAHLHNWOF4HEZFY2W57NYMSC4DLZGLGCM4HZUPAUU3PDPM3IMRS4",
      key: MYSTERY_BOX_TYPE.KEYBOARD_CAT,
      name: "KEYBOARD_CAT",
      chain: ChainType.STELLAR,
      image: "/utilities/mystery-boxes/keyboard-cat.webp",
      requirements: {
        text: "MINT AND REDEEM TO VIBE",
      },
    },
  ],
};
