import { cdnFile } from "@/constants/utils";
import { PixelButton } from "./PixelButton";

export const ShelterBenefits = () => {
  return (
    <div className="w-54 rounded-xl flex relative justify-center py-2 m-auto mt-4 transition-animation hover:scale-125 transition-all z-10">
      <div className="relative z-10 items-center flex flex-col w-full">
        <div
          style={{
            backgroundImage: "url(/backgrounds/bg-9.webp)",
            backgroundSize: "cover",
            backgroundPosition: "top",
          }}
          className="text-p4 h-24 relative font-secondary w-full flex flex-col items-center justify-center gap-1 border-2 rounded-xl border-yellow-900"
        >
          <div className="absolute top-0 bg-gradient-to-b w-fit px-4 from-purple-300 to-blue-300 rounded-xl whitespace-nowrap text-p5 -mt-3 border border-yellow-900">
            Shelter Bio
          </div>
          <div className="text-p2 h-14 font-secondary w-full flex items-center justify-center -mb-4">
            <img
              draggable={false}
              className="w-14 z-10 pixelated -ml-10"
              src={cdnFile("cats/pinkie/pink-lamiendo-ropa.gif")}
            />
            <span className="flex flex-col items-center">
              <span>Rožinė Pėdutė</span>
              <span className="text-p6 -mt-3">
                Located in Lithuania - Helped over 700 cats
              </span>
            </span>
            <img
              draggable={false}
              className="w-14 z-10 pixelated -mr-10 scale-x-[-1]"
              src={cdnFile("cats/pinkie/pink-respirando-ropa.gif")}
            />
          </div>
          <div className="text-p4 font-secondary text-yellow-900 mt-1 w-full flex items-center justify-center gap-1">
            <span className="flex flex-row gap-2">
              <a
                href="https://www.facebook.com/rozine.pedute"
                target="_blank"
                className="text-p5 flex gap-2 items-center hover:bg-red-500 hover:bg-opacity-40 px-2 py-1 rounded-2xl"
              >
                <img
                  className="w-6 h-6"
                  src={cdnFile("icons/social/facebook.webp")}
                  draggable="false"
                />
                FB
              </a>
              <a
                href="https://www.instagram.com/rozine.pedute/"
                target="_blank"
                className="text-p5 flex gap-2 items-center hover:bg-red-500 hover:bg-opacity-40 px-2 py-1 rounded-2xl"
              >
                <img
                  className="w-6 h-6"
                  src={cdnFile("icons/social/ig.webp")}
                  draggable="false"
                />
                IG
              </a>
              <a
                href="https://www.tiktok.com/@rozine.pedute"
                target="_blank"
                className="text-p5 flex gap-2 items-center hover:bg-red-500 hover:bg-opacity-40 px-2 py-1 rounded-2xl"
              >
                <img
                  className="w-6 h-6"
                  src={cdnFile("icons/social/tiktok.webp")}
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
