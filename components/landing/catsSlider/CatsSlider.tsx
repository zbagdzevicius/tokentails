import { Slider } from "../../shared/Slider";
export const CatsSlider = () => {
  const items = [
    <div
      key={1}
      className="relative flex items-center justify-center pb-6 aspect-w-16 aspect-h"
    >
      <img
        src="/images/cats-slider/cat-eat.jpg"
        alt="cats"
        className="object-cover"
        width={350}
        height={300}
      />
      <div className="absolute bottom-0">
        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 font-secondary bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs">
          Feed
        </button>
      </div>
    </div>,
    <div
      key={2}
      className="relative flex items-center justify-center pb-6 aspect-w-16 aspect-h"
    >
      <img
        src="/images/cats-slider/cat-smile.jpg"
        alt="cats"
        className="object-cover"
        width={350}
        height={300}
      />
      <div className="absolute bottom-0">
        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 font-secondary bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs">
          Customize
        </button>
      </div>
    </div>,
    <div
      key={3}
      className="relative flex items-center justify-center pb-6 aspect-w-16 aspect-h"
    >
      <img
        src="/images/cats-slider/cat-sit.jpg"
        alt="cats"
        className="object-cover"
        width={350}
        height={300}
      />
      <div className="absolute bottom-0">
        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 font-secondary bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs">
          Love
        </button>
      </div>
    </div>,
    <div
      key={4}
      className="relative flex items-center justify-center pb-6 aspect-w-16 aspect-h"
    >
      <img
        src="/images/cats-slider/cat-play-1.jpg"
        alt="cats"
        className="object-cover"
        width={350}
        height={300}
      />
      <div className="absolute bottom-0">
        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 font-secondary bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs">
          Play
        </button>
      </div>
    </div>,
    <div
      key={5}
      className="relative flex items-center justify-center pb-6 aspect-w-16 aspect-h"
    >
      <img
        src="/images/cats-slider/cat-play-2.jpg"
        alt="cats"
        className="object-cover"
        width={350}
        height={300}
      />
      <div className="absolute bottom-0">
        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 font-secondary bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm max-sm:text-xs">
          Contribute
        </button>
      </div>
    </div>,
  ];
  return <Slider items={items} customClass="container text-white" />;
};
