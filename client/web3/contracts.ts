import { cdnFile } from "@/constants/utils";

export const recipientStellar =
  "GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  XLM = "XLM",
}

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
