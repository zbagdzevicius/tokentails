import React from "react";
import { Countdown } from "./Countdown";
import { useWeb3, Web3Provider } from "@/context/Web3Context";
import Web3ModalProvider from "@/context/web3";
import { PaymentInputSelect } from "./PaymentInputSelect";
import { useEffect, useState, useRef } from "react";
const TARGET_VALUE = 600000

const memeCats: Record<number, string> = {
    1: "meme-1.gif",
    2: "meme-2.png",
    3: "meme-3.png",
    4: "meme-4.png",
    5: "meme-5.png",
    6: "meme-6.gif",
    7: "meme-7.gif",
    8: "meme-8.png",
    9: "meme-9.png",
    10: "meme-10.png",
    11: "meme-11.png",
    12: "meme-12.png",
    13: "meme-13.png",
    14: "meme-14.gif",
    15: "meme-15.png",
    16: "meme-16.png",
    17: "meme-17.png",
    18: "meme-18.png",
    19: "meme-19.png",
    20: "meme-20.png",
    21: "meme-21.gif",
    22: "meme-22.gif",
    23: "meme-23.gif",
    24: "meme-24.gif",
    25: "meme-25.png",
    26: "meme-26.png",
    27: "meme-27.png",
    28: "meme-28.png",
    29: "meme-29.png",
    30: "meme-30.gif",
    31: "meme-31.gif",
    32: "meme-32.png",
    33: "meme-33.png",
    34: "meme-34.gif",
    35: "meme-35.png",
    36: "meme-36.png",
    37: "meme-37.png",
    38: "meme-38.png",
    39: "meme-39.png",
    40: "meme-40.png",
    41: "meme-41.png",
    42: "meme-42.png",
    43: "meme-43.png",
    44: "meme-44.png",
    45: "meme-45.png",
    46: "meme-46.gif",
    47: "meme-47.png",
    48: "meme-48.gif",
    49: "meme-49.png",
    50: "meme-50.png",
    51: "meme-51.png",
    52: "meme-52.png",
    53: "meme-53.png",
    54: "meme-54.png",
    55: "meme-55.png",
    56: "meme-56.png",
    57: "meme-57.png",
    58: "meme-58.png",
    59: "meme-59.png",
    60: "meme-60.png"
};

const sadCats: Record<number, string> = {
    1: "meme-1.gif",
    2: "meme-23.gif",
    3: "meme-21.gif",
};

const happyCats: Record<number, string> = {
    1: "meme-40.gif",
    2: "meme-14.gif",
    3: "meme-7.gif"
};

interface IPresaleCardContent {
    currentFunds: number
}



export const PresaleCardContent = ({ currentFunds }: IPresaleCardContent) => {
    const [fillPercentage, setFillPercentage] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);
    const [animationDuration, setAnimationDuration] = useState("0.1s");
    const [currentCat, setCurrentCat] = useState(sadCats[1]);
    const prevFundsRef = useRef<number | null>(null);

    const { finalTokenPrice } = useWeb3();
    useEffect(() => {
        const percentage = (currentFunds / TARGET_VALUE) * 100;
        if (percentage >= 0 && percentage <= 100) {
            setFillPercentage(percentage);
        }

        const newStepIndex = Math.min(Math.floor((currentFunds / TARGET_VALUE) * 60), 59);
        setStepIndex(newStepIndex);



        const timer = setTimeout(() => {
            setAnimationDuration("6s");
        }, 1);

        return () => clearTimeout(timer);
    }, [currentFunds]);

    useEffect(() => {
        const sadKeys = Object.keys(sadCats);
        const randomKey = sadKeys[Math.floor(Math.random() * sadKeys.length)];
        setCurrentCat(sadCats[Number(randomKey)]);
    }, []);

    useEffect(() => {
        if (prevFundsRef.current !== null && prevFundsRef.current !== currentFunds) {
            const happyKeys = Object.keys(happyCats);
            const randomKey = happyKeys[Math.floor(Math.random() * happyKeys.length)];
            setCurrentCat(happyCats[Number(randomKey)]);
        }
        prevFundsRef.current = currentFunds;
    }, [currentFunds]);

    return (
        <>
            <div className="relative flex items-center justify-center flex-col rem:w-[390px] md:rem:w-[500px] mt-10 md:m-20">
                <img className="absolute w-16 md:w-20 h-12 md:h-14 top-0 -translate-y-8 rotate-12" alt='cat' src={`/meme-cats/${currentCat}`} />
                <svg
                    viewBox="0 0 332.849 362.849"
                    xmlns="http://www.w3.org/2000/svg"
                    className="rem:w-[390px] md:rem:w-[500px]"
                >
                    <defs>
                        <clipPath id="milkFill">
                            <path
                                d={`
          M 0,${362.849 - (fillPercentage / 100) * 362.849}
          Q 100,${362.849 - (fillPercentage / 100) * 362.849 - 30}
          200,${362.849 - (fillPercentage / 100) * 362.849}
          T 400,${362.849 - (fillPercentage / 100) * 362.849}
          L 400,362.849 L 0,362.849 Z`}
                                fill="white">
                                <animate
                                    attributeName="d"
                                    dur={animationDuration}
                                    repeatCount="indefinite"
                                    values={`
            M 0,${362.849 - (fillPercentage / 100) * 362.849}
            Q 100,${362.849 - (fillPercentage / 100) * 362.849 - 30}
            200,${362.849 - (fillPercentage / 100) * 362.849}
            T 400,${362.849 - (fillPercentage / 100) * 362.849}
            L 400,362.849 L 0,362.849 Z;

            M -50,${362.849 - (fillPercentage / 100) * 362.849}
            Q 50,${362.849 - (fillPercentage / 100) * 362.849 - 25}
            150,${362.849 - (fillPercentage / 100) * 362.849}
            T 350,${362.849 - (fillPercentage / 100) * 362.849}
            L 400,362.849 L 0,362.849 Z;

            M 0,${362.849 - (fillPercentage / 100) * 362.849}
            Q 100,${362.849 - (fillPercentage / 100) * 362.849 - 30}
            200,${362.849 - (fillPercentage / 100) * 362.849}
            T 400,${362.849 - (fillPercentage / 100) * 362.849}
            L 400,362.849 L 0,362.849 Z;
          `}
                                />
                            </path>
                        </clipPath>
                    </defs>
                    <path
                        d="M 224.907 362.849 L 85.194 362.849 C 84.112 362.849 83.06 362.498 82.194 361.849 C 81.83 361.576 73.136 354.938 61.551 335.982 C 52.898 321.823 38.382 291.659 38.382 248.731 C 38.382 219.397 50.89 189.231 60.94 164.992 C 64.056 157.477 66.998 150.38 69.27 144.045 C 78.24 119.023 83.764 56.616 84.255 50.896 C 84.13 49.965 83.409 45.884 79.486 35.292 C 74.75 22.504 63.102 8.327 62.985 8.186 C 61.656 6.578 61.464 4.312 62.506 2.504 C 63.548 0.696 65.608 -0.273 67.66 0.067 L 171.68 17.404 L 240.066 29.651 C 242.605 30.106 245.295 32.669 244.168 34.988 C 219.681 85.363 272.835 272.73 274.708 256.113 C 272.74 316.401 230.291 359.536 228.443 361.384 C 227.504 362.322 226.233 362.849 224.907 362.849 Z M 87.051 352.849 L 222.749 352.849 C 230.15 344.766 264.778 304.13 264.778 251.79 C 264.778 220.856 255.583 198 246.691 175.896 C 238.161 154.693 230.105 134.665 230.105 109.018 C 230.105 97.951 230.851 82.703 231.706 68.85 L 93.543 59.189 C 91.738 78.029 86.599 125.34 78.683 147.419 C 76.329 153.983 73.342 161.19 70.178 168.821 C 60.468 192.241 48.383 221.387 48.383 248.73 C 48.383 289.21 61.98 317.503 70.085 330.766 C 78.142 343.952 84.528 350.518 87.051 352.849 Z M 94.109 49.204 L 232.354 58.871 C 232.93 50.39 233.485 43.125 233.835 38.694 L 169.976 27.257 L 78.181 11.957 C 81.944 17.539 86.245 24.747 88.864 31.816 C 92.54 41.742 93.733 46.797 94.109 49.204 Z M 90.546 356.417 C 88.839 356.417 71.589 338.223 70.655 336.649 C 69.919 335.407 44.392 289.777 44.392 251.79 C 44.392 214.01 62.602 178.216 63.415 176.564 C 64.633 174.087 87.978 54.856 90.456 56.075 C 92.934 57.292 234.247 64.617 233.031 67.095 C 232.843 67.48 267.858 234.559 267.858 269.976 C 267.858 305.127 246.228 325.641 246.395 325.923 C 247.798 328.299 226.661 352.581 224.286 353.987 C 223.487 354.461 91.412 356.417 90.546 356.417 Z"
                        fill="#fff"
                        clipPath="url(#milkFill)"
                    />
                    <path
                        d="M 225.773 362.849 L 86.06 362.849 C 84.978 362.849 83.926 362.498 83.06 361.849 C 82.696 361.576 74.002 354.938 62.417 335.982 C 53.764 321.823 39.248 291.659 39.248 248.731 C 39.248 219.397 51.756 189.231 61.806 164.992 C 64.922 157.477 67.864 150.38 70.136 144.045 C 79.106 119.023 84.63 56.616 85.121 50.896 C 84.996 49.965 84.275 45.884 80.352 35.292 C 75.616 22.504 63.968 8.327 63.851 8.186 C 62.522 6.578 62.33 4.312 63.372 2.504 C 64.414 0.696 66.474 -0.273 68.526 0.067 L 172.546 17.404 L 240.932 29.651 C 243.471 30.106 245.247 32.418 245.034 34.988 C 245.008 35.295 243.41 54.587 242.226 75.083 C 252.304 73.097 271.684 71.062 286.541 80.297 C 308.681 94.059 323.1 155.521 323.574 184.401 C 324.04 212.846 318.46 230.406 305.479 241.337 C 296.585 248.827 280.467 254.501 275.574 256.113 C 273.606 316.401 231.157 359.536 229.309 361.384 C 228.37 362.322 227.099 362.849 225.773 362.849 Z M 87.917 352.849 L 223.615 352.849 C 231.016 344.766 265.644 304.13 265.644 251.79 C 265.644 220.856 256.449 198 247.557 175.896 C 239.027 154.693 230.971 134.665 230.971 109.018 C 230.971 97.951 231.717 82.703 232.572 68.85 L 94.409 52.261 C 92.604 71.101 87.465 125.34 79.549 147.419 C 77.195 153.983 74.208 161.19 71.044 168.821 C 61.334 192.241 49.249 221.387 49.249 248.73 C 49.249 289.21 62.846 317.503 70.951 330.766 C 79.008 343.952 85.394 350.518 87.917 352.849 Z M 241.673 85.433 C 241.255 94.063 240.97 102.374 240.97 109.019 C 240.97 132.73 248.676 151.885 256.834 172.165 C 265.485 193.67 274.412 215.863 275.527 245.55 C 281.663 243.353 292.847 238.902 299.036 233.69 C 306.082 227.755 314.103 216.81 313.574 184.567 C 313.038 151.884 296.965 98.552 281.261 88.791 C 268.031 80.566 249.136 83.715 241.673 85.433 Z M 90.645 40.544 L 233.22 58.871 C 233.796 50.39 234.351 43.125 234.701 38.694 L 170.842 27.257 L 79.047 11.957 C 82.81 17.539 87.111 24.747 89.73 31.816 C 93.406 41.742 90.269 38.137 90.645 40.544 Z"

                        stroke="black"
                        strokeWidth="2"
                    />
                </svg>
                <div className="absolute top-[20%] -translate-x-3">
                    <h1 className="font-bold font-secondary text-[#FAB12F] -translate-y-3 text-center text-p4 md:text-p2">Presale ending in</h1>
                    <div className="bg-[#fff3b0] p-1 py-2 md:py-4 rounded-xl">
                        <Countdown isDaysDisplayed isBig targetDate={'2024-12-20T00:00:00'} />
                        <p className="text-center text-[#FAB12F] font-bold font-secondary text-p5 md:text-p3 translate-y-2 md:translate-y-3 pt-1">LAST CHANCE TO BUY!</p>
                    </div>
                </div>
                <div className="absolute -translate-x-3 md:translate-y-2 translate-y-1">
                    <img className="w-8 lg:w-12 h-8 lg:h-12" src={`/meme-cats/${Object.values(memeCats)[stepIndex]}`} />
                </div>
                <div className="absolute top-[50%] flex flex-col items-center -translate-x-3 md:-translate-y-0 -translate-y-2">
                    <p className="text-center text-[#FAB12F] font-semibold font-secondary text-p5 md:text-p3 translate-y-3 pt-5">Raised: &#36; {currentFunds}</p>
                    <p className="text-center text-[#FAB12F] font-semibold font-secondary text-p5 md:text-p3 translate-y-3 ">
                        1 $TAILS =
                        <span className="relative inline-block pl-1">
                            <span className="absolute md:-translate-y-2 text-red-500 -translate-y-[0.375rem] left-0  text-p6 md:text-p5 whitespace-nowrap pl-1">
                                &#36;{finalTokenPrice?.toFixed(4)}
                            </span>
                            <span className="text-p7 md:text-p5  line-through   md:translate-y-2">&#36;0.03</span>
                        </span>
                    </p>

                </div>

                <div className=" absolute bottom-1 md:bottom-3 -translate-x-3">
                    <PaymentInputSelect />
                </div>
            </div >
        </>
    )
};

interface IPresaleCard {
    currentFunds: number;
}

export const PresaleCard = ({ currentFunds }: IPresaleCard) => {

    return (
        <Web3ModalProvider>
            <Web3Provider>
                <PresaleCardContent currentFunds={currentFunds} />
            </Web3Provider>
        </Web3ModalProvider>
    );
};
