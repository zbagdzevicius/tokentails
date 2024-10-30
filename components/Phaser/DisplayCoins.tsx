import React, { useEffect, useState } from "react";
import { GameEvents, GameEvent } from "./events";

export const DisplayCoins: React.FC<{ isHidden: boolean }> = ({ isHidden }) => {
    const [totalTokens, setTotalTokens] = useState(0);
    const [displayAmount, setDisplayAmount] = useState(0);
    const [showAmount, setShowAmount] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        const handleCoinCaught = (event: { detail: { score: number } }) => {
            const amount = event.detail.score;
            setDisplayAmount(amount);
            setTotalTokens(prevTotal => prevTotal + amount);
            setShowAmount(true);
            setFadeOut(false);

            setTimeout(() => {
                setFadeOut(true);
                setTimeout(() => {
                    setShowAmount(false);
                }, 500);
            }, 600);
        };

        GameEvents[GameEvent.GAME_COIN_CAUGHT].addEventListener(handleCoinCaught);

        return () => {
            GameEvents[GameEvent.GAME_COIN_CAUGHT].removeEventListener(handleCoinCaught);
        };
    }, []);

    return (
        <div className={`${isHidden ? 'hidden' : ''}`}>
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
                    className={`inline-flex items-center justify-center absolute top-[45%] left-1/2 transform -translate-x-[50%] -translate-y-1/2 text-yellow-500 text-xl font-bold transition-opacity duration-500 ease-in-out ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
                >
                    +{displayAmount}
                    <img src='/catbassadors/coin.gif' alt="Coin animation" />
                </div>
            )}
        </div>
    );
};
