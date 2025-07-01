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
  twitter?: string;
  name: string;
  streak: number;
  tails: number;
  codex: {};
  cat: ICat;
  cats: ICat[];
  score: number;
  wallets: IUserWallets;
  catpoints: number;
  catpointsToday: number;
  catbassadorsRecord: number;
  catnipChaos: number[];
  catbassadorsCount: number;
  catpointsRecord: number;
  canRedeemLives: boolean;
  catbassadorsLives: number;
  adventDayRedeemed: number;
  referralsCount: number;
  quests: (QUEST | string)[];
  advent: number;

  monthCatpoints: number;
  monthCatbassadorsLivesSpent: number;
  monthCatsAdopted: number;
  monthBoxes: number;
  monthFeeded: number;
  monthStreak: number;
  monthReferrals: number;
  monthTicketCount: number;
  monthCoinsCrafted: number;
}
