import { Joystick } from "@/components/shared/Joystick";
import React from "react";

export const MobileButtons: React.FC<{
  isHidden: boolean;
}> = ({ isHidden }: { isHidden: boolean }) => {
  return (
    <>
      <div
        className={`pb-safe z-10 fixed bottom-6 left-0 right-0 w-full flex lg:hidden items-end justify-between ${
          isHidden ? "hidden" : ""
        }`}
      >
        <Joystick />
        <div className="relative flex flex-col items-end space-y-2 bg-red-600">
          <button
            id="dash"
            className="absolute bottom-12 right-28 md:right-30 rounded-full h-[70px] w-[70px] bg-cover bg-center flex items-center justify-center border-4 border-gray-500"
            style={{
              backgroundImage: "url('/backgrounds/bg-7.png')",
            }}
          >
            <img
              className="h-full w-auto"
              src="game/controls/dash.png"
              alt="Dash"
            />
          </button>
          <button
            id="jump"
            className="absolute bottom-4 md:bottom-2 right-2 md:right-4 rounded-full h-[90px] w-[90px] bg-cover bg-center flex items-center justify-center border-4 border-gray-500"
            style={{
              backgroundImage: "url('/backgrounds/bg-7.png')",
            }}
          >
            <img
              className="h-full w-auto"
              src="game/controls/jump-moba.png"
              alt="Jump"
            />
          </button>
          <button
            id="knockback"
            className="absolute bottom-32 md:bottom-28 right-0 md:right-4 rounded-full h-[70px] w-[70px] bg-cover bg-center flex items-center justify-center border-4 border-gray-500"
            style={{
              backgroundImage: "url('/backgrounds/bg-7.png')",
            }}
          >
            <img
              className="h-full w-auto"
              src="game/controls/knockback-spell.png"
              alt="Jump"
            />
          </button>
        </div>
      </div>
    </>
  );
};
