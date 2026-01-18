import { cdnFile } from "@/constants/utils";
import { useWeb3 } from "@/context/Web3Context";
import { ChainType, ChainImg, ChainCurrencies } from "@/web3/contracts";

export const ChainSelect = ({
  chains = [
    ChainType.SEI,
    ChainType.BNB,
    ChainType.SOLANA,
    ChainType.STELLAR,
    ChainType.TORUS,
  ],
}: {
  chains?: ChainType[];
}) => {
  const { currencyType, setCurrencyType, setChainType, chainType } = useWeb3();
  const moreThanOneChain = chains.length > 1;

  return (
    <div className="flex-col animate-appear">
      <div className="flex flex-col items-center gap-1">
        {moreThanOneChain && (
          <div className="font-primary text-p5 px-8 rounded-lg bg-gradient-to-br from-pink-400 to-yellow-500 border-4 border-yellow-900">
            SELECT PAYMENT CHAIN
          </div>
        )}
        {moreThanOneChain && (
          <div className="flex gap-2 mt-2">
            {chains.map((chain) => (
              <button
                key={chain}
                onClick={() => setChainType(chain)}
                className={`transition group flex flex-col w-[4.37rem] h-[4.37rem] items-center justify-center rounded-2xl border-2 border-yellow-900 ${
                  chainType === chain
                    ? "glow-box bg-gradient-to-br from-pink-400 to-yellow-500"
                    : "grayscale hover:grayscale-30 bg-yellow-100 brightness-90"
                }`}
              >
                <img
                  draggable={false}
                  className={`transition-all duration-300 ${
                    chainType === chain
                      ? "w-9 mt-1"
                      : "w-8 px-1 group-hover:px-0 -mt-8"
                  }`}
                  src={ChainImg[chain]}
                />
                <div
                  className={`text-p4 font-primary ${
                    chainType === chain ? "glow" : "text-yellow-900"
                  }`}
                >
                  {chain}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 mb-4 mt-3">
        <div className="font-primary text-p5 px-4 rounded-lg bg-gradient-to-br from-pink-400 to-yellow-500 border-4 border-yellow-900">
          SELECT PAYMENT CURRENCY
        </div>
        <div className="flex gap-2 mt-2 h-8">
          {ChainCurrencies[chainType].map((currency) => (
            <button
              key={currency}
              onClick={() => setCurrencyType(currency)}
              className={`transition-all duration-300 group flex items-center justify-center gap-1 pl-2 rounded-2xl border-2 border-yellow-900 ${
                currencyType === currency
                  ? "glow-box bg-gradient-to-br from-pink-400 to-yellow-500"
                  : "grayscale hover:grayscale-0 bg-yellow-100 brightness-90"
              }`}
            >
              <div
                className={`text-p4 font-primary ${
                  currencyType === currency ? "glow" : "text-yellow-900"
                }`}
              >
                {currency}
              </div>
              <img
                draggable={false}
                className={`transition ${
                  currencyType === currency
                    ? "w-8 hl"
                    : "w-8 px-1 group-hover:px-0"
                }`}
                src={cdnFile(`currency/${currency}.webp`)}
                alt={`${currency} icon`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
