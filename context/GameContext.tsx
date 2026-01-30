import { USER_API } from "@/api/user-api";
import { GameOptionsModal } from "@/components/game/GameOptionsModal";
import { GameSelect } from "@/components/game/GameSelect";
import {
  GameEvent,
  GameEvents,
  ICatEventsDetails,
  IGameStopEvent,
} from "@/components/Phaser/events";
import { MobileButtons } from "@/components/Phaser/MobileButtons/MobileButtons";
import { CatsModal } from "@/components/shared/CatsModal";
import { CodexModal } from "@/components/shared/CodexModal";
import { EndGameModal } from "@/components/shared/EndGameModal";
import { PixelRescueEndGameModal } from "@/components/shared/PixelRescueEndGameModal";
import { GameMusicPlayer } from "@/components/shared/GameMusicPlayer";
import { InviteModal } from "@/components/shared/InviteModal";
import { Notification } from "@/components/shared/Notification";
import { PacksModal } from "@/components/shared/PacksModal";
import { QuestsModal } from "@/components/shared/QuestsModal";
import { SupportModal } from "@/components/shared/SupportModal";
import { TelegramProfile } from "@/components/shared/TelegramProfile";
import { GameModal, GameType } from "@/models/game";
import * as React from "react";
import { useEffect, useState } from "react";
import { useProfile } from "./ProfileContext";
import { IToast, useToast } from "./ToastContext";

type ContextState = {
  isStarted?: boolean;
  gameType: GameType | null;
  level: string | null;
  progress: number;
  setLevel: (level: string | null) => void;
  setGameType: (gameType: GameType | null) => void;
  gameStop: IGameStopEvent | null;
  playGame: () => void;
  addNotification: (notification: IToast) => void;
  setOpenedModal: (modal: GameModal | null) => void;
};

const GameContext = React.createContext<ContextState | undefined>(undefined);

const GameProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [gameType, setGameType] = useState<GameType | null>(null);
  const [openedModal, setOpenedModal] = useState<GameModal | null>(null);
  const [gameStop, setGameStop] = useState<null | IGameStopEvent>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const [notifications, setNotifications] = useState<IToast[]>([]);

  const addNotification = (notification: IToast) => {
    setNotifications((prev) => [...prev, notification]);
  };

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

  useEffect(() => {
    if (gameType === null) {
      setLevel(null);
      setIsStarted(false);
      setProgress(0);
    }
  }, [gameType]);

  const gameProgressUpdateCallback = (
    event?: ICatEventsDetails[GameEvent.GAME_PROGRESS_UPDATE],
  ) => {
    if (!event) return;

    setProgress(event.progress);
  };

  GameEvents.GAME_PROGRESS_UPDATE.use(gameProgressUpdateCallback);

  const gameStopCallback = React.useCallback(
    async (event?: ICatEventsDetails[GameEvent.GAME_STOP]) => {
      if (!profile || !event) return;

      const earnedScore =
        gameType === GameType.CATNIP_CHAOS || GameType.PIXEL_RESCUE
          ? event.score
          : event.score || 0;

      setIsStarted(false);

      setGameStop({
        score: earnedScore,
        time: event.time ?? 0,
        completedLevel: event.completedLevel ?? null,
      });

      let catnipChaos = profile.catnipChaos;
      const result = await USER_API.saveMatch({
        points: earnedScore,
        time: event.time ?? 0,
        type: gameType!,
        level: level!,
      });
      catnipChaos = result?.catnipChaos || profile.catnipChaos || [];
      if (result === null) {
        showToast({ message: "You run out of lives ):" });
      }
      setProfileUpdate({
        catnipChaos,
      });
    },
    [profile, gameType, level],
  );

  GameEvents.GAME_STOP.use(gameStopCallback);

  GameEvents.GAME_START.use(() => {
    setIsStarted(true);
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
    gameStop,
    level,
    setLevel: (level: string | null) => {
      setLevel(level);
      setIsStarted(!!level);
    },
  };

  const onClose = () => {
    setGameStop(null);
    setLevel(null);
    setIsStarted(false);
  };

  const tryAgain = (nextLevel?: string) => {
    setGameStop(null);
    setGameType(gameType);
    if (nextLevel) {
      setLevel(null);
      setTimeout(() => {
        setLevel(nextLevel);
        setIsStarted(true);
      }, 200);
    } else {
      GameEvents.GAME_START.push({ cat: profile?.cat, isRestart: true });
    }
  };

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
              !(isStarted && gameType !== GameType.CATNIP_CHAOS) &&
              !(isStarted && gameType !== GameType.PIXEL_RESCUE) &&
              gameType !== GameType.SHELTER &&
              !(gameType === GameType.HOME && !!profile.cat?.status?.EAT)
            }
          />

          {openedModal === GameModal.PROFILE && (
            <TelegramProfile close={() => setOpenedModal(null)} />
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
    gameStop: context.gameStop,
    level: context.level,
    addNotification: context.addNotification,
    setLevel: context.setLevel,
  };
}

export { GameProvider, useGame };
