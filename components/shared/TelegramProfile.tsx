import { USER_API } from "@/api/user-api";
import { commafy } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameModal } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
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
        className="w-24 m-auto pixelated -mt-8 -mb-8 md:mb-0 md:-mt-8 relative z-10"
        src={profile?.cat?.catImg || "/logo/logo.webp"}
      />
      {(profile?.cat.blessings?.length || 0) > 0 && (
        <img
          draggable={false}
          className="absolute m-auto inset-0 object-cover translate-y-1 w-24 h-24 -mt-2 z-0"
          src={`/flare-effect/${profile!.cat.type}.gif`}
        ></img>
      )}
    </div>
  );
};

interface DonationBreakdown {
  extendedCare: number;
  emergencyMedical: number;
  spayNeuter: number;
  checkupVaccines: number;
  dailyCare: number;
  remaining: number;
}

const calculateDonationBreakdown = (amount: number): DonationBreakdown => {
  let remaining = amount;
  const breakdown: DonationBreakdown = {
    extendedCare: 0,
    emergencyMedical: 0,
    spayNeuter: 0,
    checkupVaccines: 0,
    dailyCare: 0,
    remaining: 0,
  };

  // Extended care - $200
  breakdown.extendedCare = Math.floor(remaining / 200);
  remaining -= breakdown.extendedCare * 200;

  // Emergency medical - $150
  breakdown.emergencyMedical = Math.floor(remaining / 150);
  remaining -= breakdown.emergencyMedical * 150;

  // Checkup/vaccines - $40
  breakdown.checkupVaccines = Math.floor(remaining / 40);
  remaining -= breakdown.checkupVaccines * 40;

  // Daily care - $5
  breakdown.dailyCare = Math.floor(remaining / 5);
  remaining -= breakdown.dailyCare * 5;

  // Store any remaining amount
  breakdown.remaining = remaining;

  return breakdown;
};

const getDonationSummary = (breakdown: DonationBreakdown): string => {
  const parts: string[] = [];

  if (breakdown.extendedCare > 0) {
    parts.push(
      `✅ ${breakdown.extendedCare} ${
        breakdown.extendedCare === 1
          ? "extended care & recovery"
          : "extended care & recoveries"
      }`
    );
  }

  if (breakdown.emergencyMedical > 0) {
    parts.push(
      `✅ ${breakdown.emergencyMedical} ${
        breakdown.emergencyMedical === 1
          ? "emergency medical treatment"
          : "emergency medical treatments"
      }`
    );
  }

  if (breakdown.spayNeuter > 0) {
    parts.push(
      `✅ ${breakdown.spayNeuter} ${
        breakdown.spayNeuter === 1
          ? "spay/neuter surgery"
          : "spay/neuter surgeries"
      }`
    );
  }

  if (breakdown.checkupVaccines > 0) {
    parts.push(
      `✅ ${breakdown.checkupVaccines} ${
        breakdown.checkupVaccines === 1
          ? "full checkup & vaccinations"
          : "full checkups & vaccinations"
      }`
    );
  }

  if (breakdown.dailyCare > 0) {
    parts.push(
      `✅ ${breakdown.dailyCare} ${
        breakdown.dailyCare === 1 ? "day" : "days"
      } of daily food & care`
    );
  }

  return parts.length > 0
    ? `Your donation funded:\n${parts.join("\n")}`
    : "Your donation will help cats in need";
};

const ProfileUpdate = () => {
  const { profile } = useProfile();
  const [twitter, setTwitter] = useState(profile?.twitter);
  const [discord, setDiscord] = useState(profile?.discord);
  const [twitterEditMode, setTwitterEditMode] = useState(false);
  const [discordEditMode, setDiscordEditMode] = useState(false);
  const toast = useToast();
  const { mutate, isPending } = useMutation({
    mutationFn: USER_API.saveProfileTwitter,
    onSuccess: () => {
      toast({ message: "Successfully connected" });
      setTwitterEditMode(false);
      setDiscordEditMode(false);
    },
  });
  const twitterButtonText = twitterEditMode
    ? isPending
      ? "Saving..."
      : "Save"
    : twitter
    ? "Edit"
    : "Connect";
  const onTwitterButtonClick = () => {
    if (!twitterEditMode) {
      setTwitterEditMode(true);
    } else if (twitter?.length) {
      mutate({
        twitter: twitter.trim().replace("@", "").toLowerCase(),
        _id: profile?._id,
      });
    }
  };
  const discordButtonText = discordEditMode
    ? isPending
      ? "Saving..."
      : "Save"
    : discord
    ? "Edit"
    : "Connect";
  const onDiscordButtonClick = () => {
    if (!discordEditMode) {
      setDiscordEditMode(true);
    } else if (discord?.length) {
      mutate({
        discord: discord.trim().replace("@", "").toLowerCase(),
        _id: profile?._id,
      });
    }
  };

  return (
    <div className="flex items-center flex-col justify-center mt-2 mb-2">
      <img className="w-8 -mb-3" src="/icons/social/x.webp" draggable="false" />
      {!twitterEditMode ? (
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
      <span className="-mt-2">
        <PixelButton
          isDisabled={isPending}
          isSmall
          text={twitterButtonText}
          onClick={onTwitterButtonClick}
        />
      </span>
      <img
        className="w-8 -mb-3"
        src="/icons/social/discord.png"
        draggable="false"
      />
      {!discordEditMode ? (
        <Tag isSmall>
          {discord ? `Discord: ${discord}` : "Discord Handle is not connected"}
        </Tag>
      ) : (
        <input
          type="text"
          value={discord}
          onChange={(e) => setDiscord(e.target.value?.slice(0, 24))}
          className="flex-grow px-2 py-1 outline-none text-p5 bg-white rounded-full"
          placeholder="Your Discord Handle"
        />
      )}
      <span className="-mt-2">
        <PixelButton
          isDisabled={isPending}
          isSmall
          text={discordButtonText}
          onClick={onDiscordButtonClick}
        />
      </span>
    </div>
  );
};

export const TelegramProfileContent = () => {
  const { profile, logout, isFB } = useProfile();
  const [isWalletsRevealed, setIsWalletsRevealed] = useState(false);
  const { setOpenedModal } = useGame();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("stats");
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
      {profile?.cat && (
        <div className="m-auto font-primary">
          <span className="relative z-0">
            <Cat profile={profile} />
          </span>
          <div className="relative z-10 md:-mt-6">
            <Tag isSmall>Hello, {profile.name} !</Tag>
          </div>
          <div className="flex justify-center -mb-4">
            <PixelButton
              isSmall
              text="STATS"
              active={activeTab === "stats"}
              onClick={() => setActiveTab("stats")}
            />
            <PixelButton
              isSmall
              text="ACHIEVEMENTS"
              active={activeTab === "achievements"}
              onClick={() => setActiveTab("achievements")}
            />
          </div>
          {activeTab === "stats" && (
            <ul className="flex flex-col items-center mt-4">
              <li className="flex items-center gap-x-2">
                <img draggable={false} className="w-5" src="/logo/coin.webp" />
                <div className="flex font-secondary text-p4 gap-2">
                  Coins:{" "}
                  <span className="font-bold">
                    {commafy(profile.catpoints)}
                  </span>
                </div>
              </li>
              <li className="flex items-center gap-x-2">
                <img
                  draggable={false}
                  className="w-5"
                  src="/logo/catnip.webp"
                />
                <div className="flex font-secondary text-p4 gap-2">
                  CATNIPS:{" "}
                  <span className="font-bold">
                    {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0} /{" "}
                    {Object.keys(CatnipChaosLevelMap).length * 10}
                  </span>
                </div>
              </li>
              <li className="flex items-center gap-x-2">
                <img
                  draggable={false}
                  className="w-7 mb-1 -mr-1 -ml-1"
                  src="/logo/logo.webp"
                />
                <div className="flex font-secondary text-p4 gap-2">
                  $Tails:{" "}
                  <span className="font-bold">
                    {commafy(profile.tails || 0)}
                  </span>
                </div>
              </li>
              <li className="flex items-center gap-x-2">
                <img draggable={false} className="w-5" src="/logo/rocket.png" />
                <div className="flex font-secondary text-p4 gap-2">
                  STREAK:{" "}
                  <span className="font-bold">{profile?.streak || 0}</span>
                </div>
              </li>
              <li className="flex items-center gap-x-2">
                <img
                  draggable={false}
                  className="w-5"
                  src="/logo/friends.png"
                />
                <div className="flex font-secondary text-p4 gap-2">
                  FRIENDS:{" "}
                  <span className="font-bold">
                    {profile?.referralsCount || 0}
                  </span>
                </div>
              </li>
            </ul>
          )}

          {activeTab === "achievements" && (
            <ul>
              <li className="flex items-center gap-x-2 mt-4 justify-center">
                <img draggable={false} className="w-5" src="/logo/coin.webp" />
                <div className="flex font-secondary text-p4 gap-2">
                  CATBASSADORS RECORD:{" "}
                  <span className="font-bold">
                    {profile?.catbassadorsRecord || 0}
                  </span>
                </div>
              </li>
              <li className="flex items-center gap-x-2 justify-center">
                <img
                  draggable={false}
                  className="w-5"
                  src="/logo/catnip.webp"
                />
                <div className="flex font-secondary text-p4 gap-2">
                  COLLECTED CATNIP:{" "}
                  <span className="font-bold">
                    {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0}
                  </span>
                </div>
              </li>
              <li className="flex items-center gap-x-2 justify-center">
                <img draggable={false} className="w-5" src="/logo/human.webp" />
                <div className="flex font-secondary text-p4 gap-2">
                  COMPLETED QUESTS:{" "}
                  <span className="font-bold">
                    {profile?.quests?.length || 0}
                  </span>
                </div>
              </li>
              {profile?.spent > 0 && (
                <li className="flex flex-col gap-x-2">
                  <div className="flex font-secondary text-p4 gap-2 text-center m-auto mt-2 -mb-1">
                    YOUR DONATIONS FUNDED
                  </div>
                  {(() => {
                    const breakdown = calculateDonationBreakdown(profile.spent);
                    const items = [
                      {
                        value: breakdown.extendedCare,
                        label: "extended care & recovery",
                        pluralLabel: "extended care & recoveries",
                      },
                      {
                        value: breakdown.emergencyMedical,
                        label: "emergency medical treatment",
                        pluralLabel: "emergency medical treatments",
                      },
                      {
                        value: breakdown.spayNeuter,
                        label: "spay/neuter surgery",
                        pluralLabel: "spay/neuter surgeries",
                      },
                      {
                        value: breakdown.checkupVaccines,
                        label: "full checkup & vaccinations",
                        pluralLabel: "full checkups & vaccinations",
                      },
                      {
                        value: breakdown.dailyCare,
                        label: "day of daily food & care",
                        pluralLabel: "days of daily food & care",
                      },
                    ];

                    return (
                      <div className="m-auto">
                        {items
                          .filter((item) => item.value > 0)
                          .map((item, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-x-2 mt-1"
                            >
                              <img
                                draggable={false}
                                className="w-4"
                                src="/logo/heart.webp"
                              />
                              <div className="font-secondary text-p5">
                                {item.value}{" "}
                                {item.value === 1
                                  ? item.label
                                  : item.pluralLabel}
                              </div>
                            </div>
                          ))}
                      </div>
                    );
                  })()}
                </li>
              )}
            </ul>
          )}
          <div className="flex justify-center -mb-2">
            <PixelButton
              isSmall
              text="CONTACT US"
              onClick={() => setOpenedModal(GameModal.SUPPORT)}
            />
            {!isWalletsRevealed && (
              <span className="w-full flex justify-center flex-col">
                <PixelButton
                  isSmall
                  text="Reveal My Wallets"
                  onClick={() => setIsWalletsRevealed(true)}
                />
              </span>
            )}
          </div>

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
              <div className="font-primary text-center text-p6 mt-1">
                GENERATED WALLETS FOR IN-GAME USAGE
              </div>
            </li>
          )}
        </div>
      )}
      <div className="flex flex-col justify-center">
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
        className="m-auto z-50 rem:w-[386px] md:w-[549px] max-w-full lg:top-1/2 lg:-translate-y-1/2 lg:h-fit lg:absolute overflow-y-auto max-h-screen rounded-xl shadow"
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
