import { ICat } from "@/models/cats";
import { IOrder } from "@/models/order";
import { CurrencyType } from "@/web3/contracts";
import { apiUrl } from "./api";

export const rewardsConfig = {
  tails: { chance: 0.05, cap: 10000, likely: 300, name: "$TAILS" },
};

export type IRewardConfig = "tails";

export const getRewardsPropName = (type: IRewardConfig) => {
  return rewardsConfig[type].name;
};

export interface ITransactionStatus {
  success: boolean;
  message: string;
  cat: ICat;
  type: IRewardConfig;
  amount: number;
}

const adopt = async (_id: string): Promise<ITransactionStatus> => {
  return fetch(`${apiUrl}/cat/adopt/${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

const confirm = async (order: IOrder): Promise<ITransactionStatus> => {
  return fetch(`${apiUrl}/web3/confirm`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(order),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const currencyRates = async (): Promise<Record<CurrencyType, number>> => {
  return fetch(`${apiUrl}/cat/rates`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  }).then((response) => {
    return response.json();
  });
};

const currencyRate = async (currencyType: CurrencyType): Promise<string> => {
  return fetch(`${apiUrl}/cat/rate/${currencyType}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { price: 1000 };
    })
    .then((v) => v.price);
};

const raised = async (): Promise<number> => {
  return fetch(`${apiUrl}/web3/raised`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { raised: 0 };
    })
    .then((v) => Math.floor(v?.raised));
};

export const ORDER_API = {
  adopt,
  confirm,
  currencyRate,
  currencyRates,
  raised,
};
