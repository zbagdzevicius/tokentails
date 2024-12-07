import { getCurrencyRate } from "@/constants/api";
import { CurrencyType } from "@/web3/contracts";
import { useEffect, useState } from "react";

export const useTokenPrice = (currencyType: CurrencyType) => {
  const [tokenPrice, setTokenPrice] = useState<number>(1000);
  useEffect(() => {
    getCurrencyRate(currencyType).then((rate) =>
      setTokenPrice(parseFloat(rate))
    );
  }, [currencyType]);

  return tokenPrice;
};
