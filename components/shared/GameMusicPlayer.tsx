import { getRandomInt } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { GameType } from "@/models/game";
import { useEffect, useRef, useState } from "react";

const gameMusicMap: Record<GameType, string> = {
  [GameType.SHELTER]:
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3",
  [GameType.CATNIP_CHAOS]:
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3",
  [GameType.HOME]:
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3",
};

export const GameMusicPlayer = () => {
  const { gameType } = useGame();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isAllowedToPlay, setIsAllowedToPlay] = useState(false);

  // Detect user interaction to allow audio playback
  useEffect(() => {
    const handleUserInteraction = () => {
      setIsAllowedToPlay(true);
    };

    window.addEventListener("click", handleUserInteraction);

    return () => {
      window.removeEventListener("click", handleUserInteraction);
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      const savedMusicSetting = localStorage.getItem("gameMusic");
      const isMusicOn =
        savedMusicSetting === null ? true : JSON.parse(savedMusicSetting);

      const audioElement = audioRef.current;
      if (!audioElement || !gameType) return;

      if (isMusicOn && isAllowedToPlay) {
        const musicUrl =
          gameType === GameType.CATNIP_CHAOS
            ? `https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/in-game/song${
                getRandomInt(45) + 1
              }.mp3`
            : gameMusicMap[gameType];
        if (audioElement.src !== musicUrl) {
          audioElement.src = musicUrl;
          audioElement.currentTime = 0;
        }
        audioElement.play().catch((error) => {
          console.error("Failed to play audio:", error);
        });
      } else {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
    };

    handleStorageChange();

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [gameType, isAllowedToPlay]);

  if (!gameType) return null;

  return (
    <>
      {isAllowedToPlay && (
        <audio ref={audioRef} style={{ display: "none" }} loop>
          <source
            src={gameType ? gameMusicMap[gameType] : ""}
            type="audio/mpeg"
          />
        </audio>
      )}
    </>
  );
};
