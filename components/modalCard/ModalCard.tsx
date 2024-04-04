import { useCatMint } from "@/components/web3/minting/CatMint";
import { CatAbilities, CatAbility, ICat } from "@/models/cats";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";

type CardStyles = {
  [key: string]: string | number;
};
interface IProps extends ICat {
  hp: number;
  isMintable?: boolean;
  onClose: () => void;
}

const initialCardStyle = {
  "--pointer-x": "50%",
  "--pointer-y": "50%",
  "--card-opacity": 0,
  "--rotate-x": "0deg",
  "--rotate-y": "0deg",
  "--card-scale": 1,
  "--translate-x": "0px",
  "--translate-y": "0px",
  "--background-y": "44%",
  "--background-x": "34%",
};

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
  const router = useRouter();
  const abilityDetails: CatAbility | undefined = CatAbilities[ability];
  const cardRef = useRef<HTMLDivElement>(null);
  const [isMouseWithinCard, setIsMouseWithinCard] = useState(false);
  const { mint, isPending, isConfirming, isConfirmed, isConnected } =
    useCatMint({ name });
  const [cardStyles, setCardStyles] = useState<CardStyles>(initialCardStyle);

  const ctaButtonText = useMemo(() => {
    if (isMintable) {
      if (isConfirming || isPending) {
        return "Adopting...";
      }

      if (isConfirmed) {
        return "Adopted";
      }
      if (!isConfirmed) {
        return "Adopt";
      }
    } else if (isPlayable) {
      return "Play";
    }
  }, [isMintable, isConfirmed, isPlayable]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        setIsMouseWithinCard(
          clientX >= rect.left - 100 &&
            clientX <= rect.right + 100 &&
            clientY >= rect.top - 100 &&
            clientY <= rect.bottom + 100
        );
        if (isMouseWithinCard) {
          setCardStyles((prevStyles) => ({
            ...prevStyles,
            "--pointer-x": `${x}%`,
            "--pointer-y": `${y}%`,
            "--rotate-x": `${(y - 50) * 0.2}deg`,
            "--rotate-y": `${(x - 50) * -0.2}deg`,
            "--card-opacity": 1,
            "--card-scale": 1.05,
            "--translate-x": `${(x - 50) * 0.2}px`,
            "--translate-y": `${(y - 50) * 0.2}px`,
            "--background-y": `${(y - 6) * 0.1}%`,
            "--background-x": `${(x - 3) * 0.1}%`,
          }));
        } else {
          setCardStyles(initialCardStyle);
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isMouseWithinCard]);

  const handleClick = () => {
    if (isMintable) {
      if (isConfirmed) {
        router.push("/select");
      } else {
        mint();
      }
    } else if (!isPlayable) {
      onClose();
    } else {
      router.push("/purrquest");
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full fixed top-0 left-0">
      <div
        className={`max-w-screen-xl min-w-fit w-1/5 max-3xl:w-[25%]  max-2xl:w-1/3  max-md:w-8/12 max-lg:w-1/2 max-xl:w-2/5 max-sm:w-11/12  card ${
          isMouseWithinCard ? "active" : ""
        } ${abilityDetails.type.toLocaleLowerCase()}`}
        style={cardStyles as React.CSSProperties}
        ref={cardRef}
      >
        <div className="card__translater">
          <div className="card__rotator relative">
            <div className="card__front">
              <div>
                <div
                  className="bg-cover bg-center w-full h-full filter brightness-50"
                  style={{
                    backgroundImage: `url(/ability/${abilityDetails.type}_BG.webp)`,
                  }}
                ></div>
                <div className="absolute inset-0 flex flex-col justify-between">
                  <div className="h-2/5 max-3xl:h-[35%] max-2xl:h-2/5  max-md:1/4 w-full">
                    <div>
                      <div className="flex justify-between items-center m-1">
                        <div className="flex flex-row space-x-4 items-center">
                          <div className="relative flex justify-center items-center">
                            <img
                              src="/card/base.png"
                              alt="base"
                              width={60}
                              height={40}
                              loading="lazy"
                            />
                            <p className="text-[#545454]  max3xl:text-sm max-lg:text-xs uppercase absolute inset-0 font-bold flex items-center justify-center">
                              Basic
                            </p>
                          </div>
                          <h3 className="text-white text-h5  max-3xl:text-3xl max-lg:text-xl font-bold">
                            {name}
                          </h3>
                        </div>
                        <div className="relative">
                          <img
                            className="w-24 max-lg:w-16 h-10 max-lg:h-7"
                            src="/card/base.png"
                            alt="base"
                            width={100}
                            height={40}
                          />
                          <h3 className="text-[#545454] text-3xl max-lg:text-xl font-bold absolute inset-0">
                            <span className="text-xs max-lg:text-p7 mx-1 max-lg:mx-px">
                              HP
                            </span>
                            {hp}
                          </h3>
                        </div>
                      </div>
                    </div>
                    <div className="relative mx-4 h-full">
                      <img
                        className="w-full h-full rounded-xl"
                        src="/images/home-page/bg-1.jpg"
                        alt="base"
                        width={400}
                        height={400}
                      />
                      <img
                        src={img}
                        alt="Hero cat"
                        width={250}
                        height={250}
                        className="w-44 h-44 max-lg:w-36 max-lg:h-36 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-start m-5 max-lg:m-2 max-sm:m-1">
                      <div className="text-outline mb-3 max-sm:mb-2">
                        <div className="flex flex-row items-center">
                          <h4 className="text-white text-p2  max-3xl:text-p3 max-md: max-lg:text-p3 max-sm:text-p5 max-lg:tracking-tight text-start ml-16 max-sm:ml-10 font-bold">
                            Story
                          </h4>
                        </div>
                        <p className="text-white text-p4  max-3xl:text-p5 max-lg:text-sm  font-bold">
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
                          <h4 className="text-white text-p2  max-3xl:text-p3 max-lg:text-p3 max-sm:text-p text-start ml-6 max-sm:ml-4 max-lg:tracking-tight font-bold">
                            {ability}
                          </h4>
                        </div>
                        <p className="text-white text-p4  max-3xl:text-p5 max-lg:text-sm  max-lg:tracking-tight font-bold">
                          {abilityDetails.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          disabled={isPending || isConfirming}
                          className="[clip-path:polygon(0%_1%,100%_0%,92%_100%,0%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 
                    bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs z-10"
                          onClick={handleClick}
                        >
                          {ctaButtonText}
                        </button>

                        <button
                          disabled={isPending || isConfirming}
                          className="[clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 
                    bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs z-10"
                          onClick={onClose}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card__shine"></div>
              <div className="card__glare"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalCard;
