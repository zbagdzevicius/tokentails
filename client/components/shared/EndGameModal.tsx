import { cdnFile } from "@/constants/utils";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton, StatGrid, StatTile } from "@/components/ui/modal";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import { SCROLL_FADE_CLASS, useScrollFade } from "@/components/ui/useScrollFade";
import clsx from "clsx";
import React, { type ReactNode } from "react";
import { IGameStopEvent } from "../Phaser/events";
import { getNextCatnipChaosLevel, lastCatnipChaosLevel } from "../Phaser/map";
import { MATCH3_LEVELS, getNextMatch3LevelId } from "../Match3/match3.config";
import { GAME_MODE_NAMES, levelNameParts } from "@/components/game/levelNames";
import { EndGamePaw } from "@/components/impact/EndGamePaw";

type EndGameProps = {
  onClose: () => void;
  tryAgain: (nextLevel?: string) => void;
  gameType: GameType;
  gameStop: IGameStopEvent;
};

// The level and game names live in one place (components/game/levelNames), shared with the
// DeathCard through GameContext.
export { GAME_MODE_NAMES, getGameLevelName, levelNameParts, mapLevelName } from "@/components/game/levelNames";

/** Seconds played as a tile value: "37" sec under a minute, "2:05" min from there. */
export function runTime(seconds: number): { value: string; unit: string } {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return { value: String(s), unit: "sec" };
  return { value: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, unit: "min" };
}

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

/** What happened to the run's points (GameContext's save decision, read from the stop event). */
export interface EndRunSave {
  /** The run is sent to `/live`. */
  saved?: boolean;
  /** `decideSave().reason`: "won", "new-best", "not-better", "no-session", ... */
  reason?: string;
  /** The level's best before this run. */
  best?: number;
  /** "saved" only once `/live` answered. */
  state?: "saving" | "saved" | "failed";
  /** A guest account: saved, but only to the guest until the player signs in. */
  guest?: boolean;
}

/**
 * The line under the score: what happened to these points, never more. `/live` keeps the best
 * score per level (`$max`) and the catnip total is the sum of those bests, so a run is never
 * "added" to a total: it is saved, or the best stays where it was.
 */
export function scoreHelper(scoreLabel: string, score: number, save?: EndRunSave | null): string {
  const what = scoreLabel === "hearts" ? "these hearts" : scoreLabel === "catnip" ? "this catnip" : "these points";
  if (!save || save.reason === undefined) {
    return scoreLabel === "hearts" ? "Hearts collected this run." : "Collected this run.";
  }
  const best = Math.max(0, Math.floor(save.best ?? 0));
  if (!save.saved) {
    if (save.reason === "no-session") return `Sign in to keep ${what}.`;
    if (save.reason === "not-better" && best > 0) return `Your best here stays ${best}.`;
    return "Collected this run. Not saved.";
  }
  if (save.state === "failed") return "Not saved this time. Your next run saves again.";
  if (save.state === "saving") return "Saving to your progress…";
  if (save.guest) return "Saved as a guest. Sign in to keep it.";
  if (score > best) return best > 0 ? "New best, saved to your progress." : "Saved to your progress.";
  return best > 0 ? `Saved. Your best here stays ${best}.` : "Saved to your progress.";
}

export interface EndGamePanelProps {
  /** The level, short: "Level 1", "Day 3". The panel's title (and accessible name). */
  levelName: string;
  /** The level's own name ("Kitten Starter 1"), shown under the title before the game. */
  levelDetail?: string;
  /** The game, shown under the title ("Paw Match"). */
  modeName?: string;
  /** Telemetry name for the ModalBoundary. */
  name: string;
  onClose: () => void;
  /** The player's cat sprite. */
  catImg?: string;
  /** Decorative icon in front of the score. */
  scoreIcon: ReactNode;
  score: number;
  /** "catnip", "hearts". */
  scoreLabel: string;
  /** Seconds played; the time tile is hidden when 0 or missing. */
  time?: number;
  /** What happened to the points (saved, not better, signed out); the score tile's line. */
  save?: EndRunSave | null;
  /**
   * The panel's buttons, primary first (an ActionRow lays them out). With `secondaryActions`,
   * this is the one primary: full width on phones, the others side by side under it.
   */
  actions: ReactNode;
  /** PLAY AGAIN and LEVEL MAP under a NEXT LEVEL primary (one row on phones too). */
  secondaryActions?: ReactNode;
  /** The level was cleared by this run (the save's `lastOutcome.clearedNow`, plan F6/G10). */
  cleared?: boolean;
  /** One short line in the hero under the ribbon ("Day 5 opens on February 5."). */
  note?: ReactNode;
  /** Under the stats: the paw card and treat CTA (plan G4 "End of run"). */
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

/** Pixel sparkles around the cleared hero; they pulse only when motion is allowed. */
const SPARKLES = [
  "left-[12%] top-[18%] text-tt-gold-400",
  "right-[14%] top-[10%] text-tt-cream [animation-delay:400ms]",
  "left-[24%] bottom-[30%] text-tt-pink [animation-delay:800ms]",
  "right-[22%] bottom-[38%] text-tt-mint [animation-delay:1200ms]",
] as const;

/**
 * The cat and the mascot on a lit pedestal. Decorative: the title and the tiles say what happened.
 * The cat image is capped (max 55 % wide, object-contain) inside an overflow-hidden stage, so a
 * wide catImg can never spill out of the hero. Short landscape screens get a small strip.
 */
const EndGameHero = ({ catImg, cleared }: { catImg?: string; cleared?: boolean }) => (
  <div
    aria-hidden="true"
    className="relative flex h-28 w-full items-end justify-center overflow-hidden md:h-40 short:!h-14 short:!w-auto short:flex-1"
  >
    {/* The pedestal glow: gold when cleared, lilac otherwise. */}
    <div
      className={clsx(
        "pointer-events-none absolute inset-x-0 bottom-0 h-[85%]",
        cleared
          ? "bg-[radial-gradient(60%_70%_at_50%_100%,rgb(var(--tt-gold-400)/0.32),transparent_70%)]"
          : "bg-[radial-gradient(60%_70%_at_50%_100%,rgb(var(--tt-lilac)/0.22),transparent_70%)]"
      )}
    />
    <div className="pointer-events-none absolute inset-x-[18%] bottom-1 h-3 rounded-[50%] bg-tt-night-950/70" />
    {cleared &&
      SPARKLES.map((place) => (
        <span key={place} className={clsx("pointer-events-none absolute motion-safe:animate-pulse lowfx:animate-none short:hidden", place)}>
          <PixelIcon name="sparkles" size={18} />
        </span>
      ))}
    <img
      src={cleared ? "/mascots/tasks/celebrating_finishing_work.webp" : "/mascots/emotions/playful_meow.webp"}
      alt=""
      draggable={false}
      className="pointer-events-none relative -mr-3 mb-1 w-16 -rotate-6 select-none md:w-24 short:!w-10"
    />
    {catImg && (
      <img
        src={catImg}
        alt=""
        draggable={false}
        className="pointer-events-none relative mb-2 h-24 w-auto max-w-[55%] select-none object-contain pixelated md:h-32 short:!mb-1 short:!h-12"
      />
    )}
  </div>
);

/** The gold "LEVEL CLEARED" ribbon for a first clear; a quiet "Level complete" plate otherwise. */
const OutcomeRibbon = ({ cleared }: { cleared?: boolean }) =>
  cleared ? (
    <p
      data-testid="end-game-cleared"
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap bg-tt-gold-400 px-3 py-1 font-primary text-p4 uppercase leading-none tracking-wide text-tt-gold-ink [box-shadow:0_-2px_0_0_rgb(var(--tt-gold-shadow)),0_2px_0_0_rgb(var(--tt-gold-shadow)),-2px_0_0_0_rgb(var(--tt-gold-shadow)),2px_0_0_0_rgb(var(--tt-gold-shadow)),inset_0_-3px_0_rgb(var(--tt-gold-shadow)/0.5)] motion-safe:animate-tt-modal-in short:!text-p5"
    >
      <PixelIcon name="trophy" size={18} />
      Level cleared
    </p>
  ) : (
    <p
      data-testid="end-game-complete"
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-2 border-tt-lilac/50 bg-tt-night-950/50 px-2.5 py-1 font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-lilac"
    >
      <PixelIcon name="check" size={14} />
      Level complete
    </p>
  );

/**
 * The night end-of-run panel shared by every Phaser mode (plan G6 "Overlay migration", G14
 * "panel max-h with safe areas"). It is a GameModal: the panel's height is capped by the viewport
 * minus the safe areas. The results scroll (with a bottom fade while more sits below); the actions
 * stay pinned under them, so PLAY AGAIN is never below the fold (short landscape included).
 *
 * Layout: the level as the title (its name and the game under it), a hero (cat on a lit pedestal,
 * the outcome ribbon), the run's numbers as StatTiles, the paw card, then one primary action.
 * Phones stack it; md puts the hero left of the numbers; short landscape screens turn the hero into
 * a strip and put the numbers and the paw card side by side.
 */
export const EndGamePanel = ({
  levelName,
  levelDetail,
  modeName,
  name,
  onClose,
  catImg,
  scoreIcon,
  score,
  scoreLabel,
  time,
  save,
  actions,
  secondaryActions,
  cleared,
  note,
  footer,
}: EndGamePanelProps) => {
  const played = time ? runTime(time) : null;
  const [scrollRef, fade] = useScrollFade<HTMLDivElement>();
  const subtitle = [levelDetail, modeName].filter(Boolean).join(" · ");
  return (
    <GameModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={levelName}
      description={subtitle || undefined}
      // The trophy belongs to the LEVEL CLEARED ribbon; the header names the game.
      icon="gamepad"
      name={name}
      size="lg"
      className="lg:!max-w-[52rem]"
      bodyClassName="flex flex-col !overflow-hidden"
    >
      <div
        ref={scrollRef}
        data-fade={fade || undefined}
        className={clsx("-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2", fade && SCROLL_FADE_CLASS)}
      >
        <div
          className={clsx(
            "grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-[auto_1fr] lg:gap-5",
            "short:!grid-cols-2 short:!grid-rows-none short:!gap-2.5",
            // No paw card (no paw data yet): the numbers take the whole row.
            "short:[&:not(:has(>[data-testid=end-game-paw]))>[data-slot=stats]]:col-span-2"
          )}
        >
          <section
            data-testid="end-game-summary"
            data-tone={cleared ? "highlight" : "default"}
            aria-label="Your run"
            className="tt-card relative flex flex-col items-center justify-center gap-2 overflow-hidden p-3 md:row-span-2 short:!col-span-2 short:!row-span-1 short:!flex-row short:!justify-start short:!gap-3 short:!px-3 short:!py-1.5"
          >
            {/* A soft star glow behind the stage, so the card has depth without new art. */}
            <span
              aria-hidden="true"
              className={clsx(
                "pointer-events-none absolute inset-0",
                cleared
                  ? "bg-[radial-gradient(80%_60%_at_50%_0%,rgb(var(--tt-gold-400)/0.14),transparent_70%)]"
                  : "bg-[radial-gradient(80%_60%_at_50%_0%,rgb(var(--tt-lilac)/0.12),transparent_70%)]"
              )}
            />
            <div className="relative flex flex-col items-center gap-1.5 short:!items-start">
              <OutcomeRibbon cleared={cleared} />
              {note && (
                <p className="text-center font-sans text-p6 font-bold leading-snug text-tt-cream text-balance md:text-p5 short:!text-left short:!text-p6" data-testid="end-game-note">
                  {note}
                </p>
              )}
            </div>
            <EndGameHero catImg={catImg} cleared={cleared} />
          </section>
          <div data-slot="stats" className="min-w-0">
            <StatGrid cols={2}>
              <StatTile
                data-testid="end-game-score"
                label={scoreLabel}
                value={score}
                // A unit on both tiles keeps the two values on one baseline.
                unit="this run"
                // Both tiles' icons in one 16 px box (an <img> sprig would sit taller than a PixelIcon).
                icon={
                  <span className="flex h-4 w-4 items-center justify-center [&_img]:!h-4 [&_img]:!w-4 [&_img]:object-contain">
                    {scoreIcon}
                  </span>
                }
                helper={<span className="block text-balance lg:text-p5 short:sr-only">{scoreHelper(scoreLabel, score, save)}</span>}
                tone={save?.saved && save.state === "saved" && score > (save.best ?? 0) ? "mint" : "gold"}
                className={clsx(!played && "col-span-2")}
              />
              {played && (
                <StatTile
                  data-testid="end-game-time"
                  label="Time"
                  value={played.value}
                  unit={played.unit}
                  icon="zap"
                  tone="sky"
                  helper={<span className="block text-balance lg:text-p5 short:sr-only">How long this run took.</span>}
                />
              )}
            </StatGrid>
          </div>
          {footer}
        </div>
      </div>
      <div className="mt-2 shrink-0 border-t-2 border-tt-gold-500/20 pt-3 short:!mt-1 short:!pt-2">
        {secondaryActions ? (
          // One primary, full width on phones; the rest side by side under it (one row from md).
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-center md:gap-3 short:!flex-row short:!items-center short:!justify-center short:!gap-3">
            <div className="flex [&>button]:w-full md:[&>button]:w-auto short:[&>button]:w-auto">{actions}</div>
            <ActionRow inline align="center" className="[&>button:first-child]:flex-1 md:[&>button:first-child]:flex-none short:[&>button:first-child]:flex-none">
              {secondaryActions}
            </ActionRow>
          </div>
        ) : (
          <ActionRow align="center">{actions}</ActionRow>
        )}
      </div>
    </GameModal>
  );
};

/** The save facts GameContext put on the stop event, for the score tile's line. */
export const endRunSave = (gameStop: IGameStopEvent): EndRunSave | null =>
  gameStop.saveReason === undefined
    ? null
    : { saved: gameStop.saved, reason: gameStop.saveReason, best: gameStop.best, state: gameStop.saveState, guest: gameStop.guest };

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
  const nextLevel = showCatnipChaosNextLevel
    ? getNextCatnipChaosLevel(gameStop.completedLevel!)
    : showMatch3NextLevel
    ? nextMatch3Level
    : null;
  const cleared = clearedThisRun(lastOutcome, { gameType, level, outcome: gameStop.outcome });
  const names = level ? levelNameParts(level, gameType) : { title: "Run complete" };

  return (
    <EndGamePanel
      levelName={names.title}
      levelDetail={names.detail}
      modeName={GAME_MODE_NAMES[gameType]}
      name="end-game"
      onClose={onClose}
      catImg={profile?.cat?.catImg}
      score={gameStop.score}
      scoreLabel={scoreMeta.label}
      time={gameStop.time}
      save={endRunSave(gameStop)}
      cleared={cleared}
      footer={<EndGamePaw refreshKey={lastOutcome} />}
      scoreIcon={
        scoreMeta.icon === "catnip" ? (
          // Decorative: the tile's label says what the number counts.
          <CatnipIcon size={16} alt="" />
        ) : (
          <img src={scoreMeta.icon} alt="" className="h-4 w-4" draggable="false" />
        )
      }
      actions={
        nextLevel ? (
          <ModalButton
            variant="primary"
            icon="chevron-right"
            className="tt-claim-glow"
            onClick={() => tryAgain(nextLevel)}
          >
            NEXT LEVEL
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
