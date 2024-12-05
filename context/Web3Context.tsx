import { isProd } from "@/models/app";
import { CurrencyType } from "@/web3/contracts";
import { bnbChain, bnbTestnetChain } from "@/web3/web3";
import * as React from "react";
import { useAccount, useBalance } from "wagmi";

type ContextState = {
  isConnected: boolean;
  address?: `0x${string}`;
  chainId?: number;
  balance:
  | {
    decimals: number;
    formatted: string;
    symbol: string;
    value: bigint;
  }
  | undefined;
  currencyType: CurrencyType;
  price?: number;
  finalTokenPrice?: number;
  amountOfTails?: number
  setCurrencyType: (currencyType: CurrencyType) => void;
  setPrice: (price: any) => void;
};

const Web3Context = React.createContext<ContextState | undefined>(undefined);

const paymentsChain = isProd ? bnbChain : bnbTestnetChain;

export const Web3Provider = ({ children }: React.PropsWithChildren<{}>) => {
  const { isConnected, address, chainId } = useAccount();
  const [currencyType, setCurrencyType] = React.useState(CurrencyType.USDT);
  const [price, setPrice] = React.useState(0);

  const { data: balance } = useBalance({
    address,
    token:
      currencyType !== CurrencyType.BNB
        ? paymentsChain.contracts[currencyType].address!
        : undefined,
  });

  const startDate = new Date("2024-11-20T00:00:00");
  const endDate = new Date("2024-12-18T00:00:00");

  const totalFundraiseTime = endDate.getTime() - startDate.getTime();

  const currentDate = new Date();
  const elapsedTime = currentDate.getTime() - startDate.getTime();

  const progress = Math.min(Math.max(elapsedTime / totalFundraiseTime, 0), 1);

  const basePrice = 0.03;
  const discount = 0.25;
  const hasCoupon = false;
  const couponDiscount = 0.05

  const initialPrice = basePrice * (1 - discount);

  const currentPrice = initialPrice + (basePrice - initialPrice) * progress;
  const finalTokenPrice = currentPrice * (1 - (hasCoupon ? couponDiscount : 0));

  const amountOfTails = price ? Math.floor(price / finalTokenPrice) : 0;
  console.log(amountOfTails)
  return (
    <Web3Context.Provider
      value={{
        isConnected,
        address,
        chainId,
        currencyType,
        price,
        finalTokenPrice,
        setCurrencyType,
        setPrice,
        balance,
        amountOfTails,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export function useWeb3() {
  const context = React.useContext(Web3Context);

  return context!;
}
