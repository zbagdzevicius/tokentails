import { GameOptionsModal } from "@/components/game/GameOptionsModal";
import { GameSelect } from "@/components/game/GameSelect";
import { Leaderboard } from "@/components/Leaderboard";
import { DisplayCoins } from "@/components/Phaser/DisplayCoins";

import {
  GameEvent,
  GameEvents,
  ICatEventsDetails,
  IGameStopEvent,
} from "@/components/Phaser/events";
import { MobileButtons } from "@/components/Phaser/MobileButtons/MobileButtons";
import { CatsModal } from "@/components/shared/CatsModal";
import { GameMusicPlayer } from "@/components/shared/GameMusicPlayer";
import { InviteModal } from "@/components/shared/InviteModal";
import { QuestsModal } from "@/components/shared/QuestsModal";
import { SpeechBubble } from "@/components/shared/SpeechBubble";
import { TelegramProfile } from "@/components/shared/TelegramProfile";
import { catbassadorsGameDuration } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import * as React from "react";
import { useState, useEffect } from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";
import { EndGameModal } from "@/components/shared/EndGameModal";
import { getMultiplier } from "@/components/CatCardModal";
import { IToast } from "./ToastContext";
import { Notification } from "@/components/shared/Notification";
import { ControlModal } from "@/components/shared/ControlModal";
import { USER_API } from "@/api/user-api";

type ContextState = {
  isStarted?: boolean;
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
  timer: number;
  playGame: () => void;
  addNotification: (notification: IToast) => void;
  setOpenedModal: (modal: GameModal | null) => void;
};

const GameContext = React.createContext<ContextState | undefined>(undefined);

let timerInterval: any = null;

const GameProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [gameType, setGameType] = useState<GameType | null>(GameType.HOME);
  const [openedModal, setOpenedModal] = useState<GameModal | null>(null);
  const [gameStop, setGameStop] = useState<null | IGameStopEvent>(null);

  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const isGameLoaded = GameEvents.GAME_LOADED.use();
  const [timer, setTimer] = useState<number>(0);
  const [notifications, setNotifications] = useState<IToast[]>([]);

  const addNotification = (notification: IToast) => {
    setNotifications((prev) => [...prev, notification]);
  };

  useEffect(() => {
    if (notifications.length > 0) {
      const timeout = setTimeout(() => {
        setNotifications((prev) => prev.slice(1));
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [notifications]);

  const gameStopCallback = React.useCallback(
    async (event?: ICatEventsDetails[GameEvent.GAME_STOP]) => {
      if (!profile || !event) return;

      const multiplier = getMultiplier(profile?.cat);
      const earnedScore = (event.score || 0) * multiplier;

      setIsStarted(false);
      setTimer(0);

      setGameStop({
        score: earnedScore,
        time: event.time ?? 0,
      });

      await USER_API.saveMatch({
        points: earnedScore,
        time: event.time ?? 0,
        type: gameType!,
      });
      setProfileUpdate({
        catbassadorsLives: (profile.catbassadorsLives || 1) - 1,
        catpoints: profile.catpoints + earnedScore,
      });
    },
    [profile, gameType]
  );

  GameEvents.GAME_STOP.use(gameStopCallback);

  GameEvents.GAME_START.use(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    setIsStarted(true);
    setTimer(catbassadorsGameDuration);
    timerInterval = setInterval(() => {
      setTimer((v) => {
        return v === 0 ? 0 : v - 1;
      });
    }, 1000);
  });

  const playGame = React.useCallback(() => {
    if (profile?.catbassadorsLives) {
      GameEvents.GAME_START.push({ cat: profile?.cat });
      setIsStarted(true);
    } else {
      showToast({ message: "Invite friends to earn lives !" });
    }
  }, [profile]);

  GameEvents.GAME_UPDATE.use((event) => {
    if (event) {
      setTimer((time) => (time || 0) + event.additionalTime!);
    }
  });
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

  GameEvents.BUFF_SPAWN.use((event) => {
    if (event) {
      addNotification({
        message: `BUFF APPEARED`,
        icon: `/buff/${event.buff}-ICON.png`,
        isError: false,
      });
    }
  });

  const value = {
    isStarted,
    playGame,
    gameType,
    setGameType,
    timer,
    addNotification,
    setOpenedModal,
  };

  return (
    <GameContext.Provider value={value}>
      {gameStop && (
        <EndGameModal
          onClose={() => setGameStop(null)}
          gameStop={gameStop}
          gameType={gameType!}
        />
      )}
      {!isStarted && (
        <GameSelect gameType={gameType} setGameType={setGameType} />
      )}
      {profile && (
        <>
          {!isStarted && (
            <GameOptionsModal
              profile={profile}
              gameType={gameType}
              setOpenedModal={setOpenedModal}
              setProfileUpdate={setProfileUpdate}
            />
          )}
          <Notification notifications={notifications} />
          <MobileButtons
            isHidden={!isStarted && gameType !== GameType.SHELTER}
          />
          {isStarted &&
            [GameType.CATBASSADORS, GameType.PURRQUEST].includes(gameType!) && (
              <DisplayCoins />
            )}

          {openedModal === GameModal.PROFILE && (
            <TelegramProfile close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.QUESTS && (
            <QuestsModal close={() => setOpenedModal(null)} />
          )}
          {[GameModal.LEADERBOARD].includes(openedModal as GameModal) && (
            <Leaderboard close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.CATS && (
            <CatsModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.INVITE && (
            <InviteModal close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.CONTROL_SETTINGS && (
            <ControlModal close={() => setOpenedModal(null)} />
          )}
          {gameType === GameType.HOME && isGameLoaded && profile.cat && (
            <SpeechBubble />
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
    setGameType: context.setGameType,
    timer: context.timer,
    playGame: context.playGame,
    setOpenedModal: context.setOpenedModal,
  };
}

export { GameProvider, useGame };
