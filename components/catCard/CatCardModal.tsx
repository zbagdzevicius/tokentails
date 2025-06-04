import { useGame } from "@/context/GameContext";
import { cardsColor, ICat } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import { useRouter } from "next/router";
import React from "react";
import { CloseButton } from "../shared/CloseButton";
import { Web3Providers } from "../web3/Web3Providers";
import { CatCard } from "./CatCard";

interface IProps extends ICat {
  onClose?: (gameModal?: GameModal) => void;
  onAdopted?: () => void;
  relative?: boolean;
}

export const CatCardModal: React.FC<IProps> = ({ onClose, ...catData }) => {
  const { setGameType } = useGame();
  const router = useRouter();
  const onAdopted = () => {
    if (catData.relative) {
      router.push(`/game`);
    } else {
      setGameType(GameType.HOME);
    }
  };

  return (
    <div className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]">
      <div
        className="absolute inset-0 z-0 opacity-50"
        style={{ backgroundColor: cardsColor[catData.type] || "white" }}
        onClick={() => onClose?.()}
      ></div>
      <CloseButton absolute onClick={() => onClose?.()} />

      <Web3Providers>
        <CatCard {...catData} onClose={onClose} onAdopted={onAdopted} />
      </Web3Providers>
    </div>
  );
};
