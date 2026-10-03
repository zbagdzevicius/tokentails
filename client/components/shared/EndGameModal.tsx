import { cdnFile } from "@/constants/utils";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { GameModal } from "@/components/ui/GameModal";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import React, { type ReactNode } from "react";
import { IGameStopEvent } from "../Phaser/events";
import { getNextCatnipChaosLevel, lastCatnipChaosLevel } from "../Phaser/map";
import {
  MATCH3_LEVELS,
  MATCH3_LEVEL_BY_ID,
  getNextMatch3LevelId,
} from "../Match3/match3.config";
import { PixelButton } from "./PixelButton";
import { EndGamePaw } from "@/components/impact/EndGamePaw";

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

/** `icon: "catnip"` renders the CatnipIcon sprig (plan G8); anything else is an image URL. */
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
    icon: "catnip",
    label: "catnip",
  },
  [GameType.PIXEL_RESCUE]: {
    icon: cdnFile("pixel-rescue/items/heart.webp"),
    label: "hearts",
  },
  [GameType.MATCH_3]: {
    icon: "catnip",
    label: "catnip",
  },
  // Not Phaser modes (retired types and the iframe-hosted Heist), listed because GameType is shared.
  [GameType.PURRQUEST]: {
    icon: cdnFile("logo/logo.webp"),
    label: "coins",
  },
  [GameType.CATBASSADORS]: {
    icon: cdnFile("logo/logo.webp"),
    label: "coins",
  },
  [GameType.CATNIP_HEIST]: {
    icon: "catnip",
    label: "catnip",
  },
};

/** A stat row on the night end-of-run panel: an icon, then the line with its gold number. */
const EndGameStat = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <div className="flex w-full items-center gap-3 rounded-md bg-tt-night-900/70 px-3 py-2 ring-1 ring-inset ring-tt-gold-500/30">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
    <p className="min-w-0 font-secondary text-p4 uppercase leading-tight tracking-wide text-tt-cream lg:text-p3">
      {children}
    </p>
  </div>
);

/** The number inside a stat line, in the gold display face. */
const EndGameNumber = ({ children }: { children: ReactNode }) => (
  <strong className="font-primary font-normal text-tt-gold-400 [text-shadow:0_2px_0_rgb(var(--tt-gold-shadow))]">
    {children}
  </strong>
);

export interface EndGamePanelProps {
  /** Modal title (also the accessible name), e.g. "Level 1 • Sunny Steps Summary". */
  title: string;
  /** Telemetry name for the ModalBoundary. */
  name: string;
  onClose: () => void;
  /** The player's cat sprite. */
  catImg?: string;
  /** Decorative icon in front of the score line. */
  scoreIcon: ReactNode;
  score: number;
  scoreLabel: string;
  /** Seconds played; the time row is hidden when 0 or missing. */
  time?: number;
  /** The panel's buttons, top to bottom. */
  actions: ReactNode;
  /** The level was cleared by this run (the save's `lastOutcome.clearedNow`, plan F6/G10). */
  cleared?: boolean;
  /** Under the stats: the paw line and treat CTA (plan G4 "End of run"). */
  footer?: ReactNode;
}

/** What GameContext reports about the last save (task 5a), read defensively. */
export interface LastOutcomeLike {
  mode?: string | null;
  level?: string | null;
  outcome?: string | null;
  clearedNow?: boolean;
}

/** The run this end-of-run panel is about. */
export interface EndedRun {
  gameType: string;
  level: string | null | undefined;
  /** The stop event's outcome when the scene reports one (task 5a). */
  outcome?: string | null;
}

/**
 * LEVEL CLEARED only when `lastOutcome` belongs to the run on screen. The panel mounts as soon as
 * the run stops, so an outcome left over from the previous run must never light it: the mode and
 * level have to match, the outcome has to be a win, and when the stop event carries its own
 * outcome the two have to agree (a failed run right after a cleared one shows no badge).
 */
export function clearedThisRun(last: LastOutcomeLike | null, run: EndedRun): boolean {
  if (!last?.clearedNow) return false;
  if (last.mode != null && last.mode !== run.gameType) return false;
  if (last.level != null && (run.level ?? null) !== last.level) return false;
  if (last.outcome != null && last.outcome !== "won") return false;
  if (run.outcome != null && run.outcome !== (last.outcome ?? "won")) return false;
  return true;
}

/** `lastOutcome` from useGame when the context provides it (task 5a adds it). */
export function useLastOutcome(): LastOutcomeLike | null {
  const game = useGame() as ReturnType<typeof useGame> & { lastOutcome?: LastOutcomeLike | null };
  return game.lastOutcome ?? null;
}

/**
 * The night end-of-run panel shared by every Phaser mode (plan G6 "Overlay migration", G14
 * "panel max-h with safe areas"). It is a GameModal: the panel's height is capped by the viewport
 * minus the safe areas and its body scrolls, so on a 360x740 phone nothing is cut off, and the X
 * sits inside the frame (placement `inside`) instead of on a clipped corner.
 */
export const EndGamePanel = ({
  title,
  name,
  onClose,
  catImg,
  scoreIcon,
  score,
  scoreLabel,
  time,
  actions,
  cleared,
  footer,
}: EndGamePanelProps) => (
  <GameModal
    open
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
    title={title}
    name={name}
    size="lg"
    bodyClassName="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-5"
  >
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3" data-testid="end-game-summary">
      {cleared && (
        <p
          data-testid="end-game-cleared"
          className="rounded-md bg-tt-gold-400 px-4 py-1 font-primary text-p3 uppercase tracking-wide text-tt-gold-ink shadow-[0_3px_0_rgb(var(--tt-gold-shadow))]"
        >
          Level cleared
        </p>
      )}
      <div className="relative flex h-24 w-full items-end justify-center overflow-hidden" aria-hidden="true">
        <div className="absolute inset-x-6 bottom-0 h-3 rounded-[50%] bg-tt-night-950/80" />
        <img
          src="/mascots/tasks/celebrating_finishing_work.webp"
          alt=""
          draggable={false}
          className="pointer-events-none relative -mr-3 w-16 -rotate-6 select-none md:w-20"
        />
        {catImg && (
          <img
            src={catImg}
            alt=""
            draggable={false}
            className="pointer-events-none relative h-24 w-auto max-w-[55%] select-none object-contain pixelated"
          />
        )}
      </div>
      <EndGameStat icon={scoreIcon}>
        collected <EndGameNumber>{score}</EndGameNumber> {scoreLabel}
      </EndGameStat>
      {!!time && (
        <EndGameStat
          icon={
            <img
              src={cdnFile("icons/clock.png")}
              alt=""
              className="h-6 w-6"
              draggable="false"
            />
          }
        >
          Played for <EndGameNumber>{Math.floor(time)}</EndGameNumber> seconds
        </EndGameStat>
      )}
      {footer}
    </div>
    <div className="flex w-full flex-col items-center justify-center gap-3 md:w-[200px] md:shrink-0 md:gap-2">
      {actions}
    </div>
  </GameModal>
);

export const EndGameModal: React.FC<EndGameProps> = ({
  onClose,
  tryAgain,
  gameStop,
  gameType,
}) => {
  const { profile } = useProfile();
  const { level } = useGame();
  const lastOutcome = useLastOutcome();
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
    <EndGamePanel
      title={summaryTitle}
      name="end-game"
      onClose={onClose}
      catImg={profile?.cat?.catImg}
      score={gameStop.score}
      scoreLabel={scoreMeta.label}
      time={gameStop.time}
      cleared={clearedThisRun(lastOutcome, { gameType, level, outcome: gameStop.outcome })}
      footer={<EndGamePaw refreshKey={lastOutcome} />}
      scoreIcon={
        scoreMeta.icon === "catnip" ? (
          // Decorative: the line says "collected N catnip".
          <CatnipIcon size={24} alt="" />
        ) : (
          <img src={scoreMeta.icon} alt="" className="h-6 w-6" draggable="false" />
        )
      }
      actions={
        <>
          <PixelButton
            text="PLAY AGAIN"
            onClick={() => tryAgain()}
            size={hasNextLevelAction ? "sm" : "md"}
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
          <PixelButton text="MEOW BACK" size="sm" onClick={onClose} />
        </>
      }
    />
  );
};
