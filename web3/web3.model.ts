import { EntityType } from "@/models/save";

export enum NftType {
    CAT = 'CAT'
}

export interface ITransfer {
    price: number;
    entityType?: EntityType;
    _id?: string;
}

export interface ITransaction {
    transfer: ITransfer;
    address: string;
    hash: `0x${string}`
    userId: string; 
}

export const zetachainMysteryBoxAddress = '0xd51e3c8c7A547523C3AB31483fBF2833f8f01c30';