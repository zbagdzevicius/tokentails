import CatnipChaos from "@/components/CatnipChaos/CatnipChaos";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useBodyOverflowHidden } from "@/hooks/useBodyOverflowHidden";
import { GameType } from "@/models/game";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useBackground } from "../../constants/hooks";
import Snowfall from "../shared/Snowfall";
const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });
const Adopt = dynamic(() => import("@/components/shelter/Shelter"), {
  ssr: false,
});
export const Game = () => {
  const { gameType, isStarted, level } = useGame();
  const { profile } = useProfile();
  const background = useBackground({ level, gameType });
  useBodyOverflowHidden();
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-h-screen h-full absolute" style={background}>
      {showIntro && (
        <div className="intro-pinwheel">
          <div className="intro-pinwheel-bg" />
          <div className="intro-coin-wrapper">
            <img src="/logo/coin.webp" alt="Coin" className="intro-coin" />
          </div>
        </div>
      )}
      {!isStarted && <Snowfall />}
      {gameType === GameType.HOME && profile && <Base />}
      {gameType === GameType.SHELTER && profile && <Adopt />}
      {gameType === GameType.CATNIP_CHAOS && profile && <CatnipChaos />}
      <style jsx>{`
        .intro-pinwheel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999;
          opacity: 0;
          animation: introFade 2s ease-in-out forwards;
          overflow: visible;
        }

        .intro-pinwheel-bg {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 200vw;
          height: 200vh;
          transform: translate(-50%, -50%);
          background: conic-gradient(
            from 0deg,
            #713f12 0deg 22.5deg,
            #fcecbb 22.5deg 45deg,
            #713f12 45deg 67.5deg,
            #fcecbb 67.5deg 90deg,
            #713f12 90deg 112.5deg,
            #fcecbb 112.5deg 135deg,
            #713f12 135deg 157.5deg,
            #fcecbb 157.5deg 180deg,
            #713f12 180deg 202.5deg,
            #fcecbb 202.5deg 225deg,
            #713f12 225deg 247.5deg,
            #fcecbb 247.5deg 270deg,
            #713f12 270deg 292.5deg,
            #fcecbb 292.5deg 315deg,
            #713f12 315deg 337.5deg,
            #fcecbb 337.5deg 360deg
          );
          border-radius: 50%;
          animation: introSpin 2s ease-in-out forwards;
        }

        .intro-coin-wrapper {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
          pointer-events: none;
          animation: introCoinSpin 2s ease-in-out forwards;
        }

        .intro-coin {
          display: block;
          width: 120px;
          height: 120px;
          min-width: 120px;
          object-fit: contain;
        }

        @keyframes introFade {
          0% {
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes introSpin {
          0% {
            transform: translate(-50%, -50%) scale(0.5) rotate(0deg);
          }
          10% {
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
          70% {
            transform: translate(-50%, -50%) scale(1) rotate(360deg);
          }
          100% {
            transform: translate(-50%, -50%) scale(0) rotate(360deg);
          }
        }

        @keyframes introCoinSpin {
          0% {
            transform: translate(-50%, -50%) scale(0.5) rotate(0deg);
          }
          10% {
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
          70% {
            transform: translate(-50%, -50%) scale(1) rotate(720deg);
          }
          100% {
            transform: translate(-50%, -50%) scale(0) rotate(720deg);
          }
        }
      `}</style>
    </div>
  );
};
