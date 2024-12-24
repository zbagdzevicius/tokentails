import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useCallback, useMemo } from "react";
import { GameStatSection } from "../catbassadors/GameStatsSection";
import { commafy } from "@/constants/utils";
import { CloseButton } from "./CloseButton";
import { GameMusicToggle } from "./GameMusicToggler";

const features = ["NFTs & Airdrops prizes", "Weekly Rewards & Events"];

export const TelegramProfileContent = () => {
  const { profile, position } = useProfile();
  const gameStats = useMemo(() => {
    if (!profile) {
      return [];
    }
    const level = profile.catpoints?.toFixed(0).toString().length;
    return [
      {
        title: "Level",
        image: "/logo/level.png",
        stat: level || 0,
        bg: "from-yellow-300 to-green-300",
        text: `Earn coins to level up
        1 digit coins = 1 level
        e.g. 1000 coins = level 4
        Higher level = More Rewards
        `,
      },
      {
        title: "Friends",
        image: "/logo/friends.png",
        stat: profile.referrals?.length || 0,
        bg: "from-green-300 to-green-300",
        text: `Earn 2000 coins for each friend
        + 50 daily coins and +1 daily live`,
      },
      {
        title: "Streak",
        image: "/logo/rocket.png",
        stat: profile.streak || 0,
        bg: "from-green-300 to-yellow-300",
        text: `Streak of days you played in a row
        1 day = +25 daily coins`,
      },
    ];
  }, [profile]);
  const toast = useToast();
  const copy = useCallback(
    (stringToCopy: string) => {
      navigator.clipboard
        .writeText(stringToCopy!)
        .then(() => {
          toast({ message: "Wallet address coppied to clipboard" });
        })
        .catch((err) => {
          throw err;
        });
    },
    [toast, close]
  );

  return (
    <div className="pt-4 pb-8 px-4 md:px-16 md:pt-4 md:pb-12 text-gray-700 flex flex-col justify-between items-center">
      <div className="relative">
        <img
          className="w-16 m-auto"
          src={profile?.cat?.catImg || "/logo/logo.webp"}
        />
        {profile!.cat.blessings?.length > 0 && (
          <img
            className="absolute inset-0 object-cover translate-y-1 w-16 h-16"
            src={`/flare-effect/${profile!.cat.blessings[0].ability}.gif`}
          ></img>
        )}
      </div>
      {profile?.cat && (
        <ul className="m-auto font-primary">
          <li className="text-p3 font-secondary bg-yellow-300 w-fit px-4 mb-2 rounded-lg m-auto">
            Hello, {profile.name} !
          </li>
          <li className="flex items-center gap-x-2 mb-4 justify-center mt-4">
            <img className="w-8" src="/logo/chest.webp" />
            <div className="flex font-secondary text-p3 gap-2">
              Coins:{" "}
              <span className="font-bold">{commafy(profile.catpoints)}</span>
            </div>
            <img className="w-8 rotate-x scale-x-[-1]" src="/logo/chest.webp" />
          </li>
          <li className="flex justify-between mb-4">
            {gameStats.map((stat) => (
              <GameStatSection {...stat} key={stat.title} onClick={() => { }} />
            ))}
          </li>

          {profile?.wallets?.evm && (
            <li
              onClick={() => copy(profile?.wallets.evm.walletAddress)}
              className="flex flex-col gap-1 mt-3"
            >
              <div className="text-p6">
                Your EVM wallet address{" "}
                <span className="font-bold px-4 py-0.5 bg-yellow-300 rounded-lg">
                  COPY
                </span>
              </div>
              <p className="text-p6 font-bold font-secondary">
                {profile?.wallets.evm.walletAddress}
              </p>
            </li>
          )}

          {profile?.wallets?.stellar && (
            <li
              onClick={() => copy(profile?.wallets.stellar.walletAddress)}
              className="flex flex-col gap-1 mt-3"
            >
              <div className="text-p6">
                Your Stellar wallet address{" "}
                <span className="font-bold px-4 py-0.5 bg-yellow-300 rounded-lg">
                  COPY
                </span>
              </div>
              <p className="text-p6 font-bold font-secondary">
                {profile?.wallets.stellar.walletAddress}
              </p>
            </li>
          )}
        </ul>
      )}
      <GameMusicToggle />
    </div>
  );
};

export const TelegramProfile = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-purple-300 to-blue-300 absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
        <TelegramProfileContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
        <CloseButton onClick={() => close()} />
      </div>
    </div>
  );
};
