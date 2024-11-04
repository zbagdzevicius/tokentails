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
  avatar?: string;
  name: string;
  streak: number;
  cat: ICat;
  cats: ICat[];
  score: number;
  wallets: IUserWallets;
  catpoints: number;
  catpointsToday: number;
  catpointsRecord: number;
  canRedeemLives: boolean;
  catbassadorsLives: number;
  referrals: string[];
  quests: QUEST[];
}
