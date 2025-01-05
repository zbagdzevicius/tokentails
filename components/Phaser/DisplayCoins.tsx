import React, { useEffect, useState } from "react";
import { GameEvents, GameEvent } from "./events";
import { ICatEvent } from "./events";

export const DisplayCoins: React.FC<{ isHidden: boolean }> = ({ isHidden }) => {
    const [totalTokens, setTotalTokens] = useState(0);
    const [displayAmount, setDisplayAmount] = useState(0);
    const [showAmount, setShowAmount] = useState(false);
    const [showPowerUp, setShowPowerUp] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);
    const [powerUpType, setPowerUpType] = useState<string | null>(null);
    const [showEnemySpawn, setShowEnemySpawn] = useState(false);
    const [showBossSpawn, setShowBossSpawn] = useState(false); // State for boss spawn
    const [enemyCount, setEnemyCount] = useState(0);
    const [displayPriority, setDisplayPriority] = useState<"none" | "powerUp" | "enemy" | "boss" | "coin">("none");

    useEffect(() => {
        const handleCoinCaught = (event: { detail: { score: number } }) => {
            if (displayPriority !== "none") return;

            setDisplayPriority("coin");
            const amount = event.detail.score;
            setDisplayAmount(amount);
            setTotalTokens((prevTotal) => prevTotal + amount);
            setShowAmount(true);
            setFadeOut(false);

            setTimeout(() => {
                setFadeOut(true);
                setTimeout(() => {
                    setShowAmount(false);
                    setDisplayPriority("none");
                }, 500);
            }, 600);
        };

        const handlePowerUp = (event: ICatEvent<GameEvent.CAT_POWER_UP>) => {
            if (displayPriority === "powerUp" || displayPriority === "enemy" || displayPriority === "boss") return;

            setDisplayPriority("powerUp");
            const { powerup } = event.detail;
            setPowerUpType(powerup);
            setShowPowerUp(true);
            setFadeOut(false);

            setTimeout(() => {
                setShowPowerUp(false);
                setDisplayPriority("none");
            }, 500);
        };

        const handleEnemySpawn = (event: ICatEvent<GameEvent.ENEMY_SPAWN>) => {
            if (displayPriority === "powerUp" || displayPriority === "boss") return;

            setDisplayPriority("enemy");
            setEnemyCount((prevCount) => {
                if (prevCount < 5) {
                    setShowEnemySpawn(true);
                    setTimeout(() => {
                        setShowEnemySpawn(false);
                        setDisplayPriority("none");
                    }, 500);
                }
                return prevCount + 1;
            });
        };

        const handleBossSpawn = (event: ICatEvent<GameEvent.BOSS_SPAWN>) => {
            if (displayPriority !== "none") return;

            setDisplayPriority("boss");
            setShowBossSpawn(true);
            setTimeout(() => {
                setShowBossSpawn(false);
                setDisplayPriority("none");
            }, 1000);
        };

        GameEvents[GameEvent.GAME_COIN_CAUGHT].addEventListener(handleCoinCaught);
        GameEvents[GameEvent.CAT_POWER_UP].addEventListener(handlePowerUp);
        GameEvents[GameEvent.ENEMY_SPAWN].addEventListener(handleEnemySpawn);
        GameEvents[GameEvent.BOSS_SPAWN].addEventListener(handleBossSpawn);

        return () => {
            GameEvents[GameEvent.GAME_COIN_CAUGHT].removeEventListener(handleCoinCaught);
            GameEvents[GameEvent.CAT_POWER_UP].removeEventListener(handlePowerUp);
            GameEvents[GameEvent.ENEMY_SPAWN].removeEventListener(handleEnemySpawn);
            GameEvents[GameEvent.BOSS_SPAWN].removeEventListener(handleBossSpawn);
        };
    }, [displayPriority]);

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
            {showAmount && displayPriority === "coin" && (
                <div
                    className={`inline-flex items-center justify-center absolute top-[43%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 text-yellow-500 text-p3 font-bold transition-opacity duration-500 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`}
                >
                    +{displayAmount}
                    <img src="/catbassadors/coin.gif" className="w-16 h-16" alt="Coin animation" />
                </div>
            )}
            {showPowerUp && displayPriority === "powerUp" && (
                <div
                    className={`inline-flex items-center justify-center absolute top-[43%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 transition-opacity duration-500 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`}
                >
                    <div className="inline-flex items-center justify-center text-yellow-500 text-p3 font-bold">
                        +1
                        <img
                            src={`/power-up/${powerUpType}.png`}
                            className="w-12 h-12"
                            alt="Power-up animation"
                        />
                    </div>
                </div>
            )}
            {showEnemySpawn && displayPriority === "enemy" && (
                <div
                    className="inline-flex items-center justify-center absolute top-[43%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 text-yellow-500 text-p3 font-bold"
                >
                    +1 Enemy
                    <img
                        src={`/enemies/single-fluffie.png`}
                        className="w-12 h-12"
                        alt="Enemy"
                    />
                </div>
            )}
            {showBossSpawn && displayPriority === "boss" && (
                <div
                    className="inline-flex items-center justify-center absolute top-[43%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 text-red-500 text-p3 font-bold"
                >
                    +1
                    <img
                        src={`/enemies/boss/boss-simple.png`}
                        className="w-14 h-14"
                        alt="Boss"
                    />
                </div>
            )}
        </div>
    );
};
