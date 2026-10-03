import { acquireMusicEngine, releaseMusicEngine } from "@/components/audio/musicEngine";
import { useEffect } from "react";

/**
 * Loops `src` through the shared music engine (plan G14 "Audio"), so it follows the same first
 * input unlock, volume, mute, suspension and visibility rules as the game shell. Only one music
 * track plays per page: the last `src` set wins.
 */
export const MusicPlayer = ({ src }: { src: string }) => {
  useEffect(() => {
    const engine = acquireMusicEngine();
    engine?.setTrack(src);
    return () => {
      releaseMusicEngine();
    };
  }, [src]);
  return null;
};
