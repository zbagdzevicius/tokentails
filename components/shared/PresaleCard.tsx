import React from "react";
import { PixelButton } from "./PixelButton";
import { Countdown } from "./Countdown";
export const PresaleCard = () => {
    return (
        <div className="pixel-border w-96 h-fit bg-[#6EC207] m-20 flex flex-col items-center gap-5">
            <h1 className="text-white uppercase font-bold text-p3">Presale ending in</h1>
            <div className="rounded-xl bg-white px-1 pt-3 tb-2 flex flex-col">
                <Countdown isBig targetDate={'Sat dec 08 2024 00:00:00'} isDaysDisplayed />
                <p className="pt-3 uppercase text-center font-bold">LAST CHAnCE TO BUY!</p>
            </div>
            <div>
                <p className="text-white font-semibold text-p5">
                    Raised: &#36; 6000000
                </p>
                <p className="text-white font-semibold text-p5">
                    1<span> &TAIL: &#36; 6000000</span>
                </p>
            </div>
            <div className="w-56 flex flex-col gap-4 items-center">
                <PixelButton isWidthFull isBig text="BUY WITH CARD " />
                <PixelButton isWidthFull isBig text="BUY WITH CRYPTO" />
            </div>
            <a href="#">
                <p className="text-white underline text-p5">
                    Don't have a wallet?
                </p>
            </a>
        </div>
    )
};
