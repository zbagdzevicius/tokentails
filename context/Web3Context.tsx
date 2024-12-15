import { useTokenPrice } from "@/components/web3/useTokenPrice";
import {
  ChainNamespace,
  ChainNamespacesCurrencies,
  currencyContracts,
  CurrencyType,
} from "@/web3/contracts";
import { idChainType } from "@/web3/web3-config";
import { useRouter } from "next/router";
import * as React from "react";
import { useAccount, useBalance } from "wagmi";

type ContextState = {
  evmConnected: boolean;
  stellarConnected: boolean;
  evmAddress?: `0x${string}`;
  bnbRate?: number;
  xlmRate?: number;
  stellarAddress?: string;
  setStellarConnected: (stellarConnected: boolean) => void;
  setStellarAddress: (stellarAddress: string) => void;
  namespace: ChainNamespace;
  setNamespace: (namespace: ChainNamespace) => void;
  chainId?: number;
  query: any;
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
  setCurrencyType: (currencyType: CurrencyType) => void;
  setPrice: (price: any) => void;
  isTransactionSucces: boolean;
  setIsTransactionSucces: (isTransactionSucces: boolean) => void;
};

const Web3Context = React.createContext<ContextState | undefined>(undefined);

export const Web3Provider = ({ children }: React.PropsWithChildren<{}>) => {
  const { isConnected, address, chainId } = useAccount();
  const [stellarConnected, setStellarConnected] = React.useState(false);
  const [stellarAddress, setStellarAddress] = React.useState<string>();
  const [namespace, setNamespace] = React.useState<ChainNamespace>(
    ChainNamespace.EVM
  );

  const [currencyType, setCurrencyType] = React.useState(CurrencyType.USDT);
  const [price, setPrice] = React.useState();
  const bnbRate = useTokenPrice(CurrencyType.BNB);
  const xlmRate = useTokenPrice(CurrencyType.XLM);
  const [isTransactionSucces, setIsTransactionSucces] = React.useState(false);

  const router = useRouter();
  const { query } = router;

  const { data: balance } = useBalance({
    address,
    token: currencyContracts[idChainType[chainId!]]?.[currencyType],
  });

  React.useEffect(() => {
    setCurrencyType(ChainNamespacesCurrencies[namespace][0]);
  }, [namespace, setCurrencyType]);

  return (
    <Web3Context.Provider
      value={{
        evmConnected: isConnected,
        bnbRate,
        xlmRate,
        stellarConnected,
        evmAddress: address,
        stellarAddress,
        chainId,
        currencyType,
        price,
        query,
        setCurrencyType,
        setPrice,
        namespace,
        setNamespace,
        setStellarConnected,
        setStellarAddress,
        balance,
        isTransactionSucces,
        setIsTransactionSucces,
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
