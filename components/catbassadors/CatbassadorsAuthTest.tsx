import { TDeleteLive } from "@/constants/telegram-api";
import { useTelegramAuthTest } from "@/context/TelegramAuthContextTest";
import { useToast } from "@/context/ToastContext";
import { catbassadorsGameDuration } from "@/models/cats";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { PixelButton } from "../button/PixelButton";
import {
  useGameOverEvent,
  useGameStartEvent,
  useGameTimerUpdate,
} from "./hooks";

const Catbassadors = dynamic(
  () => import("@/components/catbassadors/Catbassadors"),
  { ssr: false }
);

const startGame = () => {
  const event = new CustomEvent("game-start", {
    detail: { start: true },
  });

  window.dispatchEvent(event);
};

let timerInterval: any = null;

export const CatbassadorsAuthTest = () => {
  const showToast = useToast();
  const { profile, user, showProfilePopup, redeemLives, refetchProfile } =
    useTelegramAuthTest();
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [timer, setTimer] = useState(0);

  useGameOverEvent(async (event) => {
    setIsGameStarted(false);
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
      setTimer(0);
    }
    showToast({ message: `You earned ${event.detail.score} coins` });
    await TDeleteLive(event.detail.score || 0);
    refetchProfile();
  });

  useGameStartEvent(() => {
    setIsGameStarted(true);

    setTimer(catbassadorsGameDuration);

    if (timerInterval) {
      clearInterval(timerInterval);
    }

    timerInterval = setInterval(() => {
      setTimer((v) => (v === 0 ? 0 : v - 1));
    }, 1000);
  });

  const playGame = useCallback(() => {
    if (profile?.catbassadorsLives) {
      startGame();
      setIsGameStarted(true);
    } else {
      showToast({ message: "Invite friends to earn lives !" });
    }
  }, [profile]);

  useGameTimerUpdate(setTimer);

  if (!profile) {
    return (
      <img
        alt="Telegram sticker"
        src="https://xelene.me/telegram.gif"
        style={{ display: "block", width: "144px", height: "144px" }}
      />
    );
  }

  return (
    <div>
      <Catbassadors cat={profile?.cat} profile={profile} timer={timer} />
      {!isGameStarted && profile && (
        <>
          <div className="fixed bottom-8 left-4 right-4 pb-safe flex justify-between items-end">
            <div className="flex flex-col items-center animate-hover">
              <div className="flex flex-col items-center font-secondary text-p2 opacity-75 bg-yellow-300 px-2 rounded-t-xl">
                <img className="w-8 z-10 pt-2" src="/base/heart.png" />
                <div className="-mt-1">{profile.catbassadorsLives || 0}</div>
                <div className="-mt-2 text-p4">LIVES</div>
              </div>
              <PixelButton
                active={!profile.catbassadorsLives}
                onClick={() => playGame()}
                text="Play"
              ></PixelButton>
            </div>
            <PixelButton
              onClick={() => {
                showProfilePopup();
              }}
              text="STATS"
            ></PixelButton>

            {profile.canRedeemLives && (
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-center font-secondary text-p2 opacity-75 bg-white px-2 rounded-t-xl">
                  <img className="w-8 z-10 pt-2" src="/base/heart.png" />
                  <div className="-mt-1">FREE</div>
                  <div className="-mt-2 text-p4">LIVES</div>
                </div>
                <PixelButton
                  onClick={() => (profile.canRedeemLives ? redeemLives() : {})}
                  text="REDEEM"
                ></PixelButton>
              </div>
            )}
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-center font-secondary text-p2 opacity-75 bg-white px-1 rounded-t-xl">
                <img className="w-8 z-10 -mt-2 pt-4" src="/logo/coin.webp" />
                <div>EARN</div>
                <div className="-mt-2 text-p5">+250 COINS</div>
                <div className="-mt-2 text-h3">+</div>
                <img className="w-8 z-10 -mt-3" src="/base/heart.png" />
                <div className="-mt-1">GET</div>
                <div className="text-p5 -mt-2">+1 daily live</div>
              </div>
              <PixelButton onClick={() => {}} text="INVITE"></PixelButton>
            </div>
          </div>
        </>
      )}
      <div
        className={`pb-safe fixed bottom-6 left-0 right-0 w-full flex justify-between ${
          !isGameStarted ? "hidden" : ""
        }`}
      >
        <button id="jump">
          <img className="control-button" src="game/controls/jump.png" />
        </button>
        <div className="">
          <button id="left">
            <img className="control-button" src="game/controls/left.png" />
          </button>
          <button id="right">
            <img className="control-button" src="game/controls/right.png" />
          </button>
        </div>
      </div>
    </div>
  );
};
