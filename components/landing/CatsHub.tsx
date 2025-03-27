import { PixelButton } from "@/components/shared/PixelButton";
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
    title: "HOW CAN I SAVE A CAT?",
    img: "/images/cats-slider/contribute.jpg",
    question: "HOW",
    description:
      "Adopt shelters cats as NFTs, 100% of funds are transferred directly to cats shelters",
  },
  {
    title: "HOW TO OWN AN NFT CAT?",
    img: "/images/cats-slider/love.jpg",
    question: "HOW",
    description:
      "Sign in, get into our cat shelter and adopt you purrfect companion !",
  },
  {
    title: "WHAT ARE THE PERKS FOR CATS HOLDERS",
    img: "/images/cats-slider/eat.jpg",
    question: "WHAT",
    description:
      "Up to 10x elevated token rewards ratio, airdrops, NFT rewards, ability to stake NFT cats and craft tokens, AI companion on X and the most important - saved cats!",
  },
  {
    title: "WEN $TAILS LISTING? WEN AIRDROP?",
    img: "/images/cats-slider/play.jpg",
    question: "WEN",
    description:
      "$TAILS TGE, LISTING AND AIRDROP is going to happen in Q2 2025. Follow us on X to stay up to date so you won't miss it!",
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
              src="/cursor/cursor-sand.png"
              alt="arrow down"
              width={60}
              height={60}
            />

            <div className="text-p4 max-lg:text-p5 font-tertiary pl-4">
              {title}
            </div>
          </div>
          <PixelButton text={question || "HOW"} isSmall />
        </a>
      </div>
      <div
        className={`flex items-center text-p4 bg-yellow-300 max-lg:text-p5 font-tertiary transition relative z-0 py-4 px-2 gap-2 border-b ${
          isActive ? "" : "hidden"
        }`}
      >
        <img draggable={false} className="rounded-full w-24" src={img} />
        <div className="flex flex-col items-start">
          <div>{description}</div>
          <a target="_blank" href="/game">
            <PixelButton isSmall text="START SAVING CATS" />
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
    [setActive]
  );
  return (
    <div className="my-20 flex items-center justify-center flex-col container">
      <div className="w-9/12 max-lg:w-full">
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 max-lg:mx-5 my-0 sm:my-10 items-center justify-center">
          <div className="relative rounded-2xl sm:rounded-[80px] overflow-hidden -mb-8 sm:mb-0 hover:brightness-110 m-auto">
            <img
              draggable={false}
              src="/images/cats-hub/how-you-can-save.webp"
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
            <div className="flex mt-4 max-lg:mt-5 -ml-4 md:ml-0">
              <a
                target="_blank"
                href="https://tokentails.com/feed/cats-nft/how-to-adopt-and-save-a-shelter-cat-in-token-tails"
              >
                <PixelButton text="TUTORIAL" isSmall />
              </a>
              <a href="https://docs.tokentails.com" target="_blank">
                <PixelButton text="DOCS" isSmall />
              </a>
              <a
                target="_blank"
                href="https://docs.google.com/presentation/d/1G8F_HxNLwxkBSZ9XAcnvtH9SQFBjtI6Wq_2Y6FEXLdQ/"
              >
                <PixelButton text="PRESENTATION" isSmall />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
