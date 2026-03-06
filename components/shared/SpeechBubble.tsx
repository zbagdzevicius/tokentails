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
  const isCatFed = cat?.status.EAT === 4;
  const currentMessageToDisplay = isCatFed ? afterFeedMessage : greetingMessage;

  useEffect(() => {
    setIsVisible(false);
    setDisplayText("");
    setTypingIndex(0);

    const timeout = setTimeout(() => {
      setIsVisible(true);
    }, 500); // Delay before message starts appearing

    return () => clearTimeout(timeout);
  }, [isCatFed]);

  useEffect(() => {
    if (isVisible && typingIndex < currentMessageToDisplay!.length) {
      const timeout = setTimeout(() => {
        setDisplayText((prev) => prev + currentMessageToDisplay![typingIndex]);
        setTypingIndex((prev) => prev + 1);
      }, 40);

      return () => clearTimeout(timeout);
    }

    if (isCatFed && typingIndex === currentMessageToDisplay!.length) {
      const hideTimeout = setTimeout(() => {
        setIsVisible(false);
        setDisplayText("");
      }, 1600);

      return () => clearTimeout(hideTimeout);
    }
  }, [typingIndex, isVisible, currentMessageToDisplay, isCatFed]);

  return (
    <div className="absolute h-full w-full inset-0">
      {isVisible && (
        <div
          className={`absolute z-10 bottom-1/2 left-1/2 transform -translate-x-1 -translate-y-9 text-center text-sm text-black bg-white ${
            isCatFed ? "p-px" : "p-3"
          } lg:w-64 w-40 shadow-[0_-4px_#fff,0_-8px_#000,4px_0_#fff,4px_-4px_#000,8px_0_#000,0_4px_#fff,0_8px_#000,-4px_0_#fff,-4px_4px_#000,-8px_0_#000,-4px_-4px_#000,4px_4px_#000]`}
        >
          <p className="font-secondary lg:text-p5 text-p7 font-semibold">
            {displayText}
          </p>
          <div className="absolute bottom-[-6px] left-[32px] lg:h-1 lg:w-1 h-1.5 w-1.5 bg-white shadow-custom"></div>
        </div>
      )}
    </div>
  );
};
