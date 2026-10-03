import { QUEST_API } from "@/api/quest-api";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import {
  CATNIP_CHAOS_LEVEL_CAPS,
  CATNIP_CHAOS_TOTAL_CAP,
  getCatnipBreakdown,
} from "@/constants/catnip-accounting";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { chaptersBadges, IMysteryBox } from "@/web3/web3.model";
import { ftueStore, type FtueAssistName } from "@/components/Phaser/onboarding/ftue-store";
import { ASSIST_COPY } from "@/components/Phaser/onboarding/hints";
import {
  allCleared,
  clearedFlags,
  isUnlocked,
  levelIndex,
  startHere,
} from "@/components/Phaser/onboarding/progress";
import { purrsuitLevelName } from "@/components/Phaser/onboarding/hints";
import { GameType } from "@/models/game";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  catnipChaosChapterBGImage,
  CatnipChaosLevelMap,
  catnipChaosLevelsList,
} from "../Phaser/map";
import { PixelButton } from "../shared/PixelButton";
import { TrailheadsData } from "../shared/QuestsModal";

const MODE = GameType.CATNIP_CHAOS;
const ENDLESS = "01";
/** The playable levels shown on the map, without the endless run. */
const MAP_LEVELS = catnipChaosLevelsList.filter((level) => !level.startsWith("0"));

/** Re-renders when the device's first-run store changes (local clears, assists). */
const useFtueVersion = () =>
  useSyncExternalStore(
    ftueStore.subscribe,
    () => JSON.stringify(ftueStore.snapshot()),
    () => "",
  );

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
  const catnipBreakdown = getCatnipBreakdown({
    catnipChaos: profile?.catnipChaos,
    match3: profile?.match3,
  });
  // Unlocks (plan G10, decision #69): unlocked(i) = i === 0 || cleared[i - 1] over the full list,
  // from the server's cleared array with this device's clears as a cache. A score alone (one
  // catnip on a lost run) unlocks nothing, and INFINITE opens once 1-1 is cleared.
  const ftueVersion = useFtueVersion();
  const flags = useMemo(
    () => clearedFlags(profile, MODE, ftueStore.localClears(MODE), ftueStore.pendingClears(MODE)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, ftueVersion],
  );
  const clearedCount = MAP_LEVELS.filter((level) => flags[levelIndex(MODE, level)]).length;
  const unlocked = (level: string) => isUnlocked(MODE, level, flags);
  const nextUp = startHere(MODE, flags, MAP_LEVELS);
  const everyLevelCleared = allCleared(MODE, flags, MAP_LEVELS);
  const assists = useMemo(
    () => ftueStore.assists(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ftueVersion],
  );

  const selectLevel = (level: string) => {
    if (!unlocked(level)) {
      const position = MAP_LEVELS.indexOf(level);
      showToast({
        message:
          level === ENDLESS
            ? "Clear level 1-1 to unlock Infinite"
            : `Clear level ${purrsuitLevelName(MAP_LEVELS[position - 1])} to unlock this one`,
        img: cdnFile("purrquest/sprites/key.png"),
      });
      return;
    }
    setSelectedLevel(level);
  };
  const setAssist = (name: FtueAssistName, on: boolean) => ftueStore.setAssist(name, on);

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
    [profile?.quests]
  );
  return (
    <div className="flex flex-col items-center gap-4 mt-14 lg:mt-24 pb-20 animate-opacity pt-8">
      <div className="flex flex-row items-center gap-8 font-primary">
        <div className="flex flex-col items-center gap-x-2 bg-tt-cream/50 rounded-lg px-2 pb-2 border-4 border-tt-gold-shadow">
          <div className="text-p4 flex items-center gap-1">
            <CatnipIcon size={16} alt="" />
            <div>CATNIP</div>
          </div>
          <div className="flex items-center text-p5 bg-green-300/50 border border-tt-gold-shadow rounded-lg w-full justify-center">
            {catnipBreakdown.catnipChaosCount} / {CATNIP_CHAOS_TOTAL_CAP}
          </div>
        </div>

        <div className="flex flex-col items-center gap-x-2 bg-tt-cream/50 rounded-lg px-2 pb-2 border-4 border-tt-gold-shadow">
          <div className="text-p4 flex items-center gap-1">
            <img
              draggable={false}
              className="w-4 h-4"
              src={cdnFile("purrquest/sprites/key.png")}
            />
            <div>CLEARED</div>
          </div>
          <div className="flex items-center text-p5 bg-tt-gold-shadow/20 border border-tt-gold-shadow rounded-lg w-full justify-center">
            {clearedCount}
            <span>/{Object.keys(CatnipChaosLevelMap).length - 1}</span>
          </div>
        </div>
      </div>
      <div
        onClick={() => selectLevel(ENDLESS)}
        data-testid="purrsuit-level-01"
        data-locked={!unlocked(ENDLESS) || undefined}
        style={{
          backgroundImage: `url(${catnipChaosChapterBGImage["0"]})`,
          backgroundSize: "cover",
          backgroundPosition: "top",
        }}
        className="hover:brightness-110 clickable relative border-4 border-tt-gold-shadow hover:border-4 hover:border-tt-cream hover:scale-110 transition-all flex flex-col items-center justify-center w-20 h-20 glow-box"
      >
        <div className="z-10 text-center flex items-center justify-center text-p1 leading-none font-primary">
          <span className="text-tt-cream drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
            INFINITE
          </span>
        </div>
        <span className="font-primary text-p6 flex items-center">
          <CatnipIcon size={16} className="mr-1" alt="Catnip" />
          <span className="">{catnipBreakdown.catnipChaos?.[0] || 0} /{" "}
            {CATNIP_CHAOS_LEVEL_CAPS[0]}
          </span>
        </span>
        {!unlocked(ENDLESS) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-1" aria-label="Locked: clear 1-1 first">
            <img className="w-8 h-8" alt="" src={cdnFile("purrquest/sprites/key.png")} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 relative justify-center max-w-[44rem] bg-gradient-to-b from-tt-gold-shadow/20 to-tt-gold-shadow/70 md:rounded-lg pb-32 pt-8 mt-8 md:mt-16 border-y-4 md:border-4 border-tt-cream/50">
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
        {MAP_LEVELS
          .map((level, i) => (
            <div className="flex items-center" key={i}>
              <div
                key={i}
                onClick={() => selectLevel(level)}
                data-testid={`purrsuit-level-${level}`}
                data-locked={!unlocked(level) || undefined}
                data-cleared={flags[levelIndex(MODE, level)] || undefined}
                style={{
                  backgroundImage: `url(${
                    catnipChaosChapterBGImage[
                      level.length === 3 ? `${level[0]}${level[1]}` : level[0]
                    ]
                  })`,
                  backgroundSize: "cover",
                  backgroundPosition: "top",
                }}
                className="hover:brightness-110 clickable relative border-4 border-tt-gold-shadow hover:border-4 hover:border-tt-cream hover:scale-110 transition-all flex flex-col items-center justify-center w-20 h-20 glow-box"
              >
                <div className="z-10 text-center flex items-center justify-center text-p1 leading-none font-primary">
                  <span className="text-tt-cream drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                    {level?.length === 3
                      ? `${level[0]}${level[1]}-${level[2]}`
                      : level?.split("").join("-")}
                  </span>
                </div>
                {!unlocked(level) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg p-1 w-full h-full z-20">
                    <img
                      className="w-8 h-8"
                      alt=""
                      src={cdnFile("purrquest/sprites/key.png")}
                    />
                  </div>
                )}
                {level === nextUp && (
                  <span
                    className="pointer-events-none absolute -bottom-4 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full bg-tt-gold-400 px-2 py-[2px] font-secondary text-p6 uppercase tracking-wider text-tt-gold-ink shadow-[0_2px_0_rgb(var(--tt-gold-shadow))] motion-safe:animate-pulse"
                    data-testid="purrsuit-start-here"
                  >
                    Start here
                  </span>
                )}
                <span className="font-primary text-p6 flex items-center pl-1 pr-1 bg-tt-cream/50">
                  <CatnipIcon size={16} className="mr-1" alt="Catnip" />
                  <span className="">
                    {catnipBreakdown.catnipChaos?.[i + 1] || 0} / {CATNIP_CHAOS_LEVEL_CAPS[i + 1]}
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
                    flags[levelIndex(MODE, level)] ? "pb-8 -mt-2" : ""
                  }`}
                >
                  {flags[levelIndex(MODE, level)] && (
                    <div className="flex flex-col items-center absolute -bottom-5">
                      {!!isRedeemed(
                        chaptersBadges[
                          parseInt(
                            level.length === 3
                              ? `${level[0]}${level[1]}`
                              : level[0]
                          ) - 1
                        ]
                      ) ? (
                        <PixelButton
                          text="REDEEMED"
                          disabled
                          size="sm"
                        ></PixelButton>
                      ) : (
                        <PixelButton
                          text="REDEEM"
                          size="sm"
                          onClick={() =>
                            onRedeem(
                              chaptersBadges[
                                parseInt(
                                  level.length === 3
                                    ? `${level[0]}${level[1]}`
                                    : level[0]
                                ) - 1
                              ]
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
                      }.webp`
                    )}
                    className="w-16 h-16 rounded-t-xl glow-box"
                  />
                  {!flags[levelIndex(MODE, level)] && (
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
        {/* G14, decision #94: no promise of new levels. The notice shows only once every level
            is cleared (server cleared state, with this device's clears as a cache). */}
        {everyLevelCleared && (
          <div
            className="mx-4 mt-16 flex w-full max-w-[28rem] flex-col items-center gap-1 rounded-lg bg-tt-night-800/90 px-4 py-3 text-center ring-2 ring-inset ring-tt-gold-500/70"
            role="status"
            data-testid="purrsuit-all-cleared"
          >
            <p className="font-primary text-p2 leading-none text-tt-gold-400">Every level cleared!</p>
            <p className="font-sans text-p5 font-bold text-tt-cream">
              You have run all {MAP_LEVELS.length} levels. Your clears are kept; chase your best catnip, or see how far Infinite goes.
            </p>
          </div>
        )}
      </div>
      <AssistsPanel assists={assists} onChange={setAssist} />
    </div>
  );
};

/**
 * Assists (plan G10, decision #71): they do not flag runs, since Purrsuit has no ranked board.
 * Stored on this device (ftue-store).
 */
const AssistsPanel = ({
  assists,
  onChange,
}: {
  assists: Record<FtueAssistName, boolean>;
  onChange: (name: FtueAssistName, on: boolean) => void;
}) => (
  <section
    aria-labelledby="purrsuit-assists-title"
    className="mx-4 mt-6 flex w-full max-w-[28rem] flex-col gap-2 rounded-lg bg-tt-night-800/90 px-4 py-3 ring-2 ring-inset ring-tt-gold-500/50"
    data-testid="purrsuit-assists"
  >
    <h2 id="purrsuit-assists-title" className="font-secondary text-p4 uppercase tracking-wider text-tt-gold-400">
      Assists
    </h2>
    {(Object.keys(ASSIST_COPY) as FtueAssistName[]).map((name) => (
      <label key={name} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="font-sans text-p5 font-extrabold text-tt-cream">{ASSIST_COPY[name].name}</span>
          <span className="font-sans text-p6 font-bold text-tt-muted">{ASSIST_COPY[name].line}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={assists[name]}
          checked={assists[name]}
          onChange={(event) => onChange(name, event.target.checked)}
          className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-tt-night-500 ring-2 ring-inset ring-tt-gold-500/60 transition-colors checked:bg-tt-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 relative before:absolute before:left-1 before:top-1 before:h-4 before:w-4 before:rounded-full before:bg-tt-cream before:transition-transform checked:before:translate-x-5"
        />
      </label>
    ))}
  </section>
);
