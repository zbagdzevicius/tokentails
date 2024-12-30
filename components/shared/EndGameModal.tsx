import { CloseButton } from "./CloseButton";
import { getMultiplier } from "../CatCardModal";
import { useProfile } from "@/context/ProfileContext";
import React from "react";
import { Tag } from "./Tag";
import { GameType } from "@/models/game";

type EndGameProps = {
    show: boolean;
    onClose: () => void;
    score: number;
    playTime: number;
    gameType: GameType
};

export const EndGameModal: React.FC<EndGameProps> = ({ show, onClose, score, playTime, gameType }) => {
    const { profile } = useProfile()
    if (!show) return null;

    return (
        <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
            <div
                onClick={onClose}
                className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
            ></div>

            <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-purple-300 to-blue-300 absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
                <CloseButton onClick={onClose} />
                <div className="p-6 flex items-center justify-center flex-col">
                    <Tag>Game Summary</Tag>
                    {gameType === GameType.CATBASSADORS && <img src='/game/select/catbassadors.jpg' className="w-32 h-32" alt='cattbassadors logo' />}
                    {gameType === GameType.PURRQUEST && <img src='/game/select/purrquest.jpg' className="w-32 h-32 " alt='cattbassadors purrquest' />}
                    <div className="flex justify-center items-center text-md text-gray-700 mt-4">
                        <img
                            src="/logo/coin.png"
                            alt="Score Icon"
                            className="w-6 h-6 mr-2"
                        />
                        <p className="lg:text-lg text-base font-medium">
                            You collected <span className="font-bold">{score}</span> coins! X{getMultiplier(profile?.cat)}
                        </p>
                    </div>
                    <div className="flex justify-center items-center text-md text-gray-700 mt-2">
                        <img
                            src="/icons/clock.png"
                            alt="Time Icon"
                            className="w-6 h-6 mr-2"
                        />
                        <p className="lg:text-lg text-base font-medium">
                            Total play time: <span className="font-bold">{Math.floor(playTime)} seconds</span>.
                        </p>
                    </div>
                    <img src="/meme-cats/meme-48.gif" className=" w-20 h-20" />
                </div>

            </div>
        </div>
    );
};
