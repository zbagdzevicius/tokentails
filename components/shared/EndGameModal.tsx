import { bgStyle, cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React from "react";
import { IGameStopEvent } from "../Phaser/events";
import { getNextCatnipChaosLevel, lastCatnipChaosLevel } from "../Phaser/map";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";

type EndGameProps = {
  onClose: () => void;
  tryAgain: (nextLevel?: string) => void;
  gameType: GameType;
  gameStop: IGameStopEvent;
};

const getGameLevelName = (level: string) => {
  if (!level.startsWith("0")) {
    return `Level ${
      level.length === 3
        ? `${level[0]}${level[1]}-${level[2]}`
        : level.split("").join("-")
    }`;
  }

  return "PURRSUIT";
};

export const EndGameModal: React.FC<EndGameProps> = ({
  onClose,
  tryAgain,
  gameStop,
  gameType,
}) => {
  const { profile } = useProfile();
  const { level } = useGame();

  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={onClose}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>

      <div
        className="m-auto z-50 rem:w-[350px] font-secondary md:w-[480px] flex flex-col md:flex-row max-w-full absolute top-1/2 -translate-y-1/2 rounded-lg shadow h-fit animate-opacity border-4 border-yellow-300 glow-box"
        style={bgStyle("4")}
      >
        <CloseButton onClick={onClose} absolute />
        <div className="p-6 md:py-4 flex items-center justify-center flex-col gap-1">
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
          <Tag>{level ? getGameLevelName(level) : "Match"} Summary</Tag>
          <div className="flex justify-center items-center text-md text-yellow-900 mt-4">
            <img
              src={cdnFile("logo/catnip.webp")}
              alt="Score Icon"
              className="w-6 h-6 mr-2"
              draggable="false"
            />
            <div className="text-p3 lg:text-p2 font-medium flex items-center gap-1">
              collected <Tag>{gameStop.score}</Tag>{" "}
              {gameType === GameType.CATNIP_CHAOS ? "catnip" : "coins"}
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
        <div className="flex flex-col items-center justify-center gap-2 pb-4 md:pb-0">
          <span
            className={`${
              !!gameStop.completedLevel &&
              gameStop.completedLevel !== lastCatnipChaosLevel
                ? "-mb-4"
                : "-mb-2"
            }`}
          >
            <PixelButton text="MEOW BACK" isSmall onClick={onClose} />
          </span>
          <PixelButton
            text="PLAY AGAIN"
            onClick={tryAgain}
            isSmall={
              !!gameStop.completedLevel &&
              gameStop.completedLevel !== lastCatnipChaosLevel
            }
          />
          {!!gameStop.completedLevel &&
            gameStop.completedLevel !== lastCatnipChaosLevel &&
            gameType === GameType.CATNIP_CHAOS && (
              <PixelButton
                text="NEXT LEVEL"
                onClick={() =>
                  tryAgain(getNextCatnipChaosLevel(gameStop.completedLevel!))
                }
              />
            )}
        </div>
      </div>
    </div>
  );
};
