import React, { useEffect, useRef, useState } from "react";
import { CloseButton } from "../shared/CloseButton";
import { GameEvent, GameEvents, ICatEvent } from "./events";
import { useGame } from "@/context/GameContext";

export const DisplayCoins: React.FC<{}> = () => {
  const [totalTokens, setTotalTokens] = useState(0);
  const [displayAmount, setDisplayAmount] = useState(0);

  const [showAmount, setShowAmount] = useState(false);

  // Buff tracking
  const [showPowerUp, setShowPowerUp] = useState(false);
  const [powerUpType, setPowerUpType] = useState<string | null>(null);
  const [cooldownPercentage, setCooldownPercentage] = useState(100);

  // We keep the current active interval ID, so we can clear it
  const buffIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { timer } = useGame();

  useEffect(() => {
    const handleCoinCaught = (event: { detail: { score: number } }) => {
      const amount = event.detail.score;
      setDisplayAmount(amount);
      setTotalTokens((prevTotal) => prevTotal + amount);
      setShowAmount(true);

      setTimeout(() => {
        setShowAmount(false);
      }, 600);
    };

    const handlePowerUp = (event: ICatEvent<GameEvent.CAT_BUFF>) => {
      const { buff, duration } = event.detail;

      // Clear any existing interval so we can start fresh
      if (buffIntervalRef.current) {
        clearInterval(buffIntervalRef.current);
        buffIntervalRef.current = null;
      }

      if (!buff) {
        // Means the buff ended
        setShowPowerUp(false);
        setPowerUpType(null);
        setCooldownPercentage(100);
        return;
      }

      // Start showing the buff icon
      setPowerUpType(buff);
      setShowPowerUp(true);

      // Reset the cooldown meter to 100%
      setCooldownPercentage(100);
      let elapsed = 0;
      const updateInterval = 100;

      // Start a new interval
      const newInterval = setInterval(() => {
        elapsed += updateInterval;
        const percentage = 100 - (elapsed / duration) * 100;
        setCooldownPercentage(Math.max(percentage, 0));

        // If we've reached the end of this buff's duration
        if (elapsed >= duration) {
          clearInterval(newInterval);
          setShowPowerUp(false);
          setPowerUpType(null);
        }
      }, updateInterval);

      buffIntervalRef.current = newInterval;
    };

    const handleGameStart = () => {
      // If you need to do something on start
    };

    const handleGameStop = () => {
      // Reset UI state
      setShowPowerUp(false);
      setPowerUpType(null);
      setCooldownPercentage(100);

      // Clear any leftover buff interval
      if (buffIntervalRef.current) {
        clearInterval(buffIntervalRef.current);
        buffIntervalRef.current = null;
      }
    };

    // Attach listeners
    GameEvents[GameEvent.GAME_COIN_CAUGHT].addEventListener(handleCoinCaught);
    GameEvents[GameEvent.GAME_START].addEventListener(handleGameStart);
    GameEvents[GameEvent.GAME_STOP].addEventListener(handleGameStop);
    GameEvents[GameEvent.CAT_BUFF].addEventListener(handlePowerUp);

    // Cleanup on unmount
    return () => {
      GameEvents[GameEvent.GAME_COIN_CAUGHT].removeEventListener(
        handleCoinCaught
      );
      GameEvents[GameEvent.GAME_START].removeEventListener(handleGameStart);
      GameEvents[GameEvent.GAME_STOP].removeEventListener(handleGameStop);
      GameEvents[GameEvent.CAT_BUFF].removeEventListener(handlePowerUp);
    };
  }, []);

  return (
    <div className="z-10">
      {/* Coin Display */}
      <div
        className="fixed left-4 pb-safe top-4 z-10 justify-between flex hover:brightness-110 flex-col w-20 items-center font-secondary rounded-xl px-1 py-2"
        style={{
          backgroundImage: "url(/backgrounds/bg-9.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <img
          draggable={false}
          className="w-6 h-6"
          src="/logo/coin.webp"
          alt="Coin"
        />
        <div className="text-p4 flex items-center gap-1">
          <div>COINS</div>
        </div>
        <div className="flex items-center gap-2 -mt-1">
          <div className="text-p5">{totalTokens}</div>
        </div>
      </div>
      <CloseButton
        onClick={() =>
          GameEvents.GAME_STOP.push({
            score: displayAmount,
            time: 0,
          })
        }
        absolute
      />

      {/* Floating +Coin Display */}
      {showAmount && (
        <div className="inline-flex items-center justify-center absolute top-[43%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 text-yellow-500 text-p3 font-bold">
          +{displayAmount}
          <img
            draggable={false}
            src="/catbassadors/coin.gif"
            className="w-16 h-16"
            alt="Coin animation"
          />
        </div>
      )}

      {/* Buff Cooldown Display */}
      {showPowerUp && powerUpType && (
        <div className="inline-flex items-center justify-center absolute top-10 left-1/2 transform -translate-x-[50%] -translate-y-1/2">
          <div className="relative w-14 h-14">
            <img
              draggable={false}
              src={`/buff/${powerUpType}-ICON.png`}
              className="absolute top-0 left-0 w-full h-full"
              alt="buff icon"
            />
            <div
              className="absolute top-0 left-0 w-full h-full rounded-full"
              style={{
                background: `conic-gradient(rgba(255, 255, 255, 0.6) 0% ${
                  100 - cooldownPercentage
                }%, transparent ${100 - cooldownPercentage}% 100%)`,
              }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};
