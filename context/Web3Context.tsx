import { useTokenPrice } from "@/components/web3/useTokenPrice";
import { getRaised } from "@/constants/api";
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
  currentFunds: number;
  finalTokenPrice?: number;
  amountOfTails?: number;
  setCurrencyType: (currencyType: CurrencyType) => void;
  setPrice: (price: any) => void;
  isTransactionSucces: boolean;
  setIsTransactionSucces: (isTransactionSucces: boolean) => void;
};

const Web3Context = React.createContext<ContextState | undefined>(undefined);

export const Web3Provider = ({ children }: React.PropsWithChildren<{}>) => {
  const { isConnected, address, chainId } = useAccount();
  const [stellarConnected, setStellarConnected] = React.useState(false);
  const [currentFunds, setCurrentFunds] = React.useState(0);
  const [stellarAddress, setStellarAddress] = React.useState<string>();
  const [namespace, setNamespace] = React.useState<ChainNamespace>(
    ChainNamespace.BNB
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

  const finalTokenPrice = React.useMemo(() => {
    const startDate = new Date(Date.UTC(2024, 11, 8, 0, 0, 0));
    const endDate = new Date(Date.UTC(2024, 11, 20, 0, 0, 0));

    const totalFundraiseTime = endDate.getTime() - startDate.getTime();
    const currentDate = new Date();
    const elapsedTime = currentDate.getTime() - startDate.getTime();

    const progress = Math.min(Math.max(elapsedTime / totalFundraiseTime, 0), 1);

    const basePrice = 0.03;
    const discount = 0.28;
    const hasCoupon = query.code === "meow" ? true : false;
    const couponDiscount = 0.05;
    const initialPrice = basePrice * (1 - discount);

    const currentPrice = initialPrice + (basePrice - initialPrice) * progress;
    return currentPrice * (1 - (hasCoupon ? couponDiscount : 0));
  }, []);
  React.useEffect(() => {
    getRaised().then((value) => setCurrentFunds(value));
  }, [isTransactionSucces]);

  const amountOfTails = React.useMemo(() => {
    if (!price) {
      return 0;
    }
    if (currencyType === CurrencyType.BNB) {
      return Math.floor((price / finalTokenPrice) * bnbRate);
    }
    if (currencyType === CurrencyType.XLM) {
      return Math.floor((price / finalTokenPrice) * xlmRate);
    }

    return Math.floor(price / finalTokenPrice);
  }, [currencyType, finalTokenPrice, bnbRate, xlmRate, price]);
  return (
    <Web3Context.Provider
      value={{
        evmConnected: isConnected,
        bnbRate,
        xlmRate,
        stellarConnected,
        evmAddress: address,
        currentFunds,
        stellarAddress,
        chainId,
        currencyType,
        price,
        query,
        finalTokenPrice,
        setCurrencyType,
        setPrice,
        namespace,
        setNamespace,
        setStellarConnected,
        setStellarAddress,
        balance,
        amountOfTails,
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
