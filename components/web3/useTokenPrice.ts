import { getCurrencyRate } from "@/constants/api";
import { CurrencyType } from "@/web3/contracts";
import { useEffect, useState } from "react";

export const useTokenPrice = ({
  price,
  currencyType,
}: {
  price: number | string;
  currencyType: CurrencyType;
}) => {
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  useEffect(() => {
    getCurrencyRate(currencyType).then((rate) =>
      setTokenPrice(parseFloat(price?.toString()) / parseFloat(rate))
    );
  }, [price, currencyType]);

  return tokenPrice;
};
