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
  setCurrencyType: (currencyType: CurrencyType) => void;
};

const Web3Context = React.createContext<ContextState | undefined>(undefined);

const paymentsChain = process.env.NEXT_PUBLIC_IS_PROD ? bnbChain : bnbTestnetChain;

export const Web3Provider = ({ children }: React.PropsWithChildren<{}>) => {
  const { isConnected, address, chainId } = useAccount();
  const [currencyType, setCurrencyType] = React.useState(CurrencyType.USDT);
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
        setCurrencyType,
        balance,
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
