import { SocialImages } from "./Team";

export const Airdrop = () => {
  return (
    <div className="container flex flex-col py-8 justify-center items-center">
      <div className="flex justify-center items-center gap-4 mb-8">
        <img src="/logo/paw.png" className="w-14" />
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl text-cyan-900">
          AIRDROP
        </h2>
        <img src="/logo/coin.webp" className="w-14" />
      </div>
      <div className="flex flex-col sm:flex-row w-full items-center sm:gap-8">
        <div className="sm:w-1/2 flex justify-end">
          <img
            className="w-48 md:w-96 animate-hover hover:brightness-125"
            src="/images/cats-hub/airdrop.webp"
          />
        </div>
        <div className="sm:w-1/2  hover:brightness-110">
          <ul className="font-secondary text-p3 lg:text-p1 flex flex-col gap-2">
            <a
              href="https://x.com/tokentails"
              target="_blank"
              className="flex items-center gap-2 justify-center"
            >
              <img className="w-8 lg:w-16" src={SocialImages.X} />
              <div className="">FOLLOWED ON X</div>
            </a>
            <a
              href="https://t.me/+ofyPNIfNX5w4ZjM8"
              target="_blank"
              className="flex items-center gap-2 justify-center"
            >
              <img className="w-8 lg:w-16" src={SocialImages.TELEGRAM} />
              <div className="">JOINED TELEGRAM</div>
            </a>
            <li className="flex items-center gap-2 justify-center">
              <img
                className="w-8 lg:w-16"
                src="/images/cats-slider/joy-cat.webp"
              />
              <div className="">OWNED 3+ NFT CATS</div>
            </li>
            <li className="flex items-center gap-2 justify-center">
              <img className="w-8 lg:w-16" src="/logo/rocket.png" />
              <div className="text-nowrap">REACHED 30 DAYS STREAK</div>
            </li>
            <li className="flex items-center gap-2 justify-center">
              <img
                className="w-8 lg:w-16"
                src="/images/cats-slider/coin-cat.webp"
              />
              <div className="md:text-nowrap">
                GOT 10k COINS IN CATBASSADORS
              </div>
            </li>
            <li className="flex items-center gap-2 text-p5 sm:text-p4 text-center justify-center">
              <div className="sm:text-nowrap">
                $TAILS AIRDROP AMOUNT WILL BE BASED ON GAME AND SOCIAL ACTIVITY
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
