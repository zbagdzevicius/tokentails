import Preregistration from "../preregistration/Preregistration";

interface bannerProps {
  image: string;
  title: string;
}

const sponsorImage = [
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/moonbeam.webp",
    name: "moonbeam",
  },
  {
    image: "/images/sponsor/chess.png",
    name: "Chess",
  },
  {
    image: "/images/sponsor/roblox.png",
    name: "Roblox",
  },
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/moonbeam.webp",
    name: "moonbeam",
  },
  {
    image: "/images/sponsor/chess.png",
    name: "Chess",
  },
  {
    image: "/images/sponsor/roblox.png",
    name: "Roblox",
  },
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/moonbeam.webp",
    name: "moonbeam",
  },
  {
    image: "/images/sponsor/chess.png",
    name: "Chess",
  },
  {
    image: "/images/sponsor/roblox.png",
    name: "Roblox",
  },
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/moonbeam.webp",
    name: "moonbeam",
  },
  {
    image: "/images/sponsor/chess.png",
    name: "Chess",
  },
  {
    image: "/images/sponsor/roblox.png",
    name: "Roblox",
  },
];

const cats: bannerProps[] = [
  {
    image: "/cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/grey/Playing-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-lamiendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/grey/Running-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-corriendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-lamiendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/grey/Walking-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-corriendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/yellow/Jump-Hat-Yellow.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Jump-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Licking-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Loaf-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Playing-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Sitting-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/yellow/Idle-Hat-Yellow.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
];
export const HomePage = () => {
  return (
    <div className="mt-4 flex justify-center items-center flex-col">
      <div className="relative w-full lg:w-2/3 xl:w-1/2 pt-16 px-10 max-lg:text-balance">
        <img
          className="absolute top-0 left-0 "
          src="/images/home-page/firework.png"
          alt="fireworks"
          width={80}
          height={80}
        />
        <h1 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          Play with your virtual cat to save a cat in a shelter
        </h1>
      </div>
      <div className="relative w-full flex items-center justify-center max-w-[100vw] overflow-hidden">
        <div className="absolute left-0 right-0 top-0 bottom-0 slider transform z-10 rotate-12">
          <div className="slide-track inverse">
            {cats.map((banner, index) => (
              <div key={index} className="slide">
                <img
                  src={banner.image}
                  alt={banner.title}
                  width={100}
                  height={100}
                />
              </div>
            ))}
          </div>
        </div>
        <div></div>
        <div className="relative h-fit flex items-center justify-center pb-10 max-lg:pb-7">
          <div className="relative pt-20 max-lg:pt-10 px-14 max-lg:px-0 flex items-center justify-center">
            <div className="relative w-full max-lg:w-9/12">
              <img
                src="/images/home-page/cat-background.png"
                alt="Cats Background"
                className="w-full h-full"
              />
              <img
                src="/images/home-page/bg-1.jpg"
                alt="cats"
                className="absolute inset-0 w-full h-full object-cover z-3 md:p-2.5 p-1.5"
                width={500}
                height={500}
              />
              <img
                src="/images/home-page/cats-top.png"
                alt="Cat Hero"
                className="absolute -top-16 lg:-top-36 right-0 w-1/2 object-cover overflow-hidden"
                width={500}
                height={500}
              />
            </div>
            <img
              src="/images/home-page/crown.png"
              alt="crown"
              className="w-16 max-lg:w-10 h-16 max-lg:h-10 absolute top-0 right-0"
              width={100}
              height={100}
            />
          </div>
          <a href="/adopt" className="absolute bottom-0">
            <button
              className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-72 max-lg:w-40 max-sm:w-36 h-8 sm:h-9 lg:h-12 
                    bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs text-white"
            >
              Demo
            </button>
          </a>
        </div>
      </div>
      <Preregistration />

      <div className="my-4"></div>
      <div className="slider relative bg-gradient-to-r from-green-300 to-purple-300">
        <div className="slide-track">
          {sponsorImage.map((sponsor, index) => (
            <div key={index} className="slide flex items-center invert">
              <img className="h-8" src={sponsor.image} alt={sponsor.name} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
