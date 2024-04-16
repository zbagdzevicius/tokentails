import { VestingSchedule } from "@/components/shared/VestingSchedule";

export const Tokenomics = () => {
  return (
    <div className="pb-8 max-w-[1280px] md:mx-auto">
      <div className="flex justify-center items-center gap-4 md:pb-12">
        <img src="/logo/coin.png" className="w-14" />
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          TOKENOMICS
        </h2>
        <img src="/logo/coin.png" className="w-14" />
      </div>
      <div className="flex flex-col items-center w-full mb-4">
        <div><span className="font-bold">TOTAL SUPPLY</span> - 1B $TAILS</div>
        <div><span className="font-bold">INITIAL MARKET CAP</span> - $390K</div>
      </div>
      <VestingSchedule />
    </div>
  );
};
