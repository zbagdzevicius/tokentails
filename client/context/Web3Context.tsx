import { ITransactionStatus } from "@/api/order-api";
import { useRates } from "@/components/web3/useRates";
import { ChainCurrencies, ChainType, CurrencyType } from "@/web3/contracts";
import { useRouter } from "next/router";
import * as React from "react";

type ContextState = {
  stellarConnected: boolean;
  rates?: Record<CurrencyType, number>;
  stellarAddress?: string;
  chainType: ChainType;
  setChainType: (chainType: ChainType) => void;
  setStellarConnected: (stellarConnected: boolean) => void;
  setStellarAddress: (stellarAddress: string) => void;
  query: any;
  currencyType: CurrencyType;
  chainStatusDetail: {
    connected: boolean;
    address: string | undefined;
  };
  price?: number;
  setCurrencyType: (currencyType: CurrencyType) => void;
  setPrice: (price: any) => void;
  transactionStatus: ITransactionStatus | null;
  setTransactionStatus: (transactionStatus: ITransactionStatus | null) => void;
};

const Web3Context = React.createContext<ContextState | undefined>(undefined);

export const Web3Provider = ({ children }: React.PropsWithChildren<{}>) => {
  const [stellarConnected, setStellarConnected] = React.useState(false);
  const [stellarAddress, setStellarAddress] = React.useState<string>();
  const [chainType, setChainType] = React.useState<ChainType>(ChainType.STELLAR);

  const [currencyType, setCurrencyType] = React.useState(CurrencyType.XLM);
  const [price, setPrice] = React.useState();
  const rates = useRates();
  const [transactionStatus, setTransactionStatus] =
    React.useState<ITransactionStatus | null>(null);

  const chainStatusDetail = React.useMemo(
    () => ({
      connected: stellarConnected,
      address: stellarAddress,
    }),
    [stellarConnected, stellarAddress],
  );

  const router = useRouter();
  const { query } = router;

  React.useEffect(() => {
    setCurrencyType(ChainCurrencies[chainType][0]);
  }, [chainType, setCurrencyType]);

  return (
    <Web3Context.Provider
      value={{
        rates,
        stellarConnected,
        stellarAddress,
        currencyType,
        price,
        query,
        chainType,
        setChainType,
        chainStatusDetail,
        setCurrencyType,
        setPrice,
        setStellarConnected,
        setStellarAddress,
        transactionStatus,
        setTransactionStatus,
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
