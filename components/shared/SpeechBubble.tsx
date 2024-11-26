import React, { useState, useEffect } from "react";
import { getRandomItemFromArray } from "@/constants/utils";
import { greetingText } from "@/constants/utils";
import { aftrFeedText } from "@/constants/utils";
import { useCat } from "@/context/CatContext";
const greetingMessage = getRandomItemFromArray(greetingText);
const afterFeedMessage = getRandomItemFromArray(aftrFeedText);
export const SpeechBubble = () => {
    const { cat } = useCat();
    const [displayText, setDisplayText] = useState("");
    const [typingIndex, setTypingIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(true);
    const isCatFedded = cat?.status.EAT === 4
    const currentMessageToDisplay = isCatFedded ? afterFeedMessage : greetingMessage

    useEffect(() => {
        setIsVisible(false);
        const timeout = setTimeout(() => {
            setIsVisible(true);
            setDisplayText("");
            setTypingIndex(0);
        }, 500);

        return () => clearTimeout(timeout);
    }, [isCatFedded]);

    useEffect(() => {
        if (isVisible && typingIndex < currentMessageToDisplay!.length) {
            const timeout = setTimeout(() => {
                setDisplayText((prev) => prev + currentMessageToDisplay![typingIndex]);
                setTypingIndex((prev) => prev + 1);
            }, 50);
            return () => clearTimeout(timeout);
        }
    }, [typingIndex, isVisible, currentMessageToDisplay]);

    return (
        <div className="absolute h-screen w-screen inset-0">
            {isVisible && (
                <div
                    className={`absolute bottom-[56%] left-1/2  transform translate-x-1 text-center text-sm text-black bg-white ${isCatFedded ? "p-px" : "p-3"
                        } lg:w-64 w-40 shadow-[0_-4px_#fff,0_-8px_#000,4px_0_#fff,4px_-4px_#000,8px_0_#000,0_4px_#fff,0_8px_#000,-4px_0_#fff,-4px_4px_#000,-8px_0_#000,-4px_-4px_#000,4px_4px_#000]`}
                >
                    <p className="font-quanternary lg:text-p5 text-p7 font-semibold">
                        {displayText}
                    </p>
                    <div className="absolute bottom-[-6px] left-[32px] lg:h-1 lg:w-1 h-1.5 w-1.5 bg-white shadow-custom"></div>
                </div>
            )}
        </div>
    )
}
