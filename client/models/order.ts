import { ChainType, CurrencyType } from "@/web3/contracts";
import { EntityType } from "./save";

export enum OrderStatus {
  COMPLETE = "COMPLETE",
  PENDING = "PENDING",
  FAILED = "FAILED",
}

export interface IOrder {
  status?: OrderStatus;
  ref?: string;
  hash: string;
  walletAddress: string;
  chainType: ChainType;
  currencyType: CurrencyType;
  price: number;
  entityType: EntityType;
  id?: string;
  user?: string;
  discount?: string;
}

export enum PackType {
  STARTER = "STARTER",
  INFLUENCER = "INFLUENCER",
  LEGENDARY = "LEGENDARY",
}
