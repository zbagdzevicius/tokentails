import React, { useEffect, useState } from "react";
import { GameEvents, GameEvent } from "./events";
import { ICatEvent } from "./events";

export const DisplayCoins: React.FC<{ isHidden: boolean }> = ({ isHidden }) => {
    const [totalTokens, setTotalTokens] = useState(0);
    const [displayAmount, setDisplayAmount] = useState(0);
    const [showAmount, setShowAmount] = useState(false);
    const [showPowerUp, setShowPowerUp] = useState(false);
    const [powerUpType, setPowerUpType] = useState<string | null>(null);
    const [cooldownPercentage, setCooldownPercentage] = useState(100);
    const [isGameActive, setIsGameActive] = useState(false);

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

        const handlePowerUp = (event: ICatEvent<GameEvent.CAT_POWER_UP>) => {
            const { buff, duration } = event.detail;
            setPowerUpType(buff);
            setShowPowerUp(true);
            let interval: NodeJS.Timeout;
            let elapsed = 0;
            const updateInterval = 100;

            interval = setInterval(() => {
                elapsed += updateInterval;
                const percentage = 100 - (elapsed / duration) * 100;
                setCooldownPercentage(Math.max(percentage, 0));

                if (elapsed >= duration) {
                    clearInterval(interval);
                    setShowPowerUp(false);
                }
            }, updateInterval);
        };

        const handleGameStart = () => setIsGameActive(true);
        const handleGameStop = () => {
            setIsGameActive(false);
            setShowPowerUp(false);
        };

        GameEvents[GameEvent.GAME_COIN_CAUGHT].addEventListener(handleCoinCaught);
        GameEvents[GameEvent.GAME_START].addEventListener(handleGameStart);
        GameEvents[GameEvent.GAME_STOP].addEventListener(handleGameStop);
        GameEvents[GameEvent.CAT_POWER_UP].addEventListener(handlePowerUp);

        return () => {
            GameEvents[GameEvent.GAME_COIN_CAUGHT].removeEventListener(handleCoinCaught);
            GameEvents[GameEvent.GAME_START].removeEventListener(handleGameStart);
            GameEvents[GameEvent.GAME_STOP].removeEventListener(handleGameStop);
            GameEvents[GameEvent.CAT_POWER_UP].removeEventListener(handlePowerUp);
        };
    }, []);

    return (
        <div className={`${isHidden ? "hidden" : "z-10"}`}>
            <div className="m-3 flex flex-col w-20 absolute items-center font-secondary rounded-xl px-1 py-2 bg-gradient-to-b from-yellow-300 to-red-300">
                <img className="w-6 h-6" src="/logo/coin.webp" alt="Coin" />
                <div className="text-p4 flex items-center gap-1">
                    <div>COINS</div>
                </div>
                <div className="flex items-center gap-2 -mt-1">
                    <div className="text-p5">{totalTokens}</div>
                </div>
            </div>
            {showAmount && (
                <div
                    className="inline-flex items-center justify-center absolute top-[43%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 text-yellow-500 text-p3 font-bold"
                >
                    +{displayAmount}
                    <img src="/catbassadors/coin.gif" className="w-16 h-16" alt="Coin animation" />
                </div>
            )}
            {showPowerUp && (
                <div
                    className="inline-flex items-center justify-center absolute top-10 left-1/2 transform -translate-x-[50%] -translate-y-1/2"
                >
                    <div className="relative w-14 h-14">
                        <img
                            src={`/power-up/${powerUpType}-ICON.png`}
                            className="absolute top-0 left-0 w-full h-full"
                            alt="Power-up icon"
                        />
                        <div
                            className="absolute top-0 left-0 w-full h-full rounded-full"
                            style={{
                                background: `conic-gradient(rgba(255, 255, 255, 0.6) 0% ${100 - cooldownPercentage}%, transparent ${100 - cooldownPercentage}% 100%)`,
                            }}
                        ></div>
                    </div>
                </div>
            )}
        </div>
    );
};
