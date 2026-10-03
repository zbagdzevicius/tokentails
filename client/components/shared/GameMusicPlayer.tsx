import { acquireMusicEngine, releaseMusicEngine, type MusicEngine } from "@/components/audio/musicEngine";
import { trackFor } from "@/components/audio/tracks";
import { useGame } from "@/context/GameContext";
import { GameType } from "@/models/game";
import { useEffect, useRef } from "react";

/**
 * The game shell's music (plan G14 "Audio"): the lobby loops its night theme, each mode its own
 * track. Playback, the first-input unlock, volume, mute, suspension and visibility all live in the
 * shared music engine (`components/audio/musicEngine`); this component only picks the track.
 */
export const GameMusicPlayer = () => {
  const { gameType, level } = useGame();
  const engineRef = useRef<MusicEngine | null>(null);

  useEffect(() => {
    engineRef.current = acquireMusicEngine();
    return () => {
      engineRef.current = null;
      releaseMusicEngine();
    };
  }, []);

  // Purrsuit picks a new song per level; every other mode keeps its track across levels.
  const levelKey = gameType === GameType.CATNIP_CHAOS ? level : null;
  useEffect(() => {
    engineRef.current?.setTrack(trackFor(gameType));
  }, [gameType, levelKey]);

  return null;
};

