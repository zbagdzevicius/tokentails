import { useState } from "react";
import { Slider } from "../shared/Slider";
import { PixelButton } from "@/components/button/PixelButton";

const sliderItems: { img: string; title: string; explanation: string }[] = [
  {
    img: "/game/select/shelter.jpg",
    title: "Shelter",
    explanation:
      "Find and adopt your Purr-Fect companion to start playing",
  },
  {
    img: "/game/select/home.jpg",
    title: "Home",
    explanation: "Take care of your cat to earn lives",
  },
  {
    img: "/game/select/catbassadors.jpg",
    title: "Catbassadors",
    explanation: "Collect coins to win airdrops",
  },
  {
    img: "/game/select/purrquest.jpg",
    title: "Purrquest",
    explanation:
      "Get into an adventure with your cat to find a treasury",
  },
  {
    img: "/game/select/clash-of-claws.jpg",
    title: "Clash Of Claws",
    explanation:
      "Challenge and compete with your friends",
  },
];

export const GameModesSlider = () => {
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
        <PixelButton active={activeSlide === item.title} text={item.title} isBig></PixelButton>
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
