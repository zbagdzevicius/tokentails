import { QUEST } from "@/components/shared/QuestsModal";
import { ICat } from "./cats";

export interface IWallet {
  walletAddress: string;
}

export interface IUserWallets {
  stellar: IWallet;
  evm: IWallet;
}

export interface IProfile {
  _id: string;
  avatar?: string;
  twitter?: string;
  name: string;
  streak: number;
  cat: ICat;
  cats: ICat[];
  score: number;
  wallets: IUserWallets;
  catpoints: number;
  catpointsToday: number;
  catbassadorsRecord: number;
  catnipChaos: number[];
  purrquestCount: number;
  catbassadorsCount: number;
  catpointsRecord: number;
  canRedeemLives: boolean;
  catbassadorsLives: number;
  adventDayRedeemed: number;
  referrals: string[];
  quests: (QUEST | string)[];
  advent: number;
  gifts: number;
}
