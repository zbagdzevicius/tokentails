import { QUEST_API } from "@/api/quest-api";
import { useQuery } from "@tanstack/react-query";
import { Countdown } from "../shared/Countdown";
import { StatsTable } from "../airdrop/StatsTable";
import { PixelButton } from "../shared/PixelButton";

export const Stats = () => {
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: () => QUEST_API.statistics(),
  });

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start lg:mt-8 2xl:mt-16 gap-2 lg:gap-16">
      <div className="flex flex-col items-center">
        <img className="w-32" src="/logo/logo.webp" alt="airdrop-logo" />
        <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h1 text-balance px-4">
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-4">
            Token Tails
          </span>
          Stats
        </h2>
        <div className="flex items-center font-primary gap-2 text-p5 pb-4 text-center justify-center">
          BE SURE TO JOIN OUR JOURNEY
        </div>
        <Countdown isDaysDisplayed isBig targetDate={new Date("2025-08-26")} />
        <div className="flex items-center font-primary gap-2 text-p5 pt-4 text-center justify-center">
          ENGAGE ON SOCIALS AND PLAY TO SAVE
        </div>
        <h2 className="font-primary uppercase lg:mt-3 tracking-tight text-h6 md:text-h3 text-balance px-4">
          9 WAYS TO
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] ml-2">
            TRACK
          </span>
        </h2>
        <div className="flex items-center font-primary gap-2 -mt-1 text-p5 text-center justify-center">
          LIVE DATA OF TOKEN TAILS
        </div>

        <a href="/airdrop" className="mt-4">
          <PixelButton text="AIRDROP STATS ->" />
        </a>

        {data && (
          <div className="flex flex-wrap gap-8 justify-center items-center mt-8">
            <div
              style={{
                backgroundImage: "url(/backgrounds/bg-5.webp)",
                backgroundSize: "cover",
                backgroundPosition: "top",
              }}
              className="text-p4 w-48 h-24 relative font-secondary flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
            >
              <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
                USERS COUNT
              </div>
              <div className="text-h5 font-secondary text-main-black mt-1 w-full flex items-center justify-center gap-1">
                {data.users.count}
              </div>
            </div>
            <div
              style={{
                backgroundImage: "url(/backgrounds/bg-5.webp)",
                backgroundSize: "cover",
                backgroundPosition: "top",
              }}
              className="text-p4 w-48 h-24 relative font-secondary flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
            >
              <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
                DONATIONS COUNT
              </div>
              <div className="text-h5 font-secondary text-main-black mt-1 w-full flex items-center justify-center gap-1">
                {data.orders.count}
              </div>
            </div>
            <div
              style={{
                backgroundImage: "url(/backgrounds/bg-5.webp)",
                backgroundSize: "cover",
                backgroundPosition: "top",
              }}
              className="text-p4 w-48 h-24 relative font-secondary flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
            >
              <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
                STAKED CATS
              </div>
              <div className="text-h5 font-secondary text-main-black mt-1 w-full flex items-center justify-center gap-1">
                {data.cats.staked}
              </div>
            </div>
            <div
              style={{
                backgroundImage: "url(/backgrounds/bg-5.webp)",
                backgroundSize: "cover",
                backgroundPosition: "top",
              }}
              className="text-p4 w-48 h-24 relative font-secondary flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
            >
              <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
                USERS CATS
              </div>
              <div className="text-h5 font-secondary text-main-black mt-1 w-full flex items-center justify-center gap-1">
                {data.cats.count}
              </div>
            </div>
            <div
              style={{
                backgroundImage: "url(/backgrounds/bg-5.webp)",
                backgroundSize: "cover",
                backgroundPosition: "top",
              }}
              className="text-p4 w-48 h-24 relative font-secondary flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
            >
              <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
                TOKENIZED CATS
              </div>
              <div className="text-h5 font-secondary text-main-black mt-1 w-full flex items-center justify-center gap-1">
                {data.blessings.count}
              </div>
            </div>

            <div className="flex items-start w-full gap-8 justify-center mb-8 flex-wrap">
              <StatsTable title="New Cats" records={data.blessings.weekly} />
              <StatsTable title="Donations" records={data.orders.weekly} />
              <StatsTable title="New Users" records={data.users.weekly} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stats;
