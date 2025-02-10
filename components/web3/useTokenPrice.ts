import { ORDER_API } from "@/api/order-api";
import { CurrencyType } from "@/web3/contracts";
import { useEffect, useState } from "react";

export const useTokenPrice = (currencyType: CurrencyType) => {
  const [tokenPrice, setTokenPrice] = useState<number>(1000);
  useEffect(() => {
    ORDER_API.currencyRate(currencyType).then((rate) =>
      setTokenPrice(parseFloat(rate))
    );
  }, [currencyType]);

  return tokenPrice;
};
