import { ChainNamespace, ChainType, CurrencyType } from "@/web3/contracts";
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
  namespace: ChainNamespace;
  amount: number;
  currencyType: CurrencyType;
  price: number;
  entityType: EntityType;
  cat?: string;
}
