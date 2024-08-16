import { ChainType, CurrencyType } from "@/web3/contracts";
import { EntityType } from "./save";

export enum OrderStatus {
  COMPLETE = "COMPLETE",
  PENDING = "PENDING",
  FAILED = "FAILED",
}

export interface IOrder {
  status?: OrderStatus;
  hash: string;
  chainType: ChainType;
  currencyType: CurrencyType;
  price: number;
  entityType: EntityType;
  cat?: string;
}
