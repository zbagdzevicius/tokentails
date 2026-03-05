import { bgStyle, cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React from "react";
import { IGameStopEvent } from "../Phaser/events";
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

export const PixelRescueEndGameModal: React.FC<EndGameProps> = ({
  onClose,
  tryAgain,
  gameStop,
}) => {
  const { profile } = useProfile();
  const { level } = useGame();

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
        <div className="p-6 md:py-4 md:pr-2 flex items-center justify-center flex-col gap-1">
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
              src={cdnFile("pixel-rescue/items/heart.webp")}
              alt="Score Icon"
              className="w-6 h-6 mr-2"
              draggable="false"
            />
            <div className="text-p3 lg:text-p2 font-medium flex items-center gap-1">
              collected <Tag>{gameStop.score}</Tag> hearts
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
          <PixelButton text="PLAY AGAIN" onClick={tryAgain} />
          <PixelButton text="MEOW BACK" isSmall onClick={onClose} />
        </div>
      </div>
    </div>
  );
};
