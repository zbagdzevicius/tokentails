import { Slider } from "../../shared/Slider";

const catReview: {
  name: string;
  img: string;
  line1: string;
  line2: string;
  bg: string;
}[] = [
  {
    name: "Pinkie",
    img: "/cats/pinkie/pink-lamiendo-ropa.gif",
    line1: "I meow you",
    line2: "Purrfect place for my meow meow",
    bg: "bg-gradient-to-r from-yellow-300 to-main-rusty",
  },
  {
    name: "Peanut",
    img: "/cats/black/Sitting-Hat-Black.gif",
    line1: "Purr meow meow purr",
    line2: "Much purr so meow",
    bg: "bg-gradient-to-r from-blue-300 to-blue-400",
  },
  {
    name: "Snowball",
    img: "/cats/grey/Loaf-Clothed-Grey.gif",
    line1: "Meooow meow",
    line2: "The best meow in the world",
    bg: "bg-gradient-to-r from-green-300 to-purple-300",
  },
  {
    name: "Cookie",
    img: "/cats/siamese/jugando Ropa Siames.gif",
    line1: "Purrfect game",
    line2: "I already saved 3 little kittens",
    bg: "bg-gradient-to-r from-blue-300 to-green-300",
  },
  {
    name: "Pickle",
    img: "/cats/yellow/Liking-Hat-Yellow.gif",
    line1: "I'm full of treats",
    line2: "All thanks to Token Tails",
    bg: "bg-gradient-to-r from-yellow-300 to-white",
  },
];

export const FeedbackSlider = () => {
  const items = catReview.map((review) => (
    <div key={1} className="flex items-center justify-center">
      <div className={`p-0.5 w-full ${review.bg} rounded-3xl max-lg:mx-4`}>
        <div className="relative flex items-center justify-center flex-col w-full h-fit p-10 max-lg:p-3">
          <img
            className="absolute top-[-35px] right-10 z-20"
            src="/icons/ditto.svg"
            width={70}
            height={70}
            alt="Ditto Mark"
          />
          <div className="flex flex-row mb-5">
            <img
              className="w-8 h-8 max-lg:w-5 max-lg:h-5"
              src="/icons/star.svg"
              width={25}
              height={25}
              alt="star"
            />
            <img
              className="w-8 h-8 max-lg:w-5 max-lg:h-5"
              src="/icons/star.svg"
              width={25}
              height={25}
              alt="star"
            />
            <img
              className="w-8 h-8 max-lg:w-5 max-lg:h-5"
              src="/icons/star.svg"
              width={25}
              height={25}
              alt="star"
            />
            <img
              className="w-8 h-8 max-lg:w-5 max-lg:h-5"
              src="/icons/star.svg"
              width={25}
              height={25}
              alt="star"
            />
            <img
              className="w-8 h-8 max-lg:w-5 max-lg:h-5"
              src="/icons/star.svg"
              width={25}
              height={25}
              alt="star"
            />
          </div>
          <div className="text-center text-p5 font-tertiary text-pretty">
            <p>{review.line1}</p>
            <br />
            <p>{review.line2}</p>
          </div>
          <div className="flex items-center flex-col">
            <img className="w-32" src={review.img} alt="avatar" />
            <p className="text-p4 max-lg:text-p5 font-tertiary ">
              {review.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  ));
  return (
    <>
      <div className="flex items-center justify-center flex-col my-32">
        <img src="/logo/coin.webp" width={100} height={100} alt="coin" />
        <h2 className="text-left font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
          Real Verified Cat reviews
        </h2>
        <Slider items={items} />
      </div>
    </>
  );
};
