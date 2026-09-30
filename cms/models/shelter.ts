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

/** Write payload for POST/PUT /shelter: the logo is sent as its image id. */
export type IShelterInput = Partial<
    Omit<IShelter, 'image' | 'foundedAt' | 'blessings' | 'users'>
> & {
    image?: string;
    // Shape of the react-datetime-picker value.
    foundedAt?: Date | null | [Date | null, Date | null];
};