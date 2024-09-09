import {
  useGameOverEvent,
  useGameStartEvent,
  useGameTimerUpdate,
} from "@/components/catbassadors/hooks";
import { GameOptionsModal } from "@/components/game/GameOptionsModal";
import { GameSelect } from "@/components/game/GameSelect";
import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { MobileButtons } from "@/components/Phaser/MobileButtons/MobileButtons";
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

const startGame = () => {
  const event = new CustomEvent("game-start", {
    detail: { start: true },
  });

  window.dispatchEvent(event);
};

const GameContext = React.createContext<ContextState | undefined>(undefined);

let timerInterval: any = null;

const GameProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [isStarted, setIsStarted] = React.useState<boolean>(false);
  const [gameType, setGameType] = React.useState<GameType | null>(null);
  const [openedModal, setOpenedModal] = React.useState<GameModal | null>(null);
  const { profile, setProfileUpdate, utils, shareUrl } = useProfile();
  const showToast = useToast();

  const [timer, setTimer] = React.useState<number>(0);
  useGameOverEvent(async (event) => {
    if (!profile) {
      return;
    }
    const earnedScore = event.detail.score || 0;
    setIsStarted(false);
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
      setTimer(0);
    }
    showToast({ message: `You earned ${earnedScore} coins` });
    await TDeleteLive(earnedScore);
    setProfileUpdate({
      catbassadorsLives: (profile.catbassadorsLives || 1) - 1,
      catpoints: profile.catpoints + earnedScore,
    });
  });

  useGameStartEvent(() => {
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
      startGame();
      setIsStarted(true);
    } else {
      showToast({ message: "Invite friends to earn lives !" });
    }
  }, [profile]);

  useGameTimerUpdate(setTimer);

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
          <MobileButtons isHidden={!isStarted} />

          {openedModal === GameModal.PROFILE && (
            <TelegramProfile close={() => setOpenedModal(null)} />
          )}
          {openedModal === GameModal.QUESTS && (
            <QuestsModal close={() => setOpenedModal(null)} />
          )}
          {[GameModal.LEADERBOARD, GameModal.LEADERBOARD_DAILY].includes(
            openedModal as GameModal
          ) && <Leaderboard type={openedModal!} close={() => setOpenedModal(null)} />}
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
