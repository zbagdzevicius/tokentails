import { USER_API } from "@/api/user-api";
import { bgStyle, cdnFile, commafy } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameModal } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  getCatnipBreakdown,
  TOTAL_CATNIP_CAP,
} from "@/constants/catnip-accounting";
import { CloseButton } from "./CloseButton";
import { GameMusicToggle } from "./GameMusicToggler";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { isApp } from "@/models/app";

const Cat = ({ profile }: { profile?: IProfile | null }) => {
  return (
    <div className="relative">
      <img
        draggable={false}
        className="w-24 m-auto pixelated -mt-2 -mb-8 md:mb-0 md:-mt-8 relative z-10"
        src={profile?.cat?.catImg || "/logo/logo.webp"}
      />
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
      <img
        className="w-8 -mb-3"
        src={cdnFile("icons/social/x.webp")}
        draggable="false"
      />
      {!twitterEditMode ? (
        <Tag isSmall>{twitter ? `X: ${twitter}` : "X is not connected"}</Tag>
      ) : (
        <input
          type="text"
          value={twitter}
          onChange={(e) => setTwitter(e.target.value?.slice(0, 24))}
          className="flex-grow px-2 py-1 outline-none text-p5 bg-white rounded-full border-1 border-yellow-900"
          placeholder="Your X Handle"
          autoFocus
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
        src={cdnFile("icons/social/discord.webp")}
        draggable="false"
      />
      {!discordEditMode ? (
        <Tag isSmall>
          {discord ? `Discord: ${discord}` : "Discord is not connected"}
        </Tag>
      ) : (
        <input
          type="text"
          value={discord}
          onChange={(e) => setDiscord(e.target.value?.slice(0, 24))}
          className="flex-grow px-2 py-1 outline-none text-p5 bg-white rounded-full border-1 border-yellow-900"
          placeholder="Your Discord Handle"
          autoFocus
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
  const catnipBreakdown = getCatnipBreakdown({
    catnipChaos: profile?.catnipChaos,
    match3: profile?.match3,
  });
  const [isWalletsRevealed, setIsWalletsRevealed] = useState(false);
  const [isDeleteRequestModalOpen, setIsDeleteRequestModalOpen] =
    useState(false);
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
    <div className="pt-4 pb-8 md:pb-4 px-4 md:pt-4 text-yellow-900 flex flex-col md:flex-row md:gap-4 justify-between items-center animate-appear">
      {profile?.cat && (
        <div className="m-auto font-primary">
          <span className="relative z-0">
            <Cat profile={profile} />
          </span>
          <div className="relative z-10 md:-mt-6">
            <div className="font-paws text-p3 text-center">
              Hello, {profile.name}
            </div>
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
              text="MY IMPACT"
              active={activeTab === "achievements"}
              onClick={() => setActiveTab("achievements")}
            />
            <PixelButton
              isSmall
              text="SUPPORT"
              onClick={() => setOpenedModal(GameModal.SUPPORT)}
            />
          </div>
          {activeTab === "stats" && (
            <section className="flex justify-between mt-4">
              <div className="flex flex-col items-center gap-x-2">
                <div className="text-p5 flex items-center gap-1">
                  <img
                    draggable={false}
                    className="w-4 h-4"
                    src={cdnFile("logo/catnip.webp")}
                  />
                  <div>CATNIP</div>
                </div>
                <div className="flex items-center text-p6 bg-green-300/50 border border-yellow-900 rounded-lg w-full justify-center">
                  {catnipBreakdown.totalCount} / {TOTAL_CATNIP_CAP}
                </div>
              </div>
              <div className="flex flex-col items-center gap-x-2">
                <div className="text-p5 flex items-center gap-1">
                  <img
                    draggable={false}
                    className="h-4"
                    src={cdnFile("logo/logo.webp")}
                  />
                  <div>$TAILS</div>
                </div>
                <div className="flex items-center gap-2 bg-yellow-300/50 border border-yellow-900 rounded-lg w-full justify-center">
                  <div className="text-p6">
                    {profile?.tails?.toFixed(0) || 0}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-x-2">
                <div className="text-p5 flex items-center gap-1">
                  <img
                    draggable={false}
                    className="w-5"
                    src={cdnFile("logo/rocket.png")}
                  />
                  <div>CHECKS</div>
                </div>
                <div className="flex items-center text-p6 bg-blue-300/50 border border-yellow-900 rounded-lg w-full justify-center">
                  <div className="text-p6">{profile?.streak || 0}</div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-x-2">
                <div className="text-p5 flex items-center gap-1">
                  <img
                    draggable={false}
                    className="w-4 h-4"
                    src={cdnFile("logo/friends.png")}
                  />
                  <div>INVITES</div>
                </div>
                <div className="flex items-center text-p6 bg-red-300/50 border border-yellow-900 rounded-lg w-full justify-center">
                  <div className="text-p6">{profile?.referralsCount || 0}</div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "achievements" && (
            <ul>
              {profile?.spent > 0 ? (
                <li className="flex flex-col gap-x-2 mt-2">
                  <div className="flex font-secondary text-p4 gap-2 text-center m-auto mt-2 -mb-1">
                    <img
                      draggable={false}
                      className="w-5"
                      src={cdnFile("logo/human.webp")}
                    />
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
                                src={cdnFile("logo/heart.webp")}
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
              ) : (
                <div className="text-p5 font-secondary text-center m-auto mt-4 -mb-1">
                  FIRST ADOPT A CAT
                </div>
              )}
            </ul>
          )}

          {isFB && (
            <div className="mt-4">
              <PixelButton isSmall text="Logout :(" onClick={logout} />
            </div>
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
        {isApp && (
          <PixelButton
            isSmall
            text="Delete Account"
            onClick={() => {
              setIsDeleteRequestModalOpen(true),
                toast({
                  message:
                    "Delete request sent to support. It'll be handled within 24 hours",
                });
            }}
          />
        )}
      </div>
    </div>
  );
};

export const TelegramProfile = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full mb-2">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300/50 md:backdrop-blur-md animate-in fade-in duration-300"
      ></div>
      <div
        className="m-auto z-50 rem:w-[400px] md:w-[600px] max-w-full lg:top-1/2 lg:-translate-y-1/2 lg:h-fit lg:absolute overflow-y-auto max-h-screen rounded-xl shadow border-4 border-yellow-300 glow-box"
        style={bgStyle("4")}
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
