import React, { useState } from "react";
import Image from "next/image";

interface IProps {
  title: string;
  description: string;
  isActive?: boolean;
  onSet?: () => void;
}

const CatsHubProps: IProps[] = [
  {
    title: "EXPLORE OUR VIRTUAL CAT SHELTER",
    description:
      "Choose your purr-fect companion from a diverse range of lovable felines !",
  },
  {
    title: "VIRTUAL CAT",
    description:
      "Each cat is unique and linked with a real cat in the shelter. By adopting a virtual cat, you're helping a real cat.",
  },
  {
    title: "ACTIVITIES",
    description:
      "Keep you cat happy - feed, play and fulfill the needs of your cat to earn tokens",
  },
  {
    title: "SAVE CATS IN REAL-LIFE",
    description:
      "Buy cats and accessories NFTs - 50% of revenue will be distributed to cat shelters",
  },
];

const CatsSection = ({ title, description, isActive, onSet }: IProps) => {
  return (
    <div>
      <div
        className={`
            ${
              isActive
                ? "bg-gradient-to-br from-main-slate via-main-grape to-main-rusty p-0.5 w-full rounded animate-colormax"
                : ""
            }`}
      >
        <button
          onClick={() => onSet?.()}
          className={`flex relative z-10 w-full title items-center py-3 px-5 transition 
                ${
                  isActive
                    ? "bg-gradient-to-r from-yellow-300 from-5% to-white"
                    : ""
                }`}
        >
          <img
            className={`h-8 max-lg:h-4 max-lg:w-4 w-8 shrink-0 fill-accent-100 transition ase-in-out duration-700 ${
              isActive ? "rotate-[-180deg]" : ""
            }`}
            src="/cursor/cursor.png"
            alt="arrow down"
            width={60}
            height={60}
          />

          <div className="text-p4 max-lg:text-p5 font-tertiary pl-4">
            {title}
          </div>
        </button>
      </div>
      <div
        className={`text-p4 max-lg:text-p5 font-tertiary transition relative z-0 py-4 px-5 border-b ${
          isActive ? "" : "hidden"
        }`}
      >
        {description}
      </div>
    </div>
  );
};
export const CatsHub = () => {
  const [active, setActive] = useState<Partial<IProps>>({});
  return (
    <div className="my-20 flex items-center justify-center flex-col container">
      <img
        src="/images/cats-hub/crown.png"
        width={100}
        height={100}
        alt="crown"
      />
      <div className="w-9/12 max-lg:w-full ">
        <h2 className="text-center font-secondary uppercase tracking-tight text-8xl max-lg:text-5xl  max-lg:text-balance ">
          YOUR VIRTUAL COMPANION
        </h2>

        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 max-lg:mx-5 my-0 md:my-10">
          <div className="relative w-full h-fit">
            <img
              src="/images/cats-hub/cat-background.webp"
              alt="Cats Background"
              className="w-full h-full animate-colormax"
              width={500}
              height={200}
            />
            <img
              src="/images/cats-hub/cat-with-hat.webp"
              alt="cats"
              className="absolute inset-0 w-full h-full object-contain z-3 md:p-2.5 p-1.5"
              width={1000}
              height={1000}
            />
          </div>
          <div>
            <div className="flex-1">
              {CatsHubProps.map((section, index) => (
                <CatsSection
                  key={index}
                  title={section.title}
                  description={section.description}
                  isActive={section.title === active.title}
                  onSet={() => setActive(section)}
                />
              ))}
            </div>
            <div className="flex mt-10 max-lg:mt-5">
              <a href="/#preregistration">
                <button
                  className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-32 h-10 max-lg:w-20"
                >
                  <span className="text-center text-base max-lg:text-xs leading-4 text-white">
                    Sign-Up
                  </span>
                </button>
              </a>
              <a
                target="_blank"
                href="https://docs.google.com/presentation/d/1G8F_HxNLwxkBSZ9XAcnvtH9SQFBjtI6Wq_2Y6FEXLdQ"
                className="[clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] bg-[#02020a] flex items-center justify-center rounded w-32 h-10 max-lg:w-24 max-lg:h"
              >
                <button className="w-[125px] h-[38px] max-lg:w-[94px] text-white">
                  <span className="text-center text-base max-lg:text-xs">
                    Pitch Deck
                  </span>
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
