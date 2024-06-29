import { IProfileCat } from "./cats";

export interface IProfile {
    avatar: string;
    name: string;
    cat: IProfileCat;
    score: number;
}
