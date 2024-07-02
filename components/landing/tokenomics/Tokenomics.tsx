import { VestingSchedule } from "@/components/shared/VestingSchedule";

export const Tokenomics = () => {
  return (
    <div className="pb-8 md:mx-auto max-w-[1780px]">
      <div className="flex justify-center items-center gap-4 md:pb-12">
        <img src="/logo/coin.webp" className="w-14" />
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          TAILONOMICS
        </h2>
        <img src="/logo/coin.webp" className="w-14" />
      </div>
      <div className="flex flex-col items-center w-full mb-4">
        <div><span className="font-bold">TOTAL SUPPLY</span> - 500m $TAILS</div>
        <div><span className="font-bold">INITIAL MARKET CAP</span> - $0.53m</div>
      </div>
      <VestingSchedule />
    </div>
  );
};
