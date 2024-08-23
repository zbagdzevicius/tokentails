import { QUEST } from "@/components/shared/QuestsModal";
import { ICat } from "./cats";

export interface IProfile {
    avatar?: string;
    name: string;
    streak: number;
    cat: ICat;
    cats: ICat[];
    score: number;
    walletAddress: string;
    catpoints: number;
    canRedeemLives: boolean;
    catbassadorsLives: number;
    referrals: string[];
    quests: QUEST[];
}
