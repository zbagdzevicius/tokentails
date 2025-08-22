import { useState } from "react";
import { Slider } from "../shared/Slider";
import { PixelButton } from "@/components/shared/PixelButton";
import { cdnFile } from "@/constants/utils";

const sliderItems: { img: string; title: string; explanation: string }[] = [
  {
    img: cdnFile("images/cats-slider/love.jpg"),
    title: "Love",
    explanation:
      "Show your NFT cat love by giving them what they crave most – your attention!",
  },
  {
    img: cdnFile("images/cats-slider/customize.jpg"),
    title: "Customize",
    explanation: "Buy a hat for your cat to have cat wif hat",
  },
  {
    img: cdnFile("images/cats-slider/eat.jpg"),
    title: "feed",
    explanation: "Feed your adorable feline friend to fill their energy tank",
  },
  {
    img: cdnFile("images/cats-slider/play.jpg"),
    title: "Engage",
    explanation:
      "Play with your cat daily to level up their Joy and unlock exciting rewards!",
  },
  {
    img: cdnFile("images/cats-slider/contribute.jpg"),
    title: "Contribute",
    explanation:
      "50% of every NFT purchase goes directly to supporting cat shelters!",
  },
];

export const CatsSlider = () => {
  const [activeSlide, setActiveSlide] = useState<null | string>(null);
  const items = sliderItems.map((item, index) => (
    <div
      key={index}
      onClick={() => setActiveSlide(item.title)}
      className={`relative flex items-center justify-center aspect-w-16 aspect-h`}
    >
      <img
        draggable={false}
        src={item.img}
        alt="cats"
        className={`object-cover rounded-3xl w-full ${
          activeSlide === item.title ? "blur-sm opacity-25" : ""
        }`}
        width={350}
        height={300}
      />
      <div className="absolute -bottom-4 z-20">
        <PixelButton
          active={activeSlide === item.title}
          text={item.title}
          isBig
        ></PixelButton>
      </div>
      {activeSlide === item.title && (
        <div className="absolute z-30 font-tertiary inset-0 justify-center items-center lg:items-start lg:pt-2 xl:items-center xl:pt-0 flex text-black px-6 md:px-2 text-p5 md:text-p4 font-bold text-center">
          {item.explanation}
        </div>
      )}
    </div>
  ));
  return <Slider items={items} customClass="text-white" mobileSlides={2} />;
};
