import { QUEST_API } from "@/api/quest-api";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { chaptersBadges, IMysteryBox } from "@/web3/web3.model";
import { useCallback } from "react";
import {
  catnipChaosChapterBGImage,
  CatnipChaosLevelMap,
  catnipChaosLevelsList,
  totalCatnip,
} from "../Phaser/map";
import { PixelButton } from "../shared/PixelButton";
import { TrailheadsData } from "../shared/QuestsModal";
import { Countdown } from "../shared/Countdown";
import { Tag } from "../shared/Tag";

const levelCharacter: Record<string, string> = {
  "41": "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/STICKY/base/RUNNING.gif",
  "51": TrailheadsData[0].icon,
  "52": TrailheadsData[1].icon,
  "53": TrailheadsData[2].icon,
  "54": TrailheadsData[3].icon,
  "55": TrailheadsData[4].icon,
  "56": TrailheadsData[5].icon,
  "61": "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YAK/base/RUNNING.gif",
  "81": "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/SEI/base/SITTING.gif",
  "83": "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/ELDREM/base/RUNNING.gif",
  "85": "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/AMBERCLAW/base/RUNNING.gif",
  "93": "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/SOLO-SURVIVOR/base/IDLE.gif",
  "101":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/EGGY/base/IDLE.gif",
  "102":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/SABLE/base/IDLE.gif",
  "103":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/CHARMIE/base/IDLE.gif",
  "104":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/NOELLE/base/IDLE.gif",
  "105":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/LAVA/base/IDLE.gif",
  "106":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/TROUFAS/base/IDLE.gif",
  "111":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OBI/base/DIGGING.gif",
  "112":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/ALBUS/base/DIGGING.gif",
  "113":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/IZZY/base/DIGGING.gif",
  "114":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MERLOT/base/DIGGING.gif",
  "115":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PICKLES/base/DIGGING.gif",
  "116":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OLIVE/base/DIGGING.gif",
  "121":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RASCAL/base/SITTING.gif",
  "122":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FICUS/base/SITTING.gif",
  "123":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MILTON/base/SITTING.gif",
  "124":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/COCO/base/SITTING.gif",
  "125":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/ROY/base/SITTING.gif",
  "126":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BOB/base/SITTING.gif",
  "131":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MINNIE/base/RUNNING.gif",
  "132":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/CHESTER/base/RUNNING.gif",
  "133":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/LADY/base/RUNNING.gif",
  "134":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/TOM/base/RUNNING.gif",
  "135":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PORK/base/RUNNING.gif",
  "136":
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/WALLACE/base/RUNNING.gif",
};

export const CatnipChaosLevels = ({
  setSelectedLevel,
}: {
  setSelectedLevel: (level: string) => void;
}) => {
  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const unlockedLevels = [...(profile?.catnipChaos || [])].filter(
    (level) => level > 0,
  ).length;

  const selectLevel = (level: string, index: number) => {
    if (index > unlockedLevels) {
      showToast({
        message: "You need to complete previous levels to play this level",
        img: cdnFile("purrquest/sprites/key.png"),
      });
      return;
    }
    setSelectedLevel(level);
  };

  const onRedeem = async (mysteryBox: IMysteryBox) => {
    const result = await QUEST_API.complete(mysteryBox.key);
    if (result.success) {
      setProfileUpdate({
        quests: [...(profile?.quests || []), mysteryBox.key],
        tails: (profile?.tails || 0) + 100,
      });
      showToast({ message: result.message });
    }
  };

  const isRedeemed = useCallback(
    (mysteryBox: IMysteryBox) => {
      return !!profile?.quests?.includes(mysteryBox.key);
    },
    [profile?.quests],
  );
  return (
    <div className="flex flex-col items-center gap-4 mt-14 lg:mt-24 pb-20 animate-opacity pt-8">
      <div className="flex flex-row items-center gap-8 font-primary">
        <div className="flex flex-col items-center gap-x-2 bg-yellow-300/50 rounded-lg px-2 pb-2 border-4 border-yellow-900">
          <div className="text-p4 flex items-center gap-1">
            <img
              draggable={false}
              className="w-4 h-4"
              src={cdnFile("logo/catnip.webp")}
            />
            <div>CATNIP</div>
          </div>
          <div className="flex items-center text-p5 bg-green-300/50 border border-yellow-900 rounded-lg w-full justify-center">
            {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0} /{" "}
            {totalCatnip}
          </div>
        </div>

        <div className="flex flex-col items-center gap-x-2 bg-yellow-300/50 rounded-lg px-2 pb-2 border-4 border-yellow-900">
          <div className="text-p4 flex items-center gap-1">
            <img
              draggable={false}
              className="w-4 h-4"
              src={cdnFile("purrquest/sprites/key.png")}
            />
            <div>COMPLETED</div>
          </div>
          <div className="flex items-center text-p5 bg-yellow-900/20 border border-yellow-900 rounded-lg w-full justify-center">
            {profile?.catnipChaos?.length || 0}
            <span>/{Object.keys(CatnipChaosLevelMap).length}</span>
          </div>
        </div>
      </div>

      {!!profile?.catnipChaos?.length && profile?.catnipChaos?.length >= 6 && (
        <span className="mb-2">
          <Tag>YOUR DISCOUNT CODE: SEI</Tag>
        </span>
      )}
      <div
        onClick={() => setSelectedLevel("01")}
        style={{
          backgroundImage: `url(${catnipChaosChapterBGImage["0"]})`,
          backgroundSize: "cover",
          backgroundPosition: "top",
        }}
        className="hover:brightness-110 clickable relative border-4 border-yellow-900 hover:border-4 hover:border-yellow-300 hover:scale-110 transition-all flex flex-col items-center justify-center w-20 h-20 glow-box"
      >
        <div className="z-10 text-center flex items-center justify-center text-p1 leading-none font-primary">
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
            INFINITE
          </span>
        </div>
        <span className="font-primary text-p6 flex items-center">
          <img src={cdnFile("logo/catnip.webp")} className="w-4 h-4 mr-1" />
          <span className="">{profile?.catnipChaos?.[0] || 0} / 420</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-4 relative justify-center max-w-[44rem] bg-gradient-to-b from-yellow-900/20 to-yellow-900/70 md:rounded-lg pb-32 pt-8 mt-8 md:mt-16 border-y-4 md:border-4 border-yellow-300/50">
        <img
          src={cdnFile("tail/cat-promo.webp")}
          className="absolute -top-36 md:-top-44 right-0 w-32 md:w-36 h-auto"
        />
        <img
          src={cdnFile("catnip-chaos/top-border.webp")}
          className="absolute -top-8 md:-top-16 left-0 right-0 w-full h-auto"
        />

        <img
          src={cdnFile("catnip-chaos/top-border.webp")}
          className="absolute -bottom-6 md:-bottom-12 left-0 right-0 w-full h-auto"
        />
        {catnipChaosLevelsList
          .filter((level) => !level.startsWith("0"))
          .map((level, i) => (
            <div className="flex items-center" key={i}>
              <div
                key={i}
                onClick={() => selectLevel(level, i)}
                style={{
                  backgroundImage: `url(${
                    catnipChaosChapterBGImage[
                      level.length === 3 ? `${level[0]}${level[1]}` : level[0]
                    ]
                  })`,
                  backgroundSize: "cover",
                  backgroundPosition: "top",
                }}
                className="hover:brightness-110 clickable relative border-4 border-yellow-900 hover:border-4 hover:border-yellow-300 hover:scale-110 transition-all flex flex-col items-center justify-center w-20 h-20 glow-box"
              >
                <div className="z-10 text-center flex items-center justify-center text-p1 leading-none font-primary">
                  <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                    {level?.length === 3
                      ? `${level[0]}${level[1]}-${level[2]}`
                      : level?.split("").join("-")}
                  </span>
                </div>
                {!(unlockedLevels >= i) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg p-1 w-full h-full z-20">
                    <img
                      className="w-8 h-8"
                      src={cdnFile("purrquest/sprites/key.png")}
                    />
                  </div>
                )}
                <span className="font-primary text-p6 flex items-center pl-1 pr-1 bg-yellow-300/50">
                  <img
                    src={cdnFile("logo/catnip.webp")}
                    className="w-4 h-4 mr-1"
                  />
                  <span className="">
                    {profile?.catnipChaos?.[i + 1] || 0} / 10
                  </span>
                </span>
                {!!levelCharacter[level] && (
                  <img
                    src={levelCharacter[level]}
                    className="w-12 mb-24 rounded-2xl absolute left-1/2 -translate-x-1/2 z-40 pixelated -top-6"
                  />
                )}
              </div>
              {(level.length === 3 ? level[2] === "6" : level[1] === "6") && (
                <div
                  className={`flex flex-col items-center ml-4 xl:ml-8 h-full relative ${
                    unlockedLevels >= i ? "pb-8 -mt-2" : ""
                  }`}
                >
                  {unlockedLevels >= i && (
                    <div className="flex flex-col items-center absolute -bottom-5">
                      {!!isRedeemed(
                        chaptersBadges[
                          parseInt(
                            level.length === 3
                              ? `${level[0]}${level[1]}`
                              : level[0],
                          ) - 1
                        ],
                      ) ? (
                        <PixelButton
                          text="REDEEMED"
                          isDisabled
                          isSmall
                        ></PixelButton>
                      ) : (
                        <PixelButton
                          text="REDEEM"
                          isSmall
                          onClick={() =>
                            onRedeem(
                              chaptersBadges[
                                parseInt(
                                  level.length === 3
                                    ? `${level[0]}${level[1]}`
                                    : level[0],
                                ) - 1
                              ],
                            )
                          }
                        ></PixelButton>
                      )}
                    </div>
                  )}
                  <img
                    src={cdnFile(
                      `catnip-chaos/badges/chapter${
                        level.length === 3 ? `${level[0]}${level[1]}` : level[0]
                      }.webp`,
                    )}
                    className="w-16 h-16 rounded-t-xl glow-box"
                  />
                  {!(unlockedLevels >= i) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-1 w-full h-full z-20 rounded-xl">
                      <img
                        className="w-8 h-8"
                        src={cdnFile("purrquest/sprites/key.png")}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        <div className="flex flex-col items-center justify-center w-full mt-16">
          <Countdown isBig isDaysDisplayed targetDate={new Date(2026, 1, 0)} />
          <div className="text-h4 text-center font-primary mt-4 glow">
            MORE COMING SOON
          </div>
          <div className="text-p4 text-center font-primary -mt-2">
            STAY TUNED FOR MORE INFO ABOUT PURRSUIT!
          </div>
        </div>
      </div>
    </div>
  );
};
