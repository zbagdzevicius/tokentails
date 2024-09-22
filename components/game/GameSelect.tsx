import { GameType } from "@/models/game";
import React from "react";
import { PixelButton } from "../button/PixelButton";

interface IProps {
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
}

export const GameSelect = ({ setGameType, gameType }: IProps) => {
  return (
    <div className="fixed inset-0 z-0 flex flex-col gap-2 items-center top-2">
      {gameType && (
        <PixelButton text="SWITCH GAME" onClick={() => setGameType(null)} />
      )}
      {!gameType && (
        <>
          <div className="font-secondary text-p2 md:text-h5 bg-gradient-to-t from-yellow-300 to-purple-300 px-2 rounded-lg py-2">
            SELECT GAME
          </div>
          <div className="flex gap-2">
            <img
              onClick={() => setGameType(GameType.SHELTER)}
              className="w-24 h-24 rounded-xl hover:animate-hover"
              src="/game/select/shelter.jpg"
            />
            <img
              onClick={() => setGameType(GameType.HOME)}
              className="w-24 h-24 rounded-xl hover:animate-hover"
              src="/game/select/home.jpg"
            />
          </div>
          <div className="flex gap-2">
            <img
              onClick={() => setGameType(GameType.CATBASSADORS)}
              className="w-24 h-24 rounded-xl hover:animate-hover"
              src="/game/select/catbassadors.jpg"
            />
            <img
              onClick={() => setGameType(GameType.PURRQUEST)}
              className="w-24 h-24 rounded-xl hover:animate-hover"
              src="/game/select/purrquest.jpg"
            />
          </div>
          {/* <div className="flex gap-2">
            <div className="relative">
              <div className="opacity-25">
                <img
                  className="w-24 h-24 rounded-xl"
                  src="/game/select/clash-of-claws.jpg"
                />
              </div>
              <div className="absolute inset-0 flex justify-center items-center font-secondary -rotate-45">
                <div className="bg-yellow-300 px-2 rounded-lg">COMING SOON</div>
              </div>
            </div>
            <div className="relative">
              <div className="opacity-25">
                <img
                  className="w-24 h-24 rounded-xl"
                  src="/game/select/shop.jpg"
                />
              </div>
              <div className="absolute inset-0 flex justify-center items-center font-secondary -rotate-45">
                <div className="bg-yellow-300 px-2 rounded-lg">COMING SOON</div>
              </div>
            </div>
          </div> */}
        </>
      )}
    </div>
  );
};
