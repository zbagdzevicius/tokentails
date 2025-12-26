import { useEffect, useRef, useState } from "react";

export const MusicPlayer = ({ src }: { src: string }) => {
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
      const audioElement = audioRef.current;

      if (audioElement && isAllowedToPlay) {
        audioElement.volume = 0.2;
        audioElement?.play().catch((error) => {
          console.error("Failed to play audio:", error);
        });
      }
    };

    handleStorageChange();

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [isAllowedToPlay]);

  return (
    <>
      {isAllowedToPlay && (
        <audio ref={audioRef} className="hidden" loop>
          <source src={src} type="audio/mpeg" />
        </audio>
      )}
    </>
  );
};
