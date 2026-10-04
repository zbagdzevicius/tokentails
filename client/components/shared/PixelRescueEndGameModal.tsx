import { cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import { ModalButton } from "@/components/ui/modal";
import React from "react";
import { IGameStopEvent } from "../Phaser/events";
import { PixelRescueLevelMap } from "../Phaser/map";
import {
  clearedThisRun,
  EndGamePanel,
  endRunSave,
  GAME_MODE_NAMES,
  levelNameParts,
  useLastOutcome,
} from "./EndGameModal";
import { EndGamePaw } from "@/components/impact/EndGamePaw";

type EndGameProps = {
  onClose: () => void;
  tryAgain: (nextLevel?: string) => void;
  gameType: GameType;
  gameStop: IGameStopEvent;
};

/**
 * Cupid Cat's days open one a day in February (the level map's date rule, `PixelRescueLevels`):
 * day N from February N, every day from March, none before February.
 */
export function cupidDayOpen(level: string, now: Date = new Date()): boolean {
  const day = Number(level);
  if (!Number.isFinite(day)) return false;
  const month = now.getMonth();
  if (month > 1) return true;
  if (month === 1) return now.getDate() >= day;
  return false;
}

/**
 * After a cleared day: the next day when it is open today, or when it opens. Null after the last
 * day or when nothing was cleared.
 */
export function nextCupidDay(
  completedLevel: string | null | undefined,
  now: Date = new Date()
): { level: string; open: boolean } | null {
  if (!completedLevel) return null;
  const next = String(Number(completedLevel) + 1);
  if (!(next in PixelRescueLevelMap)) return null;
  return { level: next, open: cupidDayOpen(next, now) };
}

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
  const next = nextCupidDay(gameStop.completedLevel);
  const nextLevel = next?.open ? next.level : null;

  return (
    <EndGamePanel
      levelName={level ? levelNameParts(level, GameType.PIXEL_RESCUE).title : "Run complete"}
      modeName={GAME_MODE_NAMES[GameType.PIXEL_RESCUE]}
      name="pixel-rescue-end-game"
      onClose={onClose}
      catImg={profile?.cat?.catImg}
      score={gameStop.score}
      scoreLabel="hearts"
      time={gameStop.time}
      save={endRunSave(gameStop)}
      cleared={clearedThisRun(lastOutcome, { gameType, level, outcome: gameStop.outcome })}
      // A cleared day whose next day is still closed says when it opens (no dead end).
      note={next && !next.open ? `Day ${next.level} opens on February ${next.level}.` : undefined}
      footer={<EndGamePaw refreshKey={lastOutcome} />}
      scoreIcon={
        <img
          src={cdnFile("pixel-rescue/items/heart.webp")}
          alt=""
          className="h-4 w-4"
          draggable="false"
        />
      }
      actions={
        nextLevel ? (
          <ModalButton variant="primary" icon="chevron-right" className="tt-claim-glow" onClick={() => tryAgain(nextLevel)}>
            NEXT DAY
          </ModalButton>
        ) : (
          <>
            <ModalButton variant="primary" icon="reload" onClick={() => tryAgain()}>
              PLAY AGAIN
            </ModalButton>
            <ModalButton variant="secondary" icon="map" onClick={onClose}>
              LEVEL MAP
            </ModalButton>
          </>
        )
      }
      secondaryActions={
        nextLevel ? (
          <>
            <ModalButton variant="secondary" icon="reload" onClick={() => tryAgain()}>
              PLAY AGAIN
            </ModalButton>
            <ModalButton variant="ghost" size="sm" icon="map" onClick={onClose}>
              LEVEL MAP
            </ModalButton>
          </>
        ) : undefined
      }
    />
  );
};
