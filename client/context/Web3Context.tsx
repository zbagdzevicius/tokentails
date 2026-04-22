import { ITransactionStatus } from "@/api/order-api";
import { useRates } from "@/components/web3/useRates";
import { ChainCurrencies, ChainType, CurrencyType } from "@/web3/contracts";
import { useRouter } from "next/router";
import * as React from "react";
import { useAccount } from "wagmi";

type ContextState = {
  evmConnected: boolean;
  stellarConnected: boolean;
  evmAddress?: `0x${string}`;
  rates?: Record<CurrencyType, number>;
  stellarAddress?: string;
  chainType: ChainType;
  setChainType: (chainType: ChainType) => void;
  setStellarConnected: (stellarConnected: boolean) => void;
  setStellarAddress: (stellarAddress: string) => void;
  chainId?: number;
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
  const { isConnected, address, chainId } = useAccount();

  const [stellarConnected, setStellarConnected] = React.useState(false);
  const [stellarAddress, setStellarAddress] = React.useState<string>();
  const [chainType, setChainType] = React.useState<ChainType>(ChainType.SEI);

  const [currencyType, setCurrencyType] = React.useState(CurrencyType.USDT);
  const [price, setPrice] = React.useState();
  const rates = useRates();
  const [transactionStatus, setTransactionStatus] =
    React.useState<ITransactionStatus | null>(null);

  const chainStatus = React.useMemo(() => {
    return {
      [ChainType.BNB]: {
        connected: isConnected,
        address: address,
      },
      [ChainType.SEI]: {
        connected: isConnected,
        address: address,
      },
      [ChainType.STELLAR]: {
        connected: stellarConnected,
        address: stellarAddress,
      },
      [ChainType.TORUS]: {
        connected: isConnected,
        address: address,
      },
      [ChainType.ETH]: {
        connected: isConnected,
        address: address,
      },
      [ChainType.BASE]: {
        connected: isConnected,
        address: address,
      },
      [ChainType.MANTLE]: {
        connected: isConnected,
        address: address,
      },
    };
  }, [chainType, isConnected, address, stellarAddress, stellarAddress]);
  const chainStatusDetail = chainStatus[chainType as keyof typeof chainStatus];

  const router = useRouter();
  const { query } = router;

  React.useEffect(() => {
    setCurrencyType(ChainCurrencies[chainType][0]);
  }, [chainType, setCurrencyType]);

  return (
    <Web3Context.Provider
      value={{
        evmConnected: isConnected,
        rates,
        stellarConnected,
        evmAddress: address,
        stellarAddress,
        chainId,
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
