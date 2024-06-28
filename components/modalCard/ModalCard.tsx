import { CatAbilities, CatAbility, ICat } from "@/models/cats";
import React, { useMemo, useRef } from "react";

interface IProps extends ICat {
  hp: number;
  isMintable?: boolean;
  onClose: () => void;
}

const ModalCard: React.FC<IProps> = ({
  onClose,
  img,
  name,
  ability,
  resqueStory,
  isPlayable,
  hp,
  isMintable,
}) => {
  const abilityDetails: CatAbility | undefined = CatAbilities[ability];
  const cardRef = useRef<HTMLDivElement>(null);

  const ctaButtonText = useMemo(() => {
    if (isMintable) {
      // if (isConfirming || isPending) {
      //   return "Adopting...";
      // }

      // if (isConfirmed) {
      //   return "See My Cat";
      // }
      // if (!isConfirmed) {
      //   return "Adopt";
      // }
      return "COMING SOON";
    } else if (isPlayable) {
      return "Play";
    }

    return "Nonplayable";
  }, [
    isMintable,
    // isConfirmed,
    isPlayable,
  ]);

  const handleClick = () => {};

  return (
    <div className="flex items-center justify-center w-full h-full fixed top-0 left-0">
      <div className="absolute inset-0 z-0 bg-yellow-300 opacity-50" onClick={() => onClose()}></div>
      <div
        className={`max-w-screen-xl rem:h-[540px] md:rem:h-[600px] aspect-[2/3] max-w-screen animate-border ${abilityDetails.type.toLocaleLowerCase()}`}
        ref={cardRef}
      >
        <img
          src={`/ability/${abilityDetails.type}_BG.webp`}
          className="absolute object-cover z-10 h-full w-full brightness-[35%] rounded-[16px]"
        />
        <div className="relative z-20 inset-0 flex flex-col justify-between h-full">
          <div className="w-full">
            <div>
              <div className="flex justify-between items-center m-1">
                <div className="flex flex-row space-x-4 items-center">
                  <div className="relative flex justify-center items-center">
                    <img
                      src="/card/base.png"
                      alt="base"
                      className="h-6 w-16"
                      loading="lazy"
                    />
                    <p className="text-[#545454] uppercase absolute text-p6 inset-0 font-bold flex items-center justify-center">
                      KITTEN
                    </p>
                  </div>
                  <h3 className="text-white text-p3 uppercase font-bold">
                    {name}
                  </h3>
                </div>
                <div className="relative">
                  <img
                    className="w-24 max-lg:w-16 h-10 max-lg:h-7"
                    src="/card/base.png"
                    alt="base"
                  />
                  <h3 className="text-[#545454] text-3xl max-lg:text-xl font-bold absolute inset-0 text-center">
                    9
                    <span className="text-xs max-lg:text-p7 mx-1 max-lg:mx-px">
                      LIVES
                    </span>
                  </h3>
                </div>
              </div>
            </div>
            <div className="relative mx-4 h-full flex justify-center items-center">
              <img
                className="w-full h-full rounded-xl absolute z-0"
                src={`/ability/${abilityDetails.type}_BG.webp`}
                alt="base"
                width={400}
                height={400}
              />
              <img
                src={img}
                alt="Hero cat"
                width={250}
                height={250}
                className="w-44 h-44 relative z-10"
              />
            </div>
          </div>
          <div>
            <div className="text-start m-3 md:m-5 bg">
              <div className="text-outline mb-3 max-sm:mb-2">
                <div className="flex flex-row items-center">
                  <h4 className="text-white text-p3 ml-16 max-sm:ml-10 font-bold">
                    STORY
                  </h4>
                </div>
                <p className="text-gray-200 text-p5 font-bold">
                  {resqueStory}
                </p>
              </div>
              <div className="my-3 text-outline">
                <div className="flex flex-row items-center">
                  <img
                    className="w-10 h-10 max-lg:w-8 max-lg:h-8 max-sm:h-6 max-sm:w-6 "
                    src={`/ability/${abilityDetails.type}.png`}
                    alt={abilityDetails.type}
                    width={40}
                    height={40}
                  />
                  <h4 className="text-white text-p3 ml-4 md:ml-8 font-bold">
                    {ability}
                  </h4>
                </div>
                <p className="text-gray-200 text-p5 font-bold">
                  {abilityDetails.description}
                </p>
              </div>
              <div className="flex items-center gap-1 justify-center text-white">
                {true ? (
                  <button
                    // disabled={isPending || isConfirming}
                    className="[clip-path:polygon(0%_1%,100%_0%,92%_100%,0%_100%)] h-8 md:h-12 flex-1 font-bold 
                    bg-gradient-to-r from-transparent to-main-rusty text-p5 z-10 rounded-lg hover:animate-hover"
                    onClick={handleClick}
                  >
                    {ctaButtonText}
                  </button>
                ) : (
                  <div className="z-10">
                    <w3m-button />
                  </div>
                )}

                <button
                  // disabled={isPending || isConfirming}
                  className="[clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] h-8 md:h-12 flex-1 
                    bg-gradient-to-r from-main-ember to-main-rusty text-p5 z-10 rounded-lg hover:animate-hover font-bold"
                  onClick={onClose}
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalCard;
