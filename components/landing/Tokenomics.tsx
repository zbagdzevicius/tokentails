import { VestingSchedule } from "@/components/shared/VestingSchedule";
import { cdnFile } from "@/constants/utils";
export const Tokenomics = () => {
  return (
    <div className="pb-4 flex flex-col items-center">
      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance mt-3 mb-0 z-10">
        $TAILS Token
      </h2>
      <div className="flex items-center font-primary gap-2 text-p5 text-center justify-center mb-4">
        REDEEMAL AT TOKEN LAUNCH
      </div>
      <div className="flex justify-center items-center gap-4">
        <div className="flex items-center whitespace-nowrap mr-2 font-primary text-p4 bg-yellow-300 pr-2 hover:bg-opacity-100 rounded-xl">
          <img
            draggable={false}
            src={cdnFile("logo/coin.webp")}
            className="min-w-8 w-8 h-8 -ml-1 mr-1"
          />
          100m supply
        </div>
        <div className="flex items-center whitespace-nowrap font-primary text-p4 bg-yellow-300 pl-2 hover:bg-opacity-100 rounded-xl">
          $0.035 at launch
          <img
            draggable={false}
            src={cdnFile("currency/USDC.webp")}
            className="min-w-8 w-8 h-8 ml-1 -mr-1"
          />
        </div>
      </div>
      <VestingSchedule />
    </div>
  );
};
