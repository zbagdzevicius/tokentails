import { PixelButton } from "./PixelButton";
import { GameType } from "@/models/game";
import { cdnFile } from "@/constants/utils";
import { useState, useEffect } from "react";
import { CloseButton } from "./CloseButton";

interface GameSelectModalProps {
  onClose: () => void;
  setGameType: (gameType: GameType) => void;
}

export const GameSelectModal: React.FC<GameSelectModalProps> = ({
  onClose,
  setGameType,
}) => {
  const [isMediumScreen, setIsMediumScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMediumScreen(window.innerWidth >= 768);
    };

    checkScreenSize();

    window.addEventListener("resize", checkScreenSize);

    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleGameSelect = (gameType: GameType) => {
    setGameType(gameType);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex bg-black bg-opacity-65 items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="relative scale-90 md:scale-100 z-100 h-[30rem] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundImage: `url(${cdnFile("catnip-chaos/modal.png")})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        <img
          src={cdnFile("catnip-chaos/banner.png")}
          alt="Modal"
          className="absolute top-5 md:-top-5 left-0 w-full h-28 md:h-32  object-contain"
        />
        <div className="relative z-10 flex flex-row gap-4 md:gap-12 items-start justify-start  p-12 w-full">
          <div className="flex flex-col items-center ">
            <div className="w-36 h-36 md:w-52 md:h-52 flex flex-col items-center justify-center">
              <img
                src="utilities/game-modal/pixel-rescue.webp"
                alt="Pixel Rescue"
                className="max-w-full max-h-full object-contain"
              />

              <PixelButton
                isMedium={isMediumScreen}
                text="Pixel Rescue"
                onClick={() => handleGameSelect(GameType.PIXEL_RESCUE)}
                className="glow-box-FIRE"
              />
              <p className="text-p6 text-shadow-lg drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] font-primary text-red-100 leading-none md:text-p4 pt-4 text-center uppercase text-balance">
                Save cat locked in a cage every day
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center  ">
            <div className="w-36 h-36 md:w-52 md:h-52 flex flex-col items-center justify-center">
              <img
                src="utilities/game-modal/catnip-chaos.webp"
                alt="Catnip Chaos"
                className="max-w-full max-h-full object-contain"
              />
              <PixelButton
                isMedium={isMediumScreen}
                text="Catnip Chaos"
                onClick={() => handleGameSelect(GameType.CATNIP_CHAOS)}
                className="glow-box-WATER"
              />
              <p className="text-p6 text-shadow-lg drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] font-primary text-blue-100 leading-none md:text-p4 pt-4 text-center uppercase text-balance">
                Get through challenges with your cat
              </p>
            </div>
          </div>
        </div>
      </div>
      <CloseButton absolute onClick={onClose} />
    </div>
  );
};
