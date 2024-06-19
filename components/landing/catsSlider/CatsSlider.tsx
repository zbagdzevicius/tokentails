import { useState } from "react";
import { Slider } from "../../shared/Slider";

const sliderItems: { img: string; title: string; explanation: string }[] = [
  {
    img: "/images/cats-slider/cat-eat.jpg",
    title: "feed",
    explanation:
      "Feed your adorable feline friend to fill their energy tank! So your kitty will be able to enjoy all the fun.",
  },
  {
    img: "/images/cats-slider/cat-smile.jpg",
    title: "Customize",
    explanation: "Buy a hat for your cat to have cat wif hat",
  },
  {
    img: "/images/cats-slider/cat-sit.jpg",
    title: "Love",
    explanation: "Show your NFT cat some love by giving them what they crave most – your attention!",
  },
  {
    img: "/images/cats-slider/cat-play-1.jpg",
    title: "Play",
    explanation: "Play with your cat daily to level up their Joy and unlock exciting rewards!",
  },
  {
    img: "/images/cats-slider/cat-play-2.jpg",
    title: "Contribute",
    explanation: "Real world impact: 50% of every NFT purchase goes directly to supporting cat shelters!",
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
        src={item.img}
        alt="cats"
        className={`object-cover rounded-3xl w-full ${
          activeSlide === item.title ? "blur-sm opacity-25" : ""
        }`}
        width={350}
        height={300}
      />
      <div className="absolute -bottom-4 z-20">
        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 font-secondary bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs">
          {item.title}
        </button>
      </div>
      {activeSlide === item.title && (
        <div className="absolute z-30 font-tertiary text-black px-8 text-p3 font-bold text-center">
          {item.explanation}
        </div>
      )}
    </div>
  ));
  return <Slider items={items} customClass="text-white" />;
};
