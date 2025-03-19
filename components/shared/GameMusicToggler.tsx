import { useState, useEffect } from "react";
import { TogglePixelButton } from "./TogglePixelButton";

export const GameMusicToggle = () => {
  const [isMusicOn, setIsMusicOn] = useState<boolean>(() => {
    const savedMusicSetting = localStorage.getItem("gameMusic");
    console.log("savedMusicSetting", savedMusicSetting);
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
    <div className="flex flex-row items-center justify-center my-1 w-full">
      <div className="flex flex-row relative items-center font-secondary rounded-xl bg-gradient-to-r from-green-300 to-yellow-300 px-3">
        <p className="text-p4 pr-4">Music</p>
        <TogglePixelButton
          defaultActive={isMusicOn}
          onClick={() => setIsMusicOn((prev) => !prev)}
        />
      </div>
    </div>
  );
};
