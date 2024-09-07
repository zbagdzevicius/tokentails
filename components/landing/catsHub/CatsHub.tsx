import { PixelButton } from "@/components/button/PixelButton";
import { useCallback, useState } from "react";

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
      "Choose your purr-fect companion from a diverse range of lovable felines!",
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
                ? "bg-gradient-to-br from-main-slate via-main-grape to-main-rusty p-0.5 w-full rounded"
                : ""
            }`}
      >
        <a
          onClick={() => onSet?.()}
          className={`flex relative z-10 w-full title items-center py-3 px-5 transition 
                ${
                  isActive
                    ? "bg-gradient-to-r from-yellow-300 from-5% to-white"
                    : "bg-gradient-to-r from-yellow-300 from-5% to-white"
                }`}
        >
          <img
            className={`h-8 max-lg:h-4 max-lg:w-4 w-8 shrink-0 fill-accent-100 transition ase-in-out duration-700 ${
              isActive ? "rotate-[-180deg]" : ""
            }`}
            src="/cursor/cursor-sand.png"
            alt="arrow down"
            width={60}
            height={60}
          />

          <div className="text-p4 max-lg:text-p5 font-tertiary pl-4">
            {title}
          </div>
        </a>
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

  const onActiveClick = useCallback(
    (section: IProps) => {
      setActive((active) => (active === section ? {} : section));
    },
    [setActive]
  );
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
            <div className="flex-1 flex flex-col gap-1">
              {CatsHubProps.map((section, index) => (
                <CatsSection
                  key={index}
                  title={section.title}
                  description={section.description}
                  isActive={section.title === active.title}
                  onSet={() => onActiveClick(section)}
                />
              ))}
            </div>
            <div className="flex mt-10 max-lg:mt-5 gap-4">
              <a href="https://docs.tokentails.com" target="_blank">
                <PixelButton text="DOCS" />
              </a>
              <a target="_blank" href="https://tokentails.com/pitch-deck.pdf">
                <PixelButton text="PITCH DECK" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
