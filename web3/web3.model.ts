import { EntityType } from "@/models/save";

export enum NftType {
    CAT = 'CAT'
}

export interface ITransfer {
    price: number;
    entityType: EntityType;
    _id: string;
}

export interface ITransaction {
    transfer: ITransfer;
    address: string;
    hash: `0x${string}`
    userId: string; 
}