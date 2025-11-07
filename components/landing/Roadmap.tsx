import { cdnFile } from "@/constants/utils";
import { Laptop } from "./Laptop";

const cats = [
  {
    image: "cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/grey/Playing-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-lamiendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/grey/Running-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-corriendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-lamiendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/grey/Walking-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-corriendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/yellow/Jump-Hat-Yellow.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "cats/black/Jump-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "cats/black/Licking-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "cats/black/Loaf-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "cats/black/Playing-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "cats/black/Sitting-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "cats/yellow/Idle-Hat-Yellow.gif",
    title: "Play logo",
  },
  {
    image: "cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
];

const Roadmap = () => {
  return (
    <div className="container flex flex-col py-8 justify-center items-center">
      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance md:mb-8 mt-8 mb-4">
        OUR JOURNEY
      </h2>
      <Laptop />
      <div className="flex flex-col md:flex-row justify-around gap-12 lg:gap-24 pt-16 md:pt-4 mb-12">
        <div className="flex flex-col items-center gap-4 md:pt-36 hover:brightness-125 hover:animate-hover">
          <div className="relative bg-gradient-to-t to-purple-300 from-blue-300 rounded-full border-4 border-purple-300 w-16 h-16 flex justify-center items-center">
            <img
              draggable={false}
              className="w-10 relative md:absolute left-0 right-0 md:-top-14 m-auto"
              src={cdnFile("icons/check.webp")}
            />
            <img
              draggable={false}
              className="h-32 w-32 max-w-[200px] mt-8"
              src={cdnFile("cats/grey/Loaf-Clothed-Grey.gif")}
            />
          </div>
          <h2 className="font-primary text-h4 md:text-h2">SO FAR</h2>
          <div className="flex flex-col font-secondary text-p4 md:text-p2 font-bold">
            <span className="flex gap-2 items-center whitespace-nowrap">
              <img
                draggable={false}
                className="h-6"
                src={cdnFile("icons/check.webp")}
              />
              LIVE GAME
            </span>
            <span className="flex gap-2 items-center">
              <img
                draggable={false}
                className="h-6"
                src={cdnFile("icons/check.webp")}
              />
              0.5M Players
            </span>
            <span className="flex gap-2 items-center whitespace-nowrap">
              <img
                draggable={false}
                className="h-6"
                src={cdnFile("icons/check.webp")}
              />
              10k+ TOKENIZED CATS
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-12 hover:brightness-125 hover:animate-hover">
          <div className="relative bg-gradient-to-t to-purple-300 from-blue-300 rounded-full border-4 border-purple-300 w-16 h-16 flex justify-center items-center">
            <img
              draggable={false}
              className="w-10 relative md:absolute left-0 right-0 md:-top-14 m-auto"
              src={cdnFile("icons/check.webp")}
            />
            <img
              draggable={false}
              className="h-32 w-32 max-w-[200px]"
              src={cdnFile("cats/siamese/jugando Ropa Siames.gif")}
            />
          </div>
          <h2 className="font-primary text-h4 md:text-h2 whitespace-nowrap">
            RIGHT NOW
          </h2>
          <div className="flex flex-col font-secondary text-p4 md:text-p2 font-bold">
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6"
                src={cdnFile("icons/check.webp")}
              />
              SHELTERS ONBOARDING
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6"
                src={cdnFile("icons/loader.webp")}
              />
              COMMUNITY CAMPAIGNS
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6"
                src={cdnFile("icons/loader.webp")}
              />
              3D GAME LAUNCH
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 hover:brightness-125 hover:animate-hover">
          <div className="relative bg-gradient-to-t to-purple-300 from-blue-300 rounded-full border-4 border-purple-300 w-16 h-16 flex justify-center items-center">
            <img
              draggable={false}
              className="w-10 relative md:absolute left-0 right-0 md:-top-14 m-auto pixelated"
              src={cdnFile("icons/loader.webp")}
            />
            <img
              draggable={false}
              className="h-32 w-32 max-w-[200px]"
              src={cdnFile("cats/yellow/Jump-Hat-Yellow.gif")}
            />
          </div>
          <h2 className="font-primary text-h4 md:text-h2 whitespace-nowrap">
            COMING
          </h2>
          <div className="flex flex-col font-secondary text-p4 md:text-p2 font-bold">
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6 pixelated"
                src={cdnFile("icons/loader.webp")}
              />
              TGE
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6 pixelated"
                src={cdnFile("icons/loader.webp")}
              />
              CATS TREASURY
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6 pixelated"
                src={cdnFile("icons/loader.webp")}
              />
              MARKETPLACE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
