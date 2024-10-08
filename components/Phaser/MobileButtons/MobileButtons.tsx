import { Joystick } from "@/components/shared/Joystick";
import React from "react";

export const MobileButtons: React.FC<{
  isHidden: boolean;
}> = ({ isHidden }: { isHidden: boolean }) => {
  return (
    <>
      <div
        className={`pb-safe fixed bottom-6 left-0 right-0 w-full flex items-end justify-between ${
          isHidden ? "hidden" : ""
        }`}
      >
        <Joystick />
        <div className="flex flex-col items-end">
          <button id="dash">
            <img
              className="control-button"
              src="game/controls/dash-white.png"
            />
          </button>
          <button id="jump">
            <img className="control-button" src="game/controls/jump.png" />
          </button>
        </div>
        {/* <div className="">
          <button id="left">
            <img className="control-button" src="game/controls/left.png" />
          </button>
          <button id="right">
            <img className="control-button" src="game/controls/right.png" />
          </button>
        </div> */}
      </div>
    </>
  );
};
