import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React from "react";
import { CloseButton } from "./CloseButton";
import { Tag } from "./Tag";
import { PixelButton } from "./PixelButton";
import { IGameStopEvent } from "../Phaser/events";
import { getMultiplier } from "@/constants/cat-utils";
import { useGame } from "@/context/GameContext";

type EndGameProps = {
  onClose: () => void;
  tryAgain: () => void;
  gameType: GameType;
  gameStop: IGameStopEvent;
};

const gameTypeToImage = {
  [GameType.CATBASSADORS]: "/game/select/catbassadors.jpg",
  [GameType.CATNIP_CHAOS]: "/game/select/catnip-chaos.webp",
  [GameType.SHELTER]: "/game/select/shelter.jpg",
  [GameType.HOME]: "/game/select/home.jpg",
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
        className="m-auto z-50 rem:w-[350px] font-secondary md:w-[480px] flex flex-col md:flex-row max-w-full absolute top-1/2 -translate-y-1/2 rounded-lg shadow h-fit animate-appear"
        style={{
          backgroundImage: "url(/backgrounds/bg-4.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <CloseButton onClick={onClose} absolute />
        <div className="p-6 md:py-4 flex items-center justify-center flex-col gap-1">
          <img
            src={gameTypeToImage[gameType]}
            className="w-28 aspect-square rounded-t-lg -mb-4"
            alt="logo"
            draggable="false"
          />
          <Tag>
            {level ? `Level ${level.split("").join("-")}` : "Match"} Summary
          </Tag>
          <div className="flex justify-center items-center text-md text-gray-700 mt-4">
            <img
              src={
                gameType === GameType.CATNIP_CHAOS
                  ? "/logo/catnip.webp"
                  : "/logo/coin.png"
              }
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
            <div className="flex justify-center items-center text-md text-gray-700">
              <img
                src="/icons/clock.png"
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
          <div className="flex justify-center items-center text-md text-gray-700">
            <img className="h-8" src={profile?.cat?.catImg}></img>
            <div className="text-p3 lg:text-p2 font-medium mr-1 whitespace-nowrap">
              Selected cat MULTIPLIER
            </div>
            <Tag>X{getMultiplier(profile?.cat)}</Tag>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 pb-4 md:pb-0">
          <img
            src="/meme-cats/meme-48.gif"
            className="w-20 aspect-square"
            draggable="false"
          />
          <PixelButton text="MEOW BACK" isSmall onClick={onClose} />
          <PixelButton text="TRY AGAIN" onClick={tryAgain} />
        </div>
      </div>
    </div>
  );
};
