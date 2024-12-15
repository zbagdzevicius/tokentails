import { useWeb3 } from "@/context/Web3Context";
import React from "react";
import { Web3Transfer } from "../web3/minting/Web3Transfer";
import { ChainSelect } from "./ChainSelect";

interface IProps {
  amountOfTails: number;
  price?: number;
  setPrice: (price?: number) => void;
}

const PaymentInputSelect = ({ amountOfTails, price, setPrice }: IProps) => {
  const { currencyType } = useWeb3();
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === "") {
      setPrice(undefined);
      return;
    }
    const numericValue = parseFloat(inputValue);
    if (!isNaN(numericValue)) {
      setPrice(numericValue);
    }
  };

  return (
    <div className="flex items-center justify-center flex-col gap-1">
      <ChainSelect />
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
      <Web3Transfer price={price!} amount={amountOfTails} />
    </div>
  );
};

export default PaymentInputSelect;
