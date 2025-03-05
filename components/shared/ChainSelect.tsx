import { useWeb3 } from "@/context/Web3Context";
import {
  ChainNamespace,
  ChainNamespaceImg,
  ChainNamespaces,
  ChainNamespacesCurrencies,
} from "@/web3/contracts";
import React from "react";

export const ChainSelect = () => {
  const { currencyType, setCurrencyType, setNamespace, namespace } = useWeb3();

  return (
    <div className="flex-col animate-appear">
      <div className="flex flex-col items-center gap-1">
        <div className="font-secondary bg-purple-300 px-4 rounded-full">
          CHAIN
        </div>
        <div className="flex gap-2">
          {ChainNamespaces.map((namespaceOption) => (
            <button
              key={namespaceOption}
              onClick={() => setNamespace(namespaceOption)}
              className={`transition group flex items-center justify-center gap-1 bg-purple-300 pl-2 rounded-full ${
                namespace === namespaceOption
                  ? ""
                  : "grayscale hover:grayscale-0"
              }`}
            >
              <div className="text-p4 font-secondary">
                {namespaceOption === ChainNamespace.EVM
                  ? "BSC"
                  : namespaceOption}
              </div>
              <img
                className={`transition ${
                  namespace === namespaceOption
                    ? "w-8"
                    : "w-8 px-1 group-hover:px-0"
                }`}
                src={ChainNamespaceImg[namespaceOption]}
                alt={`${namespaceOption} icon`}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 mb-4 mt-2">
        <div className="font-secondary bg-yellow-300 px-4 rounded-full">
          CURRENCY
        </div>
        <div className="flex gap-2">
          {ChainNamespacesCurrencies[namespace].map((currency) => (
            <button
              key={currency}
              onClick={() => setCurrencyType(currency)}
              className={`transition group flex items-center justify-center gap-1 bg-yellow-300 pl-2 rounded-full ${
                currencyType === currency ? "" : "grayscale hover:grayscale-0"
              }`}
            >
              <div className="text-p4 font-secondary">{currency}</div>
              <img
                className={`transition ${
                  currencyType === currency
                    ? "w-8"
                    : "w-8 px-1 group-hover:px-0"
                }`}
                src={`/currency/${currency}.webp`}
                alt={`${currency} icon`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
