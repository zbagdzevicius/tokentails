import { isProd } from "@/models/app";
import { CurrencyType } from "@/web3/contracts";
import { bnbChain, bnbTestnetChain } from "@/web3/web3";
import * as React from "react";
import { useAccount, useBalance } from "wagmi";

const TAILS_PRICE = 0.03

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
  amountOfTails?: number
  setCurrencyType: (currencyType: CurrencyType) => void;
  setPrice: (price: number) => void;
};

const Web3Context = React.createContext<ContextState | undefined>(undefined);

const paymentsChain = isProd ? bnbChain : bnbTestnetChain;

export const Web3Provider = ({ children }: React.PropsWithChildren<{}>) => {
  const { isConnected, address, chainId } = useAccount();
  const [currencyType, setCurrencyType] = React.useState(CurrencyType.USDT);
  const [price, setPrice] = React.useState<number>(0);

  const amountOfTails = price ? Math.floor(price / TAILS_PRICE) : 0;

  const { data: balance } = useBalance({
    address,
    token:
      currencyType !== CurrencyType.BNB
        ? paymentsChain.contracts[currencyType].address!
        : undefined,
  });

  return (
    <Web3Context.Provider
      value={{
        isConnected,
        address,
        chainId,
        currencyType,
        price,
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
