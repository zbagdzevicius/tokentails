import { PixelButton } from "./PixelButton";

export const ShelterBenefits = () => {
  return (
    <div className="w-54 rounded-xl flex relative justify-center py-2 m-auto mt-4 transition-animation">
      <div className="relative z-10 items-center flex flex-col w-full">
        <div
          style={{
            backgroundImage: "url(/backgrounds/bg-7.png)",
            backgroundSize: "cover",
            backgroundPosition: "top",
          }}
          className="text-p4 h-24 relative font-secondary w-full flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-main-black"
        >
          <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-main-black">
            Shelter Bio
          </div>
          <div className="text-p2 h-14 font-secondary w-full flex items-center justify-center -mb-4">
            <img
              draggable={false}
              className="w-14 z-10 pixelated -ml-10"
              src="/cats/pinkie/pink-lamiendo-ropa.gif"
            />
            <span>Rožinė Pėdutė</span>
            <img
              draggable={false}
              className="w-14 z-10 pixelated -mr-10 scale-x-[-1]"
              src="/cats/pinkie/pink-respirando-ropa.gif"
            />
          </div>
          <div className="text-p4 font-secondary text-main-black w-full flex items-center justify-center gap-1">
            <span className="flex flex-row gap-2">
              <a
                href="https://www.facebook.com/rozine.pedute"
                target="_blank"
                className="text-p5 flex gap-2 items-center hover:bg-red-500 p-2 rounded-2xl"
              >
                <img
                  className="w-6 h-6"
                  src="icons/social/facebook.webp"
                  draggable="false"
                />
                FB
              </a>
              <a
                href="https://www.instagram.com/rozine.pedute/"
                target="_blank"
                className="text-p5 flex gap-2 items-center hover:bg-red-500 p-2 rounded-2xl"
              >
                <img
                  className="w-6 h-6"
                  src="icons/social/instagram.png"
                  draggable="false"
                />
                IG
              </a>
              <a
                href="https://www.tiktok.com/@rozine.pedute"
                target="_blank"
                className="text-p5 flex gap-2 items-center hover:bg-red-500 p-2 rounded-2xl"
              >
                <img
                  className="w-6 h-6"
                  src="icons/social/tiktok.png"
                  draggable="false"
                />
                TIKTOK
              </a>
            </span>
          </div>
        </div>
        <a
          target="_blank"
          href="https://www.google.com/maps/place/V%C5%A0%C4%AE+Ro%C5%BEin%C4%97+p%C4%97dut%C4%97/@54.872343,23.9368954,17z/data=!3m1!4b1!4m6!3m5!1s0x8f6d11088502f165:0xea36bc9bf5e83fed!8m2!3d54.872343!4d23.9368954!16s%2Fg%2F11jzb_1hsj?entry=ttu&g_ep=EgoyMDI1MDMxOC4wIKXMDSoASAFQAw%3D%3D"
        >
          <PixelButton isSmall text="view on map"></PixelButton>
        </a>
      </div>
    </div>
  );
};
