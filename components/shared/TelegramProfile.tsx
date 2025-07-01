import { USER_API } from "@/api/user-api";
import { commafy } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameModal } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { GameStatSection } from "../catbassadors/GameStatsSection";
import { CatnipChaosLevelMap } from "../Phaser/map";
import { CloseButton } from "./CloseButton";
import { GameMusicToggle } from "./GameMusicToggler";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";

const Cat = ({ profile }: { profile?: IProfile | null }) => {
  return (
    <div className="relative">
      <img
        draggable={false}
        className="w-32 m-auto pixelated -mt-8 -mb-8 md:mb-0 md:-mt-8 relative z-10"
        src={profile?.cat?.catImg || "/logo/logo.webp"}
      />
      {(profile?.cat.blessings?.length || 0) > 0 && (
        <img
          draggable={false}
          className="absolute m-auto inset-0 object-cover translate-y-1 w-32 h-32 -mt-4 z-0"
          src={`/flare-effect/${profile!.cat.type}.gif`}
        ></img>
      )}
    </div>
  );
};

const ProfileUpdate = () => {
  const { profile } = useProfile();
  const [twitter, setTwitter] = useState(profile?.twitter);
  const [editMode, setEditMode] = useState(false);
  const toast = useToast();
  const { mutate, isPending } = useMutation({
    mutationFn: USER_API.saveProfileTwitter,
    onSuccess: () => {
      toast({ message: "X is successfully connected" });
      setEditMode(false);
    },
  });
  const buttonText = editMode
    ? isPending
      ? "Saving..."
      : "Save"
    : twitter
    ? "Edit"
    : "Connect";
  const onButtonClick = () => {
    if (!editMode) {
      setEditMode(true);
    } else if (twitter?.length) {
      mutate({ twitter, _id: profile?._id });
    }
  };

  return (
    <div className="flex items-center flex-col justify-center md:-mt-6 mb-2">
      <img className="w-8 -mb-3" src="/icons/social/x.webp" draggable="false" />
      {!editMode ? (
        <Tag isSmall>
          {twitter ? `X: ${twitter}` : "X Handle is not connected"}
        </Tag>
      ) : (
        <input
          type="text"
          value={twitter}
          onChange={(e) => setTwitter(e.target.value?.slice(0, 24))}
          className="flex-grow px-2 py-1 outline-none text-p5 bg-white rounded-full"
          placeholder="Your X Handle"
        />
      )}
      <span>
        <PixelButton
          isDisabled={isPending}
          isSmall
          text={buttonText}
          onClick={onButtonClick}
        />
      </span>
    </div>
  );
};

export const TelegramProfileContent = () => {
  const { profile, logout, isFB } = useProfile();
  const [isWalletsRevealed, setIsWalletsRevealed] = useState(false);
  const { setOpenedModal } = useGame();
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
        stat: profile.referralsCount || 0,
        bg: "from-green-300 to-green-300",
        text: `Earn 2000 coins for each friend
        + 50 daily coins and +1 daily live`,
      },
      {
        title: "CHECK-INS",
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
    <div className="pt-4 pb-8 md:pb-4 px-4 md:pt-4 text-gray-700 flex flex-col md:flex-row md:gap-4 justify-between items-center animate-appear">
      <span className="md:hidden">
        <Cat profile={profile} />
      </span>
      {profile?.cat && (
        <ul className="m-auto font-primary">
          <Tag>Hello, {profile.name} !</Tag>
          <div className="flex justify-center -mb-4">
            <PixelButton
              isSmall
              text="CONTACT US"
              onClick={() => setOpenedModal(GameModal.SUPPORT)}
            />
          </div>
          <li className="flex items-center gap-x-2 justify-center mt-4 ">
            <img
              draggable={false}
              className="w-7 mb-1 -mr-1"
              src="/logo/logo.webp"
            />
            <div className="flex font-secondary text-p4 gap-2">
              $Tails:{" "}
              <span className="font-bold">{commafy(profile.tails || 0)}</span>
            </div>
          </li>
          <li className="flex items-center gap-x-2 justify-center">
            <img draggable={false} className="w-5" src="/logo/coin.webp" />
            <div className="flex font-secondary text-p4 gap-2">
              Coins:{" "}
              <span className="font-bold">{commafy(profile.catpoints)}</span>
            </div>
          </li>
          <li className="flex items-center gap-x-2 mb-4 justify-center">
            <img draggable={false} className="w-5" src="/logo/catnip.webp" />
            <div className="flex font-secondary text-p4 gap-2">
              CATNIPS:{" "}
              <span className="font-bold">
                {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0} /{" "}
                {Object.keys(CatnipChaosLevelMap).length * 10}
              </span>
            </div>
          </li>
          <li className="flex justify-between mb-1 gap-2">
            {gameStats.map((stat) => (
              <GameStatSection {...stat} key={stat.title} onClick={() => {}} />
            ))}
          </li>

          {!isWalletsRevealed && (
            <span className="w-full flex justify-center flex-col">
              <PixelButton
                isSmall
                text="Reveal My Wallets"
                onClick={() => setIsWalletsRevealed(true)}
              />
              <div className="font-primary text-center text-p6 -mt-2 mb-2">
                GENERATED WALLETS FOR IN-GAME USAGE
              </div>
            </span>
          )}

          {profile?.wallets?.evm && isWalletsRevealed && (
            <li
              onClick={() => copy(profile?.wallets.evm.walletAddress)}
              className="flex flex-col gap-1 mt-3"
            >
              <div className="text-p5 font-secondary">
                Your EVM wallet address
                <span className="font-bold px-4 py-0.5 bg-yellow-300 rounded-lg ml-2">
                  COPY
                </span>
              </div>
              <p className="text-p6 font-bold font-secondary">
                {profile?.wallets.evm.walletAddress}
              </p>
            </li>
          )}

          {profile?.wallets?.stellar && isWalletsRevealed && (
            <li
              onClick={() => copy(profile?.wallets.stellar.walletAddress)}
              className="flex flex-col gap-1 mt-3"
            >
              <div className="text-p5 font-secondary">
                Your Stellar wallet address
                <span className="font-bold px-4 py-0.5 bg-yellow-300 rounded-lg ml-2">
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
      <div className="flex flex-col">
        <span className="hidden md:block">
          <Cat profile={profile} />
        </span>
        <ProfileUpdate />
        <GameMusicToggle />
        {isFB && <PixelButton isSmall text="Logout" onClick={logout} />}
      </div>
    </div>
  );
};

export const TelegramProfile = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full mb-2">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div
        className="z-50 rem:w-[350px] md:w-[540px] max-w-full absolute top-1/2 -translate-y-1/2  rounded-xl shadow h-fit"
        style={{
          backgroundImage: "url('/backgrounds/bg-4.webp')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <CloseButton onClick={() => close()} />
        <TelegramProfileContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
