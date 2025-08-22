import { Joystick } from "@/components/shared/Joystick";
import { bgStyle, cdnFile } from "@/constants/utils";
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
            className="absolute bottom-12 right-24 md:right-30 rounded-full h-[70px] w-[70px] flex items-center justify-center border-4 border-gray-500"
            style={bgStyle("9")}
          >
            <img
              draggable={false}
              className="h-full w-auto"
              src={cdnFile("game/controls/dash.png")}
              alt="Dash"
            />
          </button>
          <button
            id="jump"
            className="absolute bottom-4 md:bottom-2 right-1 md:right-4 rounded-full h-[90px] w-[90px] flex items-center justify-center border-4 border-gray-500"
            style={bgStyle("9")}
          >
            <img
              draggable={false}
              className="h-1/2 w-auto"
              src={cdnFile("logo/arrow.webp")}
              alt="Jump"
            />
          </button>
          <button
            id="knockback"
            className="absolute bottom-28 md:bottom-28 right-1 md:right-4 rounded-full h-[70px] w-[70px] flex items-center justify-center border-4 border-gray-500"
            style={bgStyle("9")}
          >
            <img
              draggable={false}
              className="h-full w-auto"
              src={cdnFile("game/controls/knockback-spell.png")}
              alt="Spell"
            />
          </button>
        </div>
      </div>
    </>
  );
};
