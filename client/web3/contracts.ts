import { cdnFile } from "@/constants/utils";

export const recipientStellar =
  "GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  XLM = "XLM",
}

/**
 * Every currency an order can carry. Server copy: `CurrencyType` in
 * backend/src/shared/interfaces/currency.interface.ts. `CurrencyType` above stays the Stellar set the
 * web3 transfer reads (`useRates` keys its rate table on it); orders also carry USD (card), EURC (the
 * crypto checkout) and EUR (the portrait card checkout).
 */
export const OrderCurrencyType = {
  ...CurrencyType,
  USD: "USD",
  EURC: "EURC",
  EUR: "EUR",
} as const;
export type OrderCurrencyType =
  (typeof OrderCurrencyType)[keyof typeof OrderCurrencyType];

export enum ChainType {
  STELLAR = "STELLAR",
}

export const ChainImg: Record<ChainType, string> = {
  [ChainType.STELLAR]: cdnFile("currency/XLM.webp"),
};

export const ChainCurrencies: Record<ChainType, CurrencyType[]> = {
  [ChainType.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC],
};

export const currencyContracts: Record<
  ChainType,
  Partial<Record<CurrencyType, string>>
> = {
  [ChainType.STELLAR]: {
    [CurrencyType.USDC]:
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
};
