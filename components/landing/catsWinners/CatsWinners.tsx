import { PixelButton } from "@/components/button/PixelButton";

export const CatsWinners = () => {
  return (
    <div className="flex items-center justify-center container no-p-mobile">
      <div className="w-8/12 max-lg:w-full max-lg:m-2">
        <h2 className="text-left font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
          we’re the first play to save game in the world
        </h2>
        <div className="grid grid-cols-2 md:grid-rows-5 xl:grid-rows-7 gap-6 max-lg:gap-2">
          <div className="flex items-center md:items-start">
            <div className="flex flex-row items-center flex-wrap space-x-3 text-p5 max-lg:text-sm">
              <p className="text-main-rustyOrange">
                Join the most exciting game of 2024. Join now, Cats are limited
                !
              </p>
            </div>
          </div>
          <a
            href="https://zealy.io/cw/tokentails"
            target="_blank"
            className="p-1 max-lg:p-0.5 md:row-span-10 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl hover:animate-hover"
          >
            <img
              className="w-full h-full object-cover rounded-2xl"
              src="/images/cats-winners/adventures.jpg"
              width={200}
              height={200}
              alt="cats"
            />
          </a>
          <a
            href="/game"
            className="p-1 max-lg:p-0.5 md:row-span-10 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl hover:animate-hover"
          >
            <img
              className="w-full h-full object-cover rounded-2xl"
              src="/images/cats-winners/adopt.jpg"
              width={200}
              height={200}
              alt="cats"
            />
          </a>
          <a
            href="https://t.me/CatbassadorsBot"
            target="_blank"
            className="p-1 max-lg:p-0.5 md:row-span-9 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl hover:animate-hover"
          >
            <img
              className="w-full h-full object-cover rounded-2xl"
              src="/images/cats-winners/catbassador.jpg"
              width={200}
              height={200}
              alt="cats"
            />
          </a>
          <a
            href="/feed"
            className="p-1 max-lg:p-0.5 md:row-span-10 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl hover:animate-hover"
          >
            <img
              className="w-full h-full object-cover rounded-2xl"
              src="/images/cats-winners/friends.jpg"
              width={200}
              height={200}
              alt="cats"
            />
          </a>
          <div className="md:rows-span-2">
            <div className="flex flex-col items-center md:flex-row justify-center md:justify-between gap-4">
              <div className="flex flex-col">
                <p className="text-p4 max-lg:text-p5 font-tertiary">
                  Select from
                </p>
                <div className="text-h2 max-lg:text-h3 font-secondary">
                  1000+
                </div>
                <p className="text-p4 max-lg:text-p5 font-tertiary flex items-center">
                  Virtual Cats <img src="/images/cats-winners/cat-heart.gif" />
                </p>
              </div>
              <a href="/game">
                <PixelButton text="PLAY NOW" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
