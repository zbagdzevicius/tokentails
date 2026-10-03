import { cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React from "react";
import { IGameStopEvent } from "../Phaser/events";
import { clearedThisRun, EndGamePanel, useLastOutcome } from "./EndGameModal";
import { EndGamePaw } from "@/components/impact/EndGamePaw";
import { PixelButton } from "./PixelButton";

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

/** Cupid Cat's end of run: the shared night EndGamePanel, counted in hearts. */
export const PixelRescueEndGameModal: React.FC<EndGameProps> = ({
  onClose,
  tryAgain,
  gameStop,
  gameType,
}) => {
  const { profile } = useProfile();
  const { level } = useGame();
  const lastOutcome = useLastOutcome();

  return (
    <EndGamePanel
      title={`${level ? getGameLevelName(level) : "Match"} Summary`}
      name="pixel-rescue-end-game"
      onClose={onClose}
      catImg={profile?.cat?.catImg}
      score={gameStop.score}
      scoreLabel="hearts"
      time={gameStop.time}
      cleared={clearedThisRun(lastOutcome, { gameType, level, outcome: gameStop.outcome })}
      footer={<EndGamePaw refreshKey={lastOutcome} />}
      scoreIcon={
        <img
          src={cdnFile("pixel-rescue/items/heart.webp")}
          alt=""
          className="h-6 w-6"
          draggable="false"
        />
      }
      actions={
        <>
          <PixelButton text="PLAY AGAIN" onClick={() => tryAgain()} />
          <PixelButton text="MEOW BACK" size="sm" onClick={onClose} />
        </>
      }
    />
  );
};
