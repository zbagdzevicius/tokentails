import { useState, useEffect } from "react";
import { TogglePixelButton } from "./TogglePixelButton";

export const GameMusicToggle = () => {
  const [isMusicOn, setIsMusicOn] = useState<boolean>(() => {
    const savedMusicSetting = localStorage.getItem("gameMusic");
    return savedMusicSetting === null ? true : JSON.parse(savedMusicSetting);
  });

  // Update localStorage whenever the toggle changes
  useEffect(() => {
    localStorage.setItem("gameMusic", JSON.stringify(isMusicOn));

    // Dispatch a storage event manually to ensure other components react
    const storageEvent = new StorageEvent("storage", {
      key: "gameMusic",
      newValue: JSON.stringify(isMusicOn),
    });
    window.dispatchEvent(storageEvent);
  }, [isMusicOn]);

  return (
    <div className="flex flex-row items-center justify-center w-full">
      <div
        className={`flex flex-row relative items-center to-yellow-900 border-4 border-yellow-900 font-secondary rounded-lg bg-gradient-to-r px-2 ${
          isMusicOn ? "bg-green-300 from-green-300" : "bg-red-300 from-red-300"
        }`}
      >
        <p
          className={`text-p4 pr-2 ${
            isMusicOn ? "text-yellow-900" : "text-yellow-900"
          }`}
        >
          Music
        </p>
        <TogglePixelButton
          defaultActive={isMusicOn}
          onClick={() => setIsMusicOn((prev) => !prev)}
        />
      </div>
    </div>
  );
};
