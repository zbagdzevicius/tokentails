import { PixelButton } from "@/components/shared/PixelButton";
import { cdnFile } from "@/constants/utils";
import { useCallback, useState } from "react";

interface IProps {
  title: string;
  description: string;
  isActive?: boolean;
  img?: string;
  question?: string;
  onSet?: () => void;
}

const CatsHubProps: IProps[] = [
  {
    title: "HOW CATS GETS HELPED?",
    img: cdnFile("images/cats-slider/decide.webp"),
    question: "HOW",
    description:
      "In-game cat is linked with a real cat in a shelter. \nWe're making sure that money is used to treat them and to get them adopted in real life.",
  },
  {
    title: "OKEY, SO HOW DO I OWN A CAT?",
    img: cdnFile("images/cats-slider/heal.webp"),
    question: "HOW",
    description:
      "1. Sign in\n2. Get into our cat shelter\n3. Purchase your purrfect companion !",
  },
  {
    title: "WHAT ARE THE PERKS FOR CATS HOLDERS",
    img: cdnFile("images/cats-slider/benefits.webp"),
    question: "WHAT",
    description:
      "1. Staking option \n2. Real world impact \n3. Double Jump \n4. Meowgical experience \n5. Purrfect companion \n\nTHE MOST IMPORTANT - Purrtastic connection with a real cat in a shelter.",
  },
  {
    title: "WEN $TAILS LISTING? WEN REWARDS?",
    img: cdnFile("images/cats-slider/rewards.webp"),
    question: "WEN",
    description:
      "$TAILS TGE, LISTING AND AIRDROP is going to happen SOON. Follow us on X to stay up to date so you won't miss it!",
  },
];

const CatsSection = ({
  title,
  description,
  isActive,
  img,
  question,
  onSet,
}: IProps) => {
  return (
    <div className="rounded-lg overflow-hidden hover:brightness-110">
      <div>
        <a
          onClick={() => onSet?.()}
          className={`flex relative font-bold z-10 w-full title items-center justify-between py-3 px-5 transition 
                ${
                  isActive
                    ? "bg-gradient-to-r from-yellow-300 from-5% to-white"
                    : "bg-gradient-to-r from-yellow-300 from-5% to-white"
                }`}
        >
          <div className="flex">
            <img
              draggable={false}
              className={`h-8 max-lg:h-4 max-lg:w-4 w-8 shrink-0 fill-accent-100 transition ase-in-out duration-700 ${
                isActive ? "rotate-[-180deg]" : ""
              }`}
              src={cdnFile("cursor/cursor-sand.png")}
              alt="arrow down"
              width={60}
              height={60}
            />

            <div className="text-p4 max-lg:text-p5 font-primary pl-4">
              {title}
            </div>
          </div>
          <PixelButton text={question || "HOW"} isSmall />
        </a>
      </div>
      <div
        className={`flex items-center text-p4 bg-yellow-300 max-lg:text-p5 transition relative z-0 py-4 px-2 gap-2 border-b ${
          isActive ? "" : "hidden"
        }`}
      >
        <img draggable={false} className="w-24" src={img} />
        <div className="flex flex-col items-start">
          <div className="text-p4 leading-5 font-primary whitespace-pre-line">
            {description}
          </div>
          <a target="_blank" href="/game">
            <PixelButton isSmall text="ADOPT A CAT" />
          </a>
        </div>
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
    [setActive],
  );
  return (
    <div className="my-20 flex items-center justify-center flex-col container">
      <div className="w-9/12 max-lg:w-full">
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 max-lg:mx-5 my-0 my-10 items-center justify-center">
          <div className="relative rounded-2xl sm:rounded-[80px] overflow-hidden -mb-8 sm:mb-0 hover:brightness-110 m-auto">
            <img
              draggable={false}
              src={cdnFile("images/cats-hub/how-you-can-save.webp")}
              alt="cats"
              className="aspect-square max-w-96 w-full sm:h-full object-contain z-3"
            />
          </div>
          <div>
            <div className="flex-1 flex flex-col gap-1">
              {CatsHubProps.map((section, index) => (
                <CatsSection
                  key={index}
                  title={section.title}
                  img={section.img}
                  question={section.question}
                  description={section.description}
                  isActive={section.title === active.title}
                  onSet={() => onActiveClick(section)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
