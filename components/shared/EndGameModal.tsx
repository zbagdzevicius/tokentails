import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React from "react";
import { getMultiplier } from "../CatCardModal";
import { CloseButton } from "./CloseButton";
import { Tag } from "./Tag";
import { PixelButton } from "./PixelButton";
import { IGameStopEvent } from "../Phaser/events";

type EndGameProps = {
  onClose: () => void;
  gameType: GameType;
  gameStop: IGameStopEvent;
};

export const EndGameModal: React.FC<EndGameProps> = ({
  onClose,
  gameStop,
  gameType,
}) => {
  const { profile } = useProfile();

  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={onClose}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>

      <div
        className="m-auto z-50 rem:w-[350px] font-secondary md:w-[480px] max-w-full absolute top-1/2 -translate-y-1/2 rounded-lg shadow h-fit animate-appear"
        style={{
          backgroundImage: "url(/base/bg.gif)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <CloseButton onClick={onClose} />
        <div className="p-6 flex items-center justify-center flex-col gap-1">
          <img
            src={
              gameType === GameType.CATBASSADORS
                ? "/game/select/catbassadors.jpg"
                : "/game/select/purrquest.jpg"
            }
            className="w-28 aspect-square rounded-t-lg -mb-4"
            alt="logo"
            draggable="false"
          />
          <Tag>Game Summary</Tag>
          <div className="flex justify-center items-center text-md text-gray-700 mt-4">
            <img
              src="/logo/coin.png"
              alt="Score Icon"
              className="w-6 h-6 mr-2"
              draggable="false"
            />
            <div className="text-p3 lg:text-p2 font-medium flex items-center gap-1">
              collected <Tag>{gameStop.score}</Tag> coins
            </div>
          </div>
          <div className="flex justify-center items-center text-md text-gray-700">
            <img
              src="/icons/clock.png"
              alt="Time Icon"
              className="w-6 h-6 mr-2"
              draggable="false"
            />
            <div className="text-p3 lg:text-p2 font-medium  flex items-center gap-1">
              Played for <span><Tag>{Math.floor(gameStop.time)}</Tag></span>
              seconds
            </div>
          </div>
          <div className="flex justify-center items-center text-md text-gray-700">
            <img className="h-8" src="images/cats-winners/cat.gif"></img>
            <div className="text-p3 lg:text-p2 font-medium mr-1">
              Selected cat MULTIPLIER
            </div>
            <Tag>X{getMultiplier(profile?.cat)}</Tag>
          </div>
          <img
            src="/meme-cats/meme-48.gif"
            className="w-20 aspect-square mt-2 mb-2"
            draggable="false"
          />
          <PixelButton text="LET'S ROLL" onClick={onClose} />
        </div>
      </div>
    </div>
  );
};
