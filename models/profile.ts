import { QUEST } from "@/models/quest";
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
  twitter?: string;
  discord?: string;
  name: string;
  streak: number;
  discount: string;
  spent: number;
  tails: number;
  codex: number[];
  boxes: number;
  cat: ICat;
  cats: ICat[];
  score: number;
  wallets: IUserWallets;
  catnipChaos: number[];
  catnipCount: number;
  referralsCount: number;
  quests: (QUEST | string)[];
  monthTails: number;
  monthSpent: number;
  canRedeemLives: boolean;
  monthCatsAdopted: number;
  monthBoxes: number;
  monthFeeded: number;
  monthStreak: number;
  monthReferrals: number;
  monthTicketCount: number;
  monthTailsCrafted: number;
}
