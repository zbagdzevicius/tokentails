import { IBlessing } from "./blessing";
import { IImage } from "./image";
import { IProfile } from "./profile";

export interface IShelter {
    _id?: string;
    name: string;
    description: string;
    image: IImage;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    address: string;
    website: string;
    facebook: string;
    twitter: string;
    tiktok: string;
    foundedAt: Date;
    blessings: IBlessing[];
    users: IProfile[];
}