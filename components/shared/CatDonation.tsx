import { PixelButton } from "./PixelButton";

export const CatDonation = () => {
  return (
    <div className="w-54 rounded-xl flex flex-col items-center relative justify-center py-2 m-auto mt-4 transition-animation hover:scale-125 transition-all z-10">
      <img src="/logo/shelter.webp" className="w-52" />
      <div className="relative z-10 items-center flex flex-col w-full">
        <div
          style={{
            backgroundImage: "url(/backgrounds/bg-7.png)",
            backgroundSize: "cover",
            backgroundPosition: "top",
          }}
          className="text-p4 h-32 relative font-secondary w-full flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
        >
          <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
            DONATION DETAILS
          </div>
          <div className="text-p2 h-14 font-secondary w-full flex items-center justify-center -mb-4">
            <img
              draggable={false}
              className="w-14 z-10 pixelated -ml-10"
              src="/cats/pinkie/pink-lamiendo-ropa.gif"
            />
            <span className="flex flex-col items-center">
              <span>100% TO CATS</span>
            </span>
            <img
              draggable={false}
              className="w-14 z-10 pixelated -mr-10 scale-x-[-1]"
              src="/cats/pinkie/pink-respirando-ropa.gif"
            />
          </div>
          <div className="text-p5 font-secondary text-main-black mt-1 w-full flex flex-col items-center justify-center px-1">
            <span>WE HELP SHELTERS RAISE FUNDS</span>
            <span>EVERY DONATION IS FULLY TRANSPARENT</span>
            <span>QUARTERLY STATUS REPORT ON SAVED CATS</span>
          </div>
        </div>
        <a
          target="_blank"
          href="https://x.com/tokentails/status/1891794225177432146"
        >
          <PixelButton isSmall text="READ MORE"></PixelButton>
        </a>
      </div>
    </div>
  );
};
