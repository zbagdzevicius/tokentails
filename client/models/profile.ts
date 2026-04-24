import { QUEST } from "@/models/quest";
import { ICat } from "./cats";

export interface IWallet {
  walletAddress: string;
}

export interface IUserWallets {
  stellar: IWallet;
}

export interface IProfile {
  _id: string;
  twitter?: string;
  discord?: string;
  name: string;
  streak: number;
  discount: string;
  affiliated: number;
  spent: number;
  tails: number;
  codex: number[];
  boxes: number;
  cat: ICat;
  cats: ICat[];
  score: number;
  wallets: IUserWallets;
  catnipChaos: number[];
  catnipChaosCount: number;
  catnipCount: number;
  seasonEvent: number[];
  seasonEventCount: number;
  match3: number[];
  match3Count: number;
  match3Score?: number[];
  match3ScoreCount?: number;
  referralsCount: number;
  quests: (QUEST | string)[];
  monthTails: number;
  monthSpent: number;
  canRedeemLives: boolean;
  monthCatsAdopted: number;
  monthBoxes: number;
  monthPacks: number;
  monthFeeded: number;
  monthStreak: number;
  monthReferrals: number;
  monthTicketCount: number;
  monthTailsCrafted: number;
  portraitPurchases: number;
  monthPortraitPurchases: number;
  airdropRewardsClaimed: string[];
  airdropChallengesClaimed?: string[];
  airdropMilestonesClaimed?: string[];
}
