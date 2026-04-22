import { bgStyle, cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React from "react";
import { IGameStopEvent } from "../Phaser/events";
import { getNextCatnipChaosLevel, lastCatnipChaosLevel } from "../Phaser/map";
import {
  MATCH3_LEVELS,
  MATCH3_LEVEL_BY_ID,
  getNextMatch3LevelId,
} from "../Match3/match3.config";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";

type EndGameProps = {
  onClose: () => void;
  tryAgain: (nextLevel?: string) => void;
  gameType: GameType;
  gameStop: IGameStopEvent;
};

const getGameLevelName = (level: string, gameType: GameType) => {
  if (gameType === GameType.MATCH_3) {
    const match3Level = MATCH3_LEVEL_BY_ID[level];
    if (match3Level) {
      return `Level ${match3Level.id} • ${match3Level.name}`;
    }
    return `Level ${level}`;
  }

  if (!level.startsWith("0")) {
    return `Level ${
      level.length === 3
        ? `${level[0]}${level[1]}-${level[2]}`
        : level.split("").join("-")
    }`;
  }

  return "PURRSUIT";
};

const gameTypeScoreMeta: Record<GameType, { icon: string; label: string }> = {
  [GameType.SHELTER]: {
    icon: cdnFile("logo/logo.webp"),
    label: "coins",
  },
  [GameType.HOME]: {
    icon: cdnFile("logo/logo.webp"),
    label: "coins",
  },
  [GameType.CATNIP_CHAOS]: {
    icon: cdnFile("logo/catnip.webp"),
    label: "catnip",
  },
  [GameType.PIXEL_RESCUE]: {
    icon: cdnFile("pixel-rescue/items/heart.webp"),
    label: "hearts",
  },
  [GameType.MATCH_3]: {
    icon: cdnFile("logo/catnip.webp"),
    label: "catnip",
  },
};

export const EndGameModal: React.FC<EndGameProps> = ({
  onClose,
  tryAgain,
  gameStop,
  gameType,
}) => {
  const { profile } = useProfile();
  const { level } = useGame();
  const scoreMeta = gameTypeScoreMeta[gameType];
  const lastMatch3Level = MATCH3_LEVELS[MATCH3_LEVELS.length - 1]?.id;
  const nextMatch3Level =
    gameType === GameType.MATCH_3 && gameStop.completedLevel
      ? getNextMatch3LevelId(gameStop.completedLevel)
      : null;
  const showCatnipChaosNextLevel =
    gameType === GameType.CATNIP_CHAOS &&
    !!gameStop.completedLevel &&
    gameStop.completedLevel !== lastCatnipChaosLevel;
  const showMatch3NextLevel =
    gameType === GameType.MATCH_3 &&
    !!gameStop.completedLevel &&
    gameStop.completedLevel !== lastMatch3Level &&
    !!nextMatch3Level;
  const hasNextLevelAction = showCatnipChaosNextLevel || showMatch3NextLevel;
  const summaryTitle = `${level ? getGameLevelName(level, gameType) : "Match"} Summary`;

  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={onClose}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300/50 md:backdrop-blur-md animate-in fade-in duration-300"
      ></div>

      <div
        className="m-auto z-50 rem:w-[350px] font-secondary md:w-[520px] flex flex-col md:flex-row max-w-full absolute top-1/2 -translate-y-1/2 rounded-lg shadow h-fit animate-opacity border-4 border-yellow-300 glow-box overflow-hidden"
        style={bgStyle("4")}
      >
        <CloseButton onClick={onClose} absolute />
        <div className="p-6 md:py-4 md:pr-2 flex items-center justify-center flex-col gap-1 md:w-[calc(100%-220px)] md:min-w-0">
          <div className="flex">
            <img
              src={cdnFile("meme-cats/meme-48.gif")}
              className="w-12 -mb-2 aspect-square"
              draggable="false"
            />
            <div className="flex justify-center items-center text-md text-yellow-900">
              <img
                className="h-24 -mt-6 pixelated -mb-8"
                src={profile?.cat?.catImg}
              ></img>
            </div>
          </div>
          <div className="mx-auto max-w-full border-4 border-yellow-900 rounded-md bg-gradient-to-r from-pink-500 to-yellow-900 px-4 py-2 text-center font-primary font-normal text-pink-100 leading-[0.95] text-p4 md:text-p3 whitespace-normal break-words">
            {summaryTitle}
          </div>
          <div className="flex justify-center items-center text-md text-yellow-900 mt-4">
            <img
              src={scoreMeta.icon}
              alt="Score Icon"
              className="w-6 h-6 mr-2"
              draggable="false"
            />
            <div className="text-p3 lg:text-p2 font-medium flex items-center gap-1">
              collected <Tag>{gameStop.score}</Tag> {scoreMeta.label}
            </div>
          </div>
          {!!gameStop.time && (
            <div className="flex justify-center items-center text-md text-yellow-900">
              <img
                src={cdnFile("icons/clock.png")}
                alt="Time Icon"
                className="w-6 h-6 mr-2"
                draggable="false"
              />
              <div className="text-p3 lg:text-p2 font-medium  flex items-center gap-1">
                Played for{" "}
                <span>
                  <Tag>{Math.floor(gameStop.time)}</Tag>
                </span>
                seconds
              </div>
            </div>
          )}
        </div>
        <div className="flex w-full flex-col items-center justify-end gap-3 px-4 pb-4 pt-2 md:w-[220px] md:justify-center md:gap-2 md:pb-4 md:pt-14">
          <PixelButton
            text="PLAY AGAIN"
            onClick={tryAgain}
            isSmall={hasNextLevelAction}
          />
          {showCatnipChaosNextLevel && (
            <PixelButton
              text="NEXT LEVEL"
              onClick={() =>
                tryAgain(getNextCatnipChaosLevel(gameStop.completedLevel!))
              }
            />
          )}
          {showMatch3NextLevel && nextMatch3Level && (
            <PixelButton
              text="NEXT LEVEL"
              onClick={() => tryAgain(nextMatch3Level)}
            />
          )}
          <PixelButton text="MEOW BACK" isSmall onClick={onClose} />
        </div>
      </div>
    </div>
  );
};
