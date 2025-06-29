import { ITransactionStatus } from "@/api/order-api";
import { useTokenPrice } from "@/components/web3/useTokenPrice";
import { isProd } from "@/models/app";
import {
  ChainNamespace,
  ChainNamespacesCurrencies,
  ChainType,
  CurrencyType,
} from "@/web3/contracts";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/router";
import * as React from "react";
import { useAccount } from "wagmi";

type ContextState = {
  evmConnected: boolean;
  stellarConnected: boolean;
  solanaConnected: boolean;
  evmAddress?: `0x${string}`;
  bnbRate?: number;
  xlmRate?: number;
  diamRate?: number;
  solRate?: number;
  stellarAddress?: string;
  solanaAddress?: PublicKey | null;
  chainType: ChainType;
  setStellarConnected: (stellarConnected: boolean) => void;
  setStellarAddress: (stellarAddress: string) => void;
  namespace: ChainNamespace;
  setNamespace: (namespace: ChainNamespace) => void;
  chainId?: number;
  query: any;
  currencyType: CurrencyType;
  namespaceDetail: {
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
  const [chainType, setChainType] = React.useState<ChainType>(
    isProd ? ChainType.BNB : ChainType.BNB_TEST
  );

  const { publicKey: solanaAddress, connected: solanaConnected } =
    useSolanaWallet();

  const [namespace, setNamespace] = React.useState<ChainNamespace>(
    ChainNamespace.EVM
  );
  React.useEffect(() => {
    // if (namespace === ChainNamespace.TORUS) {
    //   setChainType(ChainType.TORUS);
    // }
    if (namespace === ChainNamespace.EVM) {
      setChainType(isProd ? ChainType.BNB : ChainType.BNB_TEST);
    }
    if (namespace === ChainNamespace.XFI) {
      setChainType(ChainType.XFI);
    }
    if (namespace === ChainNamespace.SOLANA) {
      setChainType(ChainType.SOLANA);
    }
    if (namespace === ChainNamespace.STELLAR) {
      setChainType(isProd ? ChainType.BNB : ChainType.BNB_TEST);
    }
  }, [namespace, setChainType]);

  const [currencyType, setCurrencyType] = React.useState(CurrencyType.USDT);
  const [price, setPrice] = React.useState();
  const bnbRate = useTokenPrice(CurrencyType.BNB);
  const xlmRate = useTokenPrice(CurrencyType.XLM);
  const solRate = useTokenPrice(CurrencyType.SOL);
  const diamRate = 0.01;
  const [transactionStatus, setTransactionStatus] =
    React.useState<ITransactionStatus | null>(null);

  const namespaceDetails = React.useMemo(() => {
    return {
      [ChainNamespace.EVM]: {
        connected: isConnected,
        address: address,
      },
      [ChainNamespace.XFI]: {
        connected: isConnected,
        address: address,
      },
      [ChainNamespace.STELLAR]: {
        connected: stellarConnected,
        address: stellarAddress,
      },
      [ChainNamespace.SOLANA]: {
        connected: solanaConnected,
        address: solanaAddress?.toString(),
      },
      // [ChainNamespace.TORUS]: {
      //   connected: isConnected,
      //   address: address,
      // },
    };
  }, [
    namespace,
    solanaConnected,
    solanaAddress,
    isConnected,
    address,
    stellarAddress,
    stellarAddress,
  ]);
  const namespaceDetail = namespaceDetails[namespace];

  const router = useRouter();
  const { query } = router;

  React.useEffect(() => {
    setCurrencyType(ChainNamespacesCurrencies[namespace][0]);
  }, [namespace, setCurrencyType]);

  return (
    <Web3Context.Provider
      value={{
        evmConnected: isConnected,
        bnbRate,
        xlmRate,
        solRate,
        stellarConnected,
        evmAddress: address,
        stellarAddress,
        solanaAddress,
        chainId,
        currencyType,
        price,
        diamRate,
        query,
        chainType,
        namespaceDetail,
        setCurrencyType,
        setPrice,
        namespace,
        setNamespace,
        setStellarConnected,
        setStellarAddress,
        solanaConnected,
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
