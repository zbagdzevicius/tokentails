import { GameModal } from "@/components/ui/GameModal";
import { cdnFile } from "@/constants/utils";
import React, { useCallback, useEffect, useRef } from "react";

type VideoPlayerProps = {
  isPlaying: boolean;
  onEnded: () => void;
};

/**
 * The pack-opening video, full screen on the night scrim (plan G6 "Overlay migration"). It is a
 * GameModal on the nested layer, above the Packs modal it plays from: focus is trapped, the game
 * behind is suspended, and the X (or Esc) skips straight to the reveal. `onEnded` runs once per
 * play, whether the video ends, fails, or is skipped.
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  isPlaying,
  onEnded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const endedRef = useRef(false);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnded();
  }, [onEnded]);

  useEffect(() => {
    if (!isPlaying) return;
    endedRef.current = false;
    // The dialog content mounts in the same commit; wait one frame for the portal's <video>.
    const frame = requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = 0;
      const played = video.play();
      // If the browser cannot play this WebM, continue the flow without the video.
      if (played && typeof played.catch === "function") played.catch(finish);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, finish]);

  if (!isPlaying) return null;

  return (
    <GameModal
      open
      onOpenChange={(next) => {
        if (!next) finish();
      }}
      title="Opening your pack"
      description="Close to skip the video."
      name="pack-video"
      surface="art"
      size="full"
      layer="modal-nested"
      className="h-full"
      bodyClassName="overflow-hidden rounded-lg bg-tt-night-950 ring-1 ring-tt-gold-500/30"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="h-full w-full object-cover"
        onEnded={finish}
        onError={finish}
      >
        <source
          src={cdnFile("cards/openings/starter.webm")}
          type="video/webm; codecs=vp9"
        />
      </video>
    </GameModal>
  );
};
