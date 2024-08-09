import { QUEST } from "@/components/shared/QuestsModal";
import { IProfileCat } from "./cats";

export interface IProfile {
    avatar?: string;
    name: string;
    cat: IProfileCat;
    score: number;
    catpoints: number;
    canRedeemLives: boolean;
    catbassadorsLives: number;
    referrals: string[];
    quests: QUEST[];
}
