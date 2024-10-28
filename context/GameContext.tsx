import { GameOptionsModal } from "@/components/game/GameOptionsModal";
import { GameSelect } from "@/components/game/GameSelect";
import { Leaderboard } from "@/components/Leaderboard";
import {
  GameEvent,
  GameEvents,
  ICatEventsDetails,
} from "@/components/Phaser/events";
import { MobileButtons } from "@/components/Phaser/MobileButtons/MobileButtons";
import { CatsModal } from "@/components/shared/CatsModal";
import { QuestsModal } from "@/components/shared/QuestsModal";
import { TelegramProfile } from "@/components/shared/TelegramProfile";
import { TDeleteLive } from "@/constants/telegram-api";
import { catbassadorsGameDuration } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import * as React from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";

type ContextState = {
  isStarted?: boolean;
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
  timer: number;
};

const GameContext = React.createContext<ContextState | undefined>(undefined);

let timerInterval: any = null;

const GameProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [isStarted, setIsStarted] = React.useState<boolean>(false);
  const [gameType, setGameType] = React.useState<GameType | null>(
    GameType.HOME
  );
  const [openedModal, setOpenedModal] = React.useState<GameModal | null>(null);
  const { profile, setProfileUpdate, utils, shareUrl } = useProfile();
  const showToast = useToast();

  const [timer, setTimer] = React.useState<number>(0);
  const gameStopCallback = React.useCallback(
    async (event?: ICatEventsDetails[GameEvent.GAME_STOP]) => {
      if (!profile || !event) {
        return;
      }
      const earnedScore = (event.score || 0) * (profile?.cat.catpoints ? 2 : 1);
      const message: string = event.message || "";
      setIsStarted(false);
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        setTimer(0);
      }
      showToast({ message: `You earned ${earnedScore} coins ${message}` });
      await TDeleteLive(earnedScore);
      setProfileUpdate({
        catbassadorsLives: (profile.catbassadorsLives || 1) - 1,
        catpoints: profile.catpoints + earnedScore,
      });
    },
    [profile]
  );
  GameEvents.GAME_STOP.use(gameStopCallback);

  GameEvents.GAME_START.use(() => {
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

  const value = {
    isStarted,
    setIsStarted,
    gameType,
    setGameType,
    timer,
  };

  return (
    <GameContext.Provider value={value}>
      {!isStarted && (
        <GameSelect gameType={gameType} setGameType={setGameType} />
      )}
      {profile && (
        <>
          {!isStarted && (
            <GameOptionsModal
              utils={utils}
              profile={profile}
              gameType={gameType}
              shareUrl={shareUrl}
              setOpenedModal={setOpenedModal}
              setIsStarted={playGame}
              setProfileUpdate={setProfileUpdate}
            />
          )}
          <div className="fixed inset-0">
            <img
              src="/catgame/spooky.webp"
              className="w-16 m-auto draggable"
              draggable="false"
            />
          </div>
          <MobileButtons isHidden={!isStarted} />

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
  };
}

export { GameProvider, useGame };
