import { gameRun } from "@/analytics";
import { USER_API } from "@/api/user-api";
import { DeathCard, type DeathSaveState } from "@/components/game/DeathCard";
import { GameOptionsModal } from "@/components/game/GameOptionsModal";
import { GameSelect } from "@/components/game/GameSelect";
import { isCupidSeason } from "@/components/game/seasons";
import {
  GameEvent,
  GameEvents,
  GameStopOutcome,
  ICatEventsDetails,
  IGameStopEvent,
} from "@/components/Phaser/events";
import { MobileButtons } from "@/components/Phaser/MobileButtons/MobileButtons";
import { useHomeYardMode } from "@/components/home/homeYardMode";
import { ftueStore } from "@/components/Phaser/onboarding/ftue-store";
import { haptic } from "@/components/Phaser/onboarding/haptics";
import { ASSIST_SUGGEST_AFTER } from "@/components/Phaser/onboarding/hints";
import {
  bestFor,
  clearedFlags,
  firstTimeLevel,
  isInfiniteLevel,
  isScoredMode,
  levelIndex,
  type ProgressProfile,
} from "@/components/Phaser/onboarding/progress";
import { decideSave, isHardDeath, resolveOutcome } from "@/components/Phaser/onboarding/save-policy";
import { CatsModal } from "@/components/shared/CatsModal";
import { CodexModal } from "@/components/shared/CodexModal";
import { EndGameModal } from "@/components/shared/EndGameModal";
import { GAME_MODE_NAMES, levelNameParts } from "@/components/game/levelNames";
import { PixelRescueEndGameModal } from "@/components/shared/PixelRescueEndGameModal";
import { GameMusicPlayer } from "@/components/shared/GameMusicPlayer";
import { InviteModal } from "@/components/shared/InviteModal";
import { Notification } from "@/components/shared/Notification";
import { PacksModal } from "@/components/shared/PacksModal";
import { QuestsModal } from "@/components/shared/QuestsModal";
import { SupportModal } from "@/components/shared/SupportModal";
import { ProfileModal } from "@/components/shared/ProfileModal";
import { GameModal, GameType } from "@/models/game";
import type { IProfile } from "@/models/profile";
import { buildCatnipProfilePatch } from "@/constants/catnip-accounting";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useEffect, useState } from "react";
import { saveNudge } from "./auth/saveNudge";
import { useOptionalFirebaseAuth } from "./FirebaseAuthContext";
import { saveFailureMessage } from "./game-save-feedback";
import { useProfile } from "./ProfileContext";
import { IToast, useToast } from "./ToastContext";
import { WheelModal } from "@/components/shared/WheelModal";

/** How the last run ended, for end-game panels (5e) and the lobby (plan G10). */
export interface LastOutcome {
  mode: GameType;
  level: string | null;
  outcome: GameStopOutcome;
  /** This run cleared the level for the first time. */
  clearedNow: boolean;
}

/** The DeathCard's data while it shows. */
interface DeathState {
  mode: GameType;
  level: string | null;
  outcome: "died" | "timeout";
  points: number;
  best: number;
  newBest: boolean;
  saveState?: DeathSaveState;
  hardDeaths: number;
  cause?: string;
}

type ContextState = {
  isStarted?: boolean;
  gameType: GameType | null;
  level: string | null;
  progress: number;
  setLevel: (level: string | null) => void;
  /** Opens a mode; with `level`, that level at once (no first-time routing, one `select`). */
  setGameType: (gameType: GameType | null, level?: string) => void;
  gameStop: IGameStopEvent | null;
  lastOutcome: LastOutcome | null;
  playGame: () => void;
  addNotification: (notification: IToast) => void;
  setOpenedModal: (modal: GameModal | null) => void;
  /** The open game modal, if any (the Cat Yard HOME pauses its render loop under one). */
  openedModal?: GameModal | null;
};

const GameContext = React.createContext<ContextState | undefined>(undefined);


const GameProvider = ({ children }: React.PropsWithChildren<object>) => {
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [gameType, setCurrentGameType] = useState<GameType | null>(null);
  const [openedModal, setOpenedModal] = useState<GameModal | null>(null);
  const [gameStop, setGameStop] = useState<null | IGameStopEvent>(null);
  const [death, setDeath] = useState<DeathState | null>(null);
  const [lastOutcome, setLastOutcome] = useState<LastOutcome | null>(null);
  const [level, setLevelState] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [assistOn, setAssistOn] = useState(() => ftueStore.assists().extraGuards);

  const { profile, setProfileUpdate } = useProfile();
  const auth = useOptionalFirebaseAuth();
  const authStatus = auth?.authStatus;
  // Clears and hard deaths on this device are per player (5a review #1). Silent and idempotent,
  // so it runs during render: the children below read the store with the right owner.
  ftueStore.setOwner(profile?._id ?? null);
  const showToast = useToast();
  const homeMode = useHomeYardMode();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<IToast[]>([]);

  const addNotification = (notification: IToast) => {
    setNotifications((prev) => [...prev, notification]);
  };

  // E2E only (`__TT_E2E__`, set by Playwright before load): lets a test open a modal where no
  // control does, such as PROGRESS over a running level. Never set in a real session. Dev and E2E
  // builds only: `process.env.NODE_ENV` is inlined, so production drops the hook (F1 bundle guard).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_E2E !== "1") return;
    const w = window as unknown as Record<string, unknown>;
    if (w.__TT_E2E__ !== true) return;
    w.__TT_E2E_GAME__ = { openModal: (modal: GameModal | null) => setOpenedModal(modal) };
    return () => {
      delete w.__TT_E2E_GAME__;
    };
  }, []);

  useEffect(() => {
    if (notifications.length > 0) {
      const timeout = setTimeout(() => {
        setNotifications((prev) => {
          return prev.length > 0 ? prev.slice(1) : prev;
        });
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [notifications]);

  useEffect(() => ftueStore.subscribe(() => setAssistOn(ftueStore.assists().extraGuards)), []);

  // The cleared state can be trusted: a guest or an account with its profile, or a signed-out
  // player (nothing to load). Without the auth context (tests, pages outside it): a profile.
  const progressKnown =
    authStatus === undefined
      ? !!profile
      : authStatus === "ready" || authStatus === "guest" || (authStatus === "signed-out" && !!profile);

  const setLevel = (nextLevel: string | null) => {
    if (nextLevel) gameRun.select();
    setLevelState(nextLevel);
    setIsStarted(!!nextLevel);
  };

  const setGameType = (nextGameType: GameType | null, nextLevel?: string) => {
    // Cupid Cat is seasonal (January to March): a stale link or restore cannot open it off-season.
    if (nextGameType === GameType.PIXEL_RESCUE && nextGameType !== gameType && !isCupidSeason()) return;
    if (nextGameType !== gameType || nextLevel) {
      if (gameType && nextGameType !== gameType) gameRun.leave({ mode: gameType, level });
      if (nextGameType) gameRun.select();
    }
    setCurrentGameType(nextGameType);
    setGameStop(null);
    setDeath(null);
    if (nextGameType === null) {
      setLevelState(null);
      setIsStarted(false);
      setProgress(0);
      return;
    }
    if (nextLevel) {
      setLevelState(nextLevel);
      setIsStarted(true);
      return;
    }
    // First-time routing (G10): no clears in the mode means straight to level 1's full gate. Only
    // once the player's profile is in: during loading-profile a veteran would look new (review #6).
    if (nextGameType !== gameType && isScoredMode(nextGameType) && progressKnown) {
      const flags = clearedFlags(
        profile as ProgressProfile | null,
        nextGameType,
        ftueStore.localClears(nextGameType),
        ftueStore.pendingClears(nextGameType),
      );
      const first = firstTimeLevel(nextGameType, flags);
      if (first) {
        setLevelState(first);
        setIsStarted(true);
      }
    }
  };

  const gameProgressUpdateCallback = (
    event?: ICatEventsDetails[GameEvent.GAME_PROGRESS_UPDATE],
  ) => {
    if (!event) return;

    setProgress(event.progress);
  };

  GameEvents.GAME_PROGRESS_UPDATE.use(gameProgressUpdateCallback);

  const gameStopCallback = React.useCallback(
    async (event?: ICatEventsDetails[GameEvent.GAME_STOP]) => {
      if (!event || !gameType) return;
      const outcome = resolveOutcome(event.outcome, event.completedLevel);
      // Telemetry only; the score is saved through saveMatch below.
      gameRun.stop({ mode: gameType, level }, { ...event, outcome });

      const earnedCatnip = Number(event.catnipEarned ?? event.score ?? 0);
      const rawScore = Number(event.rawScore ?? event.score ?? 0);
      const progressProfile = profile as ProgressProfile | null;
      // A pending clear from an earlier win (its save still in flight) already counts, so the first
      // clear is celebrated once; over a server array nothing else from the local cache does.
      const scored = isScoredMode(gameType);
      const flagsBefore = scored
        ? clearedFlags(progressProfile, gameType, ftueStore.localClears(gameType), ftueStore.pendingClears(gameType))
        : [];
      const index = scored ? levelIndex(gameType, level) : -1;
      const localCleared = index >= 0 && !!flagsBefore[index];
      const endless = scored && isInfiniteLevel(gameType, level);
      const decision = decideSave({
        mode: gameType,
        level,
        outcome,
        points: earnedCatnip,
        score: rawScore,
        profile: progressProfile,
        // Signed out (before G1): the panel shows, nothing is sent.
        canSave: !!profile && authStatus !== "signed-out",
      });
      const clearedNow = decision.clearedNow && !localCleared;
      const best = isScoredMode(gameType) ? bestFor(progressProfile, gameType, level).points : 0;

      setLastOutcome({ mode: gameType, level, outcome, clearedNow });

      if (outcome === "won" && level && isScoredMode(gameType)) {
        ftueStore.addLocalClear(gameType, level);
        ftueStore.resetHardDeaths(gameType, level);
        haptic("clear");
        if (clearedNow) {
          gameRun.firstClear({ mode: gameType, level });
          saveNudge.firstClear();
        }
      }

      // Hard deaths keep the mode on screen (no GameSelect flash): the DeathCard covers it. The
      // endless run always ends this way, so it does not count towards the assist (review #2).
      if (isHardDeath(outcome)) {
        const hardDeaths = endless ? 0 : ftueStore.addHardDeath(gameType, level);
        haptic("hard-death");
        setDeath({
          mode: gameType,
          level,
          outcome: outcome as "died" | "timeout",
          points: decision.points,
          best,
          newBest: decision.save && decision.reason === "new-best",
          saveState: decision.save && decision.reason === "new-best" ? "saving" : undefined,
          hardDeaths,
          cause: event.cause,
        });
      } else if (outcome !== "quit") {
        // The panel says what happened to the points: saved, not better than the best, or no
        // session to save to. "Saved" waits for `/live` (saveState), like the DeathCard.
        setGameStop({
          score: decision.points,
          time: event.time ?? 0,
          completedLevel: event.completedLevel ?? (outcome === "won" ? level : null),
          rawScore,
          catnipEarned: decision.points,
          outcome,
          saved: decision.save && !!profile,
          saveReason: decision.reason,
          best,
          saveState: decision.save && profile ? "saving" : undefined,
          guest: authStatus === "guest" || !!(profile as { isGuest?: boolean } | null)?.isGuest,
        });
      }

      if (!decision.save || !profile) return;

      // The save answered: the server's cleared array is the truth again for this level.
      const settle = (state: DeathSaveState) => {
        if (outcome === "won" && level && scored) ftueStore.settleClear(gameType, level);
        setDeath((current) =>
          current && current.saveState === "saving" && current.mode === gameType && current.level === level
            ? { ...current, saveState: state }
            : current,
        );
        setGameStop((current) =>
          current && current.saveState === "saving" ? { ...current, saveState: state } : current,
        );
      };

      let result: Awaited<ReturnType<typeof USER_API.saveMatch>>;
      try {
        result = await USER_API.saveMatch({
          points: decision.points,
          score: gameType === GameType.MATCH_3 ? rawScore : undefined,
          time: event.time ?? 0,
          type: gameType,
          level: level || undefined,
          outcome,
        });
      } catch (error) {
        settle("failed");
        showToast({ message: saveFailureMessage(error) });
        return;
      }

      if (result === null) {
        settle("failed");
        showToast({ message: saveFailureMessage(null) });
        return;
      }

      const catnipPatch = buildCatnipProfilePatch({
        catnipChaos: result?.catnipChaos ?? profile.catnipChaos ?? [],
        match3: result?.match3 ?? profile.match3 ?? [],
      });
      // The server's cleared arrays come back with every save (F6); keep what it sent.
      const cleared: Partial<IProfile> = {};
      if (Array.isArray(result?.catnipChaosCleared)) cleared.catnipChaosCleared = result.catnipChaosCleared;
      if (Array.isArray(result?.seasonEventCleared)) cleared.seasonEventCleared = result.seasonEventCleared;
      if (Array.isArray(result?.match3Cleared)) cleared.match3Cleared = result.match3Cleared;

      if (gameType === GameType.PIXEL_RESCUE) {
        setProfileUpdate({
          ...catnipPatch,
          ...cleared,
          seasonEvent: result?.seasonEvent || profile.seasonEvent || [],
          seasonEventCount:
            result?.seasonEventCount || profile.seasonEventCount || 0,
        });
      }
      if (gameType === GameType.CATNIP_CHAOS) {
        setProfileUpdate({
          ...catnipPatch,
          ...cleared,
        });
      }
      if (gameType === GameType.MATCH_3) {
        setProfileUpdate({
          ...catnipPatch,
          ...cleared,
          match3Score: result?.match3Score ?? profile.match3Score ?? [],
          match3ScoreCount:
            result?.match3ScoreCount ?? profile.match3ScoreCount ?? 0,
        });
        void queryClient.invalidateQueries({
          queryKey: ["paw-match-level-leaderboard"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["paw-match-level-position"],
        });
      }
      // After the profile update, so no render sees the clear neither pending nor on the profile.
      settle("saved");
    },
    [profile, gameType, level, setProfileUpdate, showToast, queryClient, authStatus],
  );

  GameEvents.GAME_STOP.use(gameStopCallback);

  // RUN_BEGIN is the only start signal for `game_start` (plan F6).
  const runBeginCallback = React.useCallback(
    (event?: ICatEventsDetails[GameEvent.RUN_BEGIN]) => {
      setIsStarted(true);
      // Without a flag from the scene, the tracker knows whether PLAY AGAIN came first.
      if (gameType) gameRun.start({ mode: gameType, level, isRestart: event?.isRestart });
    },
    [gameType, level],
  );
  GameEvents.RUN_BEGIN.use(runBeginCallback);

  const lifeLostCallback = React.useCallback(
    (event?: ICatEventsDetails[GameEvent.LIFE_LOST]) => {
      haptic("soft-death");
      if (gameType && event) gameRun.lifeLost({ mode: gameType, level }, event.guardsLeft);
    },
    [gameType, level],
  );
  GameEvents.LIFE_LOST.use(lifeLostCallback);

  const hintCallback = React.useCallback(
    (event?: ICatEventsDetails[GameEvent.RUN_HINT]) => {
      if (gameType && event) gameRun.hintShown({ mode: gameType, level }, event.hint);
    },
    [gameType, level],
  );
  GameEvents.RUN_HINT.use(hintCallback);

  const hintDoneCallback = React.useCallback(
    (event?: ICatEventsDetails[GameEvent.RUN_HINT_DONE]) => {
      if (gameType && event?.result === "done") gameRun.hintDone({ mode: gameType, level }, event.hint);
    },
    [gameType, level],
  );
  GameEvents.RUN_HINT_DONE.use(hintDoneCallback);

  // Deprecated: ShelterScene and older scenes still say GAME_START. It shows the run, but only
  // RUN_BEGIN sends `game_start`.
  GameEvents.GAME_START.use(() => {
    setIsStarted(true);
  });

  GameEvents.GAME_LOADED.use(() => {
    if (gameType) gameRun.loaded({ mode: gameType, level });
  });

  const playGame = React.useCallback(() => {
    GameEvents.GAME_START.push({ cat: profile?.cat });
  }, [profile]);

  GameEvents.ENEMY_SPAWN.use((event) => {
    if (event) {
      addNotification({
        message: `ENEMY APPEARED`,
        icon: "/enemies/single-fluffie.png",
        isError: false,
      });
    }
  });

  GameEvents.BOSS_SPAWN.use((event) => {
    if (event) {
      addNotification({
        message: "BOSS APPEARED",
        icon: "/enemies/boss/boss-simple.png",
        isError: true,
      });
    }
  });

  const value = {
    isStarted,
    playGame,
    gameType,
    progress,
    setGameType,
    addNotification,
    setOpenedModal,
    openedModal,
    gameStop,
    lastOutcome,
    level,
    setLevel,
  };

  const onClose = () => {
    setGameStop(null);
    setDeath(null);
    setLevelState(null);
    setIsStarted(false);
  };

  const tryAgain = (nextLevel?: string) => {
    setGameStop(null);
    setDeath(null);
    if (nextLevel) {
      // A new level is a new mount, not a restart (select() clears the restart flag).
      setLevelState(null);
      setTimeout(() => {
        gameRun.select();
        setLevelState(nextLevel);
        setIsStarted(true);
      }, 200);
    } else if (gameType === GameType.MATCH_3 && level) {
      gameRun.restart();
      setLevelState(null);
      setTimeout(() => {
        setLevelState(level);
        setIsStarted(true);
      }, 200);
    } else {
      // Same level: the scene restarts itself. Never GAME_START (that would also mean "begin").
      gameRun.restart();
      GameEvents.GAME_RESTART.push({ cat: profile?.cat, isRestart: true });
    }
  };

  const enableExtraGuards = () => ftueStore.setAssist("extraGuards", true);

  return (
    <GameContext.Provider value={value}>
      {gameStop &&
        (gameType === GameType.PIXEL_RESCUE ? (
          <PixelRescueEndGameModal
            onClose={onClose}
            gameStop={gameStop}
            tryAgain={tryAgain}
            gameType={gameType!}
          />
        ) : (
          <EndGameModal
            onClose={onClose}
            gameStop={gameStop}
            tryAgain={tryAgain}
            gameType={gameType!}
          />
        ))}
      {death && (
        <DeathCard
          mode={death.mode}
          level={death.level}
          // One name per level on both end-of-run screens (the RunGate's: "Level 1-2", "Day 3").
          levelName={death.level ? levelNameParts(death.level, death.mode).title : ""}
          levelDetail={death.level ? levelNameParts(death.level, death.mode).detail : undefined}
          modeName={GAME_MODE_NAMES[death.mode]}
          catImg={profile?.cat?.catImg}
          outcome={death.outcome}
          points={death.points}
          best={death.best}
          cause={death.cause}
          newBest={death.newBest}
          saveState={death.saveState}
          endless={isScoredMode(death.mode) && isInfiniteLevel(death.mode, death.level)}
          unit={death.mode === GameType.PIXEL_RESCUE ? "hearts" : "catnip"}
          onRetry={() => tryAgain()}
          onLevels={onClose}
          assist={
            death.mode === GameType.CATNIP_CHAOS &&
            !isInfiniteLevel(death.mode, death.level) &&
            death.hardDeaths >= ASSIST_SUGGEST_AFTER
              ? { name: "extraGuards", on: assistOn, onEnable: enableExtraGuards }
              : null
          }
        />
      )}
      {!isStarted && (
        <GameSelect gameType={gameType} setGameType={setGameType} />
      )}
      {profile && (
        <>
          {!gameType && (
            <GameOptionsModal
              profile={profile}
              gameType={gameType}
              setOpenedModal={setOpenedModal}
              setProfileUpdate={setProfileUpdate}
            />
          )}
          <Notification notifications={notifications} />
          <MobileButtons
            isHidden={
              gameType === GameType.MATCH_3 ||
              !(isStarted && gameType !== GameType.CATNIP_CHAOS) &&
              !(isStarted && gameType !== GameType.PIXEL_RESCUE) &&
              gameType !== GameType.SHELTER &&
              // HOME: only the Phaser fallback has a cat to steer (the Cat Yard's cats wander).
              !(gameType === GameType.HOME && homeMode === "phaser" && !!profile.cat?.status?.EAT)
            }
          />

          {openedModal === GameModal.PROFILE && (
            <ProfileModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.CODEX && (
            <CodexModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.QUESTS && (
            <QuestsModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.CATS && (
            <CatsModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.INVITE && (
            <InviteModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.PACKS && (
            <PacksModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.SUPPORT && (
            <SupportModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.SPIN_WHEEL && (
            <WheelModal close={() => setOpenedModal(null)} />
          )}
          <GameMusicPlayer />
        </>
      )}
      {children}
    </GameContext.Provider>
  );
};

function useGame() {
  const context = React.useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return {
    isStarted: context.isStarted,
    gameType: context.gameType,
    progress: context.progress,
    setGameType: context.setGameType,
    playGame: context.playGame,
    setOpenedModal: context.setOpenedModal,
    openedModal: context.openedModal ?? null,
    gameStop: context.gameStop,
    lastOutcome: context.lastOutcome,
    level: context.level,
    addNotification: context.addNotification,
    setLevel: context.setLevel,
  };
}

export { GameProvider, useGame };
