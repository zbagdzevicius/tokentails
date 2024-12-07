import { useWeb3 } from "@/context/Web3Context";
import {
  ChainNamespaceImg,
  ChainNamespaces,
  ChainNamespacesCurrencies,
} from "@/web3/contracts";
import React from "react";
import { Web3Transfer } from "../web3/minting/Web3Transfer";

const PaymentInputSelect = () => {
  const {
    currencyType,
    setCurrencyType,
    setNamespace,
    namespace,
    price,
    setPrice,
    amountOfTails,
  } = useWeb3();

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === "") {
      setPrice("");
      return;
    }
    const numericValue = parseFloat(inputValue);
    if (!isNaN(numericValue)) {
      setPrice(numericValue);
    }
  };

  return (
    <div className="flex items-center justify-center flex-col gap-1">
      <div className="flex flex-col items-center gap-1">
        <div className="font-secondary bg-purple-300 px-4 rounded-full">
          NETWORK
        </div>
        <div className="flex gap-2">
          {ChainNamespaces.map((namespaceOption) => (
            <button
              key={namespaceOption}
              onClick={() => setNamespace(namespaceOption)}
              className={`transition group flex items-center justify-center gap-1 bg-purple-300 px-3 py-1 rounded-xl ${
                namespace === namespaceOption
                  ? ""
                  : "grayscale hover:grayscale-0"
              }`}
            >
              <div className="text-p4 font-secondary">{namespaceOption}</div>
              <img
                className={`transition ${
                  namespace === namespaceOption
                    ? "w-10"
                    : "w-10 px-1 group-hover:px-0"
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
              className={`transition group flex items-center justify-center gap-1 bg-yellow-300 px-3 py-1 rounded-xl ${
                currencyType === currency
                  ? ""
                  : "grayscale hover:grayscale-0"
              }`}
            >
              <div className="text-p4 font-secondary">{currency}</div>
              <img
                className={`transition ${
                  currencyType === currency
                    ? "w-10"
                    : "w-10 px-1 group-hover:px-0"
                }`}
                src={`/currency/${currency}.webp`}
                alt={`${currency} icon`}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex space-between gap-6 md:gap-8">
        <div>
          <label className="text-white font-secondary font-medium text-p3 flex justify-center">
            {currencyType} you pay
          </label>
          <div className="flex items-center hover:brightness-110 font-secondary bg-white rounded-full border-4 border-main-black overflow-hidden w-36 h-12 relative rem:mt-1">
            <input
              type="number"
              value={price}
              onChange={handlePriceChange}
              className="flex-grow px-2 py-1 outline-none text-p3 bg-white"
              placeholder="Amount"
            />
            <div className="flex items-center justify-center px-1">
              <img
                src={`/currency/${currencyType}.webp`}
                alt="Selected currency"
                className="h-12 w-12 absolute -right-0.5"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="text-white font-secondary font-medium text-p3 flex justify-center">
            $TAILS you receive
          </label>
          <div className="flex group items-center hover:brightness-110 font-secondary border-4 border-main-black rounded-full bg-white overflow-hidden w-36 h-12 relative rem:mt-1">
            <input
              type="number"
              value={amountOfTails}
              className="flex-grow px-2 py-1 outline-none text-p3"
              placeholder="Amount"
              readOnly
            />
            <div className="flex items-center justify-center px-1">
              <img
                src={`/logo/coin.webp`}
                alt="Selected currency"
                className="w-12 h-12 absolute -right-0.5 group-hover:animate-spin"
              />
            </div>
          </div>
        </div>
      </div>
      <Web3Transfer price={price!} />
    </div>
  );
};

export default PaymentInputSelect;