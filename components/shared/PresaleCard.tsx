import React from "react";
import { Countdown } from "./Countdown";
import { Web3Transfer } from "../web3/minting/Web3Transfer";
import { Web3Provider } from "@/context/Web3Context";
import Web3ModalProvider from "@/context/web3";
import { PaymentInputSelect } from "./PaymentInputSelect";

export const PresaleCard = () => {
    const [fillPercentage, setFillPercentage] = React.useState(0);

    const handleFill = (percentage: number) => {
        if (percentage >= 0 && percentage <= 100) {
            setFillPercentage(percentage);
        }
    };
    return (
        <>
            <Web3ModalProvider>
                <Web3Provider >
                    <div className="flex items-center justify-center flex-col rem:w-[434px] md:rem:w-[484px] h-fit m-10 md:m-20">
                        <svg
                            viewBox="0 0 362.849 362.849"
                            xmlns="http://www.w3.org/2000/svg"
                            className="jug-svg"
                        >
                            <defs>
                                {/* ClipPath for animating the milk fill */}
                                <clipPath id="milkFill">
                                    <rect
                                        x="0"
                                        y={`${100 - fillPercentage}%`}
                                        width="100%"
                                        height={`${fillPercentage}%`}
                                        className="milk-level"
                                    />
                                </clipPath>
                            </defs>
                            {/* Jug outline */}
                            <path
                                d="M225.773,362.849H86.06c-1.082,0-2.134-0.351-3-1c-0.364-0.273-9.058-6.911-20.643-25.867c-8.653-14.159-23.169-44.323-23.169-87.251c0-29.334,12.508-59.5,22.558-83.739c3.116-7.515,6.058-14.612,8.33-20.947c8.97-25.022,14.494-87.429,14.985-93.149c-0.125-0.931-0.846-5.012-4.769-15.604C75.616,22.504,63.968,8.327,63.851,8.186c-1.329-1.608-1.521-3.874-0.479-5.682c1.042-1.808,3.102-2.777,5.154-2.437l104.02,17.337l68.386,12.247c2.539,0.455,4.315,2.767,4.102,5.337c-0.026,0.307-1.624,19.599-2.808,40.095c10.078-1.986,29.458-4.021,44.315,5.214c22.14,13.762,36.559,75.224,37.033,104.104c0.466,28.445-5.114,46.005-18.095,56.936c-8.894,7.49-25.012,13.164-29.905,14.776c-1.968,60.288-44.417,103.423-46.265,105.271C228.37,362.322,227.099,362.849,225.773,362.849z"
                                fill="none"
                                stroke="black"
                                strokeWidth="2"
                            />
                            {/* Milk fill using clipping */}
                            <path
                                d="M225.773,362.849H86.06c-1.082,0-2.134-0.351-3-1c-0.364-0.273-9.058-6.911-20.643-25.867c-8.653-14.159-23.169-44.323-23.169-87.251c0-29.334,12.508-59.5,22.558-83.739c3.116-7.515,6.058-14.612,8.33-20.947c8.97-25.022,14.494-87.429,14.985-93.149c-0.125-0.931-0.846-5.012-4.769-15.604C75.616,22.504,63.968,8.327,63.851,8.186c-1.329-1.608-1.521-3.874-0.479-5.682c1.042-1.808,3.102-2.777,5.154-2.437l104.02,17.337l68.386,12.247c2.539,0.455,4.315,2.767,4.102,5.337c-0.026,0.307-1.624,19.599-2.808,40.095c10.078-1.986,29.458-4.021,44.315,5.214c22.14,13.762,36.559,75.224,37.033,104.104c0.466,28.445-5.114,46.005-18.095,56.936c-8.894,7.49-25.012,13.164-29.905,14.776c-1.968,60.288-44.417,103.423-46.265,105.271C228.37,362.322,227.099,362.849,225.773,362.849z"
                                fill="#fff"
                                clipPath="url(#milkFill)"
                            />
                        </svg>
                    </div>
                </Web3Provider >
            </Web3ModalProvider>
        </>
    )
};
