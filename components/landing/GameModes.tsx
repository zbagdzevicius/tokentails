import { GameType } from "@/models/game";
import React, { useState } from "react";
import { PixelButton } from "../shared/PixelButton";

export const gameModes = {
  [GameType.CATBASSADORS]: {
    video:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/catbassadors.mp4",
    title: "Catbassadors",
    image: "/game/select/catbassadors.jpg",
    text: "PLAY TO EARN COINS",
  },
  [GameType.HOME]: {
    video:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/home.mp4",
    title: "Home",
    image: "/game/select/home.jpg",
    text: "TAKE CARE OF YOUR NFT CATS",
  },
  [GameType.PURRQUEST]: {
    video:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/purrquest.mp4",
    title: "Purrquest",
    image: "/game/select/purrquest.jpg",
    text: "EXPLORE TO FIND REWARDS",
  },
  [GameType.SHELTER]: {
    video:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/shelter.mp4",
    title: "Shelter",
    image: "/game/select/shelter.jpg",
    text: "SAVE CATS BY OWNING NFTS",
  },
  // [GameType.STORYMODE]: {
  //   video: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/storymode.mp4",
  //   title: "Story Mode",
  //   image: "/game/select/storymode.jpg",
  //   text: "PLAY STORY MODE",
  // },
};

export const GameModes = () => {
  const [gameMode, setGameMode] = useState(GameType.CATBASSADORS);

  return (
    <div className="container h-full flex flex-col items-center justify-center overflow-visible">
      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance my-3">
        ADOPT AND START PLAYING
      </h2>
      <a className="-mb-6" href="/game">
        <PixelButton text="PLAY TO SAVE" />
      </a>
      <div className="flex gap-2 -mb-12 md:-mb-20 relative z-30">
        <div
          className={
            gameMode === GameType.CATBASSADORS
              ? "animate-hover"
              : "opacity-50 hover:opacity-100"
          }
        >
          <img
            draggable={false}
            className="w-20 rounded-xl"
            src={gameModes[GameType.CATBASSADORS].image}
            onClick={() => setGameMode(GameType.CATBASSADORS)}
          ></img>
        </div>
        <div
          className={`mt-10 ${
            gameMode === GameType.PURRQUEST
              ? "animate-hover"
              : "opacity-50 hover:opacity-100"
          }`}
        >
          <img
            draggable={false}
            className="w-20 rounded-xl"
            src={gameModes[GameType.PURRQUEST].image}
            onClick={() => setGameMode(GameType.PURRQUEST)}
          ></img>
        </div>
        <div
          className={`mt-10 ${
            gameMode === GameType.HOME
              ? "animate-hover"
              : "opacity-50 hover:opacity-100"
          }`}
        >
          <img
            draggable={false}
            className="w-20 rounded-xl"
            src={gameModes[GameType.HOME].image}
            onClick={() => setGameMode(GameType.HOME)}
          ></img>
        </div>
        <div
          className={
            gameMode === GameType.SHELTER
              ? "animate-hover"
              : "opacity-50 hover:opacity-100"
          }
        >
          <img
            draggable={false}
            className="w-20 rounded-xl"
            src={gameModes[GameType.SHELTER].image}
            onClick={() => setGameMode(GameType.SHELTER)}
          ></img>
        </div>
      </div>

      <div className="flex justify-center w-full">
        <div className="min-w-[250px] md:w-1/2 h-full aspect-square max-w-[600px] relative">
          <video
            key={gameMode}
            className="clipped z-20 relative transition-animation hover:brightness-110"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src={gameModes[gameMode].video} />
          </video>

          <div className="absolute z-30 left-[50%] -translate-x-[50%] bottom-20 m-auto px-4 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full font-secondary -mb-4">
            {gameModes[gameMode].text}
          </div>
        </div>
      </div>
    </div>
  );
};
