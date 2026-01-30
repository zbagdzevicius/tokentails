import { ORDER_API } from "@/api/order-api";
import { CurrencyType } from "@/web3/contracts";
import { useEffect, useState } from "react";

export const useRates = () => {
  const [rates, setRates] = useState<Record<CurrencyType, number>>({
    [CurrencyType.BNB]: 1000,
    [CurrencyType.XLM]: 1000,
    [CurrencyType.SOL]: 1000,
    [CurrencyType.SEI]: 1000,
    [CurrencyType.USDT]: 1,
    [CurrencyType.USDC]: 1,
    [CurrencyType.ODP]: 1,
    [CurrencyType.MNT]: 1,
    [CurrencyType.ETH]: 1,
  });
  useEffect(() => {
    ORDER_API.currencyRates().then((rates) => setRates(rates));
  }, []);

  return rates;
};
