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
  const match3PreviewTiles = [
    cdnFile("logo/logo.webp"),
    cdnFile("logo/paw.webp"),
    cdnFile("logo/heart.webp"),
    cdnFile("ability/FIRE.png"),
    cdnFile("ability/WATER.png"),
    cdnFile("logo/catnip.webp"),
    cdnFile("ability/NATURE.png"),
    cdnFile("logo/paw.webp"),
    cdnFile("logo/logo.webp"),
    cdnFile("logo/heart.webp"),
    cdnFile("ability/FIRE.png"),
    cdnFile("logo/catnip.webp"),
  ] as const;
  const gameCards: Array<{
    type: GameType;
    title: string;
    description: string;
    image?: string;
    previewBg?: string;
    previewVariant?: "IMAGE" | "MATCH3";
  }> = [
    {
      type: GameType.PIXEL_RESCUE,
      title: "CUPID CAT",
      description: "Save cat locked in a cage every day",
      image: cdnFile("utilities/game-modal/pixel-rescue.webp"),
      previewVariant: "IMAGE",
    },
    {
      type: GameType.CATNIP_CHAOS,
      title: "PURRSUIT",
      description: "Get through challenges with your cat",
      image: cdnFile("utilities/game-modal/catnip-chaos.webp"),
      previewVariant: "IMAGE",
    },
    {
      type: GameType.MATCH_3,
      title: "PAW MATCH",
      description: "Match tokens, chain combos, beat the clock",
      previewBg: cdnFile("landing/game-bg-2.webp"),
      previewVariant: "MATCH3",
    },
  ];

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
    <div className="fixed inset-0 flex items-center justify-center z-[9999]">
      <div
        onClick={onClose}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300/50 md:backdrop-blur-md animate-in fade-in duration-300"
      ></div>
      <div
        className="relative z-50 flex h-[37rem] w-[23rem] max-w-[94vw] scale-90 items-center justify-center md:h-[35.25rem] md:w-[46rem] md:max-w-[95vw] md:scale-100"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundImage: `url(${cdnFile("catnip-chaos/modal.webp")})`,
          backgroundSize: isMediumScreen ? "contain" : "100% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        <img
          src={cdnFile("catnip-chaos/banner.webp")}
          alt="Modal"
          draggable={false}
          className="absolute top-5 md:-top-5 left-0 w-full h-28 md:h-32  object-contain"
        />
        <img
          src="/mascots/actions/play_games.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="hidden md:block absolute -left-12 top-1/2 w-24 -rotate-12 pointer-events-none select-none drop-shadow-xl"
        />
        <img
          src="/mascots/emotions/playful_meow.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="hidden md:block absolute -right-12 top-1/2 w-24 rotate-12 pointer-events-none select-none drop-shadow-xl"
        />
        <div className="relative z-10 mt-12 grid w-full grid-cols-2 justify-items-center gap-3 px-6 pb-8 md:mt-9 md:grid-cols-3 md:gap-4 md:px-5 md:pb-1">
          {gameCards.map((card, index) => (
            <div
              key={card.type}
              className={`flex flex-col items-center ${
                index === gameCards.length - 1 && gameCards.length % 2 !== 0
                  ? "col-span-2 md:col-span-1"
                  : ""
              }`}
            >
              <div className="flex h-40 w-40 flex-col items-center justify-center transition-all duration-300 hover:brightness-125 md:h-[14.5rem] md:w-[13rem]">
                <div
                  className={`flex items-center justify-center rounded-xl bg-transparent p-0 ${
                    card.previewVariant === "MATCH3"
                      ? "h-28 w-28 md:h-36 md:w-36"
                      : "h-[5.75rem] w-[8.25rem] md:h-[6.5rem] md:w-[9.25rem]"
                  }`}
                  style={
                    card.previewBg
                      ? {
                          backgroundImage: `url(${card.previewBg})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                  onClick={() => handleGameSelect(card.type)}
                >
                  {card.previewVariant === "MATCH3" ? (
                    <div
                      onClick={() => handleGameSelect(card.type)}
                      className="relative h-full w-full overflow-hidden rounded-lg bg-[#1d1c3a]/80 p-[3px]"
                    >
                      <div className="grid h-full w-full grid-cols-4 gap-[3px] rounded-[6px] bg-[#15132a]/80 p-[3px]">
                        {match3PreviewTiles.map((tileSrc, index) => (
                          <div
                            key={`${tileSrc}-${index}`}
                            className="flex items-center justify-center rounded-[4px] border border-indigo-200/20 bg-[#2a2960]/55 shadow-inner"
                          >
                            <img
                              src={tileSrc}
                              alt=""
                              draggable={false}
                              className="h-[1.125rem] w-[1.125rem] object-contain md:h-5 md:w-5"
                              style={{ imageRendering: "pixelated" }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="pointer-events-none absolute -right-2 bottom-1 rounded-md border border-yellow-100/65 bg-pink-600/80 px-2 py-[1px] font-secondary text-[7px] uppercase tracking-[0.12em] text-yellow-50 md:text-[10px]">
                        combo
                      </div>
                    </div>
                  ) : (
                    <img
                      onClick={() => handleGameSelect(card.type)}
                      src={card.image}
                      alt={card.title}
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  )}
                </div>
                <PixelButton
                  isMedium={isMediumScreen}
                  text={card.title}
                  onClick={() => handleGameSelect(card.type)}
                />
                <p
                  onClick={() => handleGameSelect(card.type)}
                  className="hidden pt-4 text-center font-primary text-p6 uppercase leading-none text-yellow-100 text-shadow-lg drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] text-balance md:block md:min-h-[4.8rem] md:px-1 md:text-p5 md:leading-[1.05]"
                >
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <CloseButton absolute onClick={onClose} />
    </div>
  );
};
