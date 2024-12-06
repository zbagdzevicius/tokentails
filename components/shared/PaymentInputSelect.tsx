import { ChainTypeCurrencies } from "@/web3/contracts";
import { ChainType } from "@/web3/contracts";
import { useWeb3 } from "@/context/Web3Context";
import { Web3Transfer } from "../web3/minting/Web3Transfer";
import React from "react";

export const PaymentInputSelect = () => {
    const { currencyType, setCurrencyType, price, setPrice, amountOfTails } = useWeb3();

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
        <div className="flex items-center justify-center flex-col gap-3">
            <div className="flex items-center gap-2 md:mb-2">
                {ChainTypeCurrencies[ChainType.BNB].map((currency) => (
                    <button
                        key={currency}
                        onClick={() => setCurrencyType(currency)}
                        className="flex items-center justify-center "
                    >
                        <img
                            className={`transition ${currencyType === currency
                                ? "w-8 md:w-11"
                                : "w-8 md:w-11 px-1 grayscale hover:grayscale-0 hover:px-0"
                                }`}
                            src={`/currency/${currency}.webp`}
                            alt={`${currency} icon`}
                        />
                    </button>
                ))}
            </div>
            <div className="flex flex-row gap-2  ">
                <div>
                    <label className="text-white font-secondary font-medium text-p5 md:text-p4">{currencyType} you pay</label>
                    <div className="flex items-center border-2 font-secondary bg-white rounded-full  overflow-hidden rem:w-40 md:w-44 h-7 md:h-10 relative rem:mt-1">
                        <input
                            type="number"
                            value={price}
                            onChange={handlePriceChange}
                            className="flex-grow px-2 py-1 outline-none text-sm bg-white"
                            placeholder="Amount"
                        />
                        <div className="flex items-center justify-center px-1">
                            <img
                                src={`/currency/${currencyType}.webp`}
                                alt="Selected currency"
                                className="w-6 h-6 md:w-9 md:h-9 absolute right-0 top-0"
                            />
                        </div>
                    </div>
                </div>
                <div>
                    <label className="text-white font-secondary font-medium text-p5 md:text-p4">$TAILS you receive</label>
                    <div className="flex items-center font-secondary border-2 rounded-full bg-white overflow-hidden rem:w-40 md:w-44  h-7 md:h-10 relative rem:mt-1">
                        <input
                            type="number"
                            value={amountOfTails}
                            className="flex-grow px-2 py-1 outline-none text-sm"
                            placeholder="Amount"
                            readOnly
                        />
                        <div className="flex items-center justify-center px-1">
                            <img
                                src={`/logo/coin.webp`}
                                alt="Selected currency"
                                className="w-6 h-6 md:w-9 md:h-9 absolute right-0 top-0"
                            />
                        </div>
                    </div>
                </div>
            </div>
            <Web3Transfer price={price!} />
        </div>
    );
};
