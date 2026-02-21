import { cdnFile } from "@/constants/utils";
import React, { useRef, useEffect } from "react";

type VideoPlayerProps = {
  isPlaying: boolean;
  onEnded: () => void;
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  isPlaying,
  onEnded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isPlaying && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // If the browser cannot play this WebM, continue flow without video.
        onEnded();
      });
    }
  }, [isPlaying, onEnded]);

  if (!isPlaying) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
        onEnded={onEnded}
        onError={onEnded}
      >
        <source
          src={cdnFile("cards/openings/starter.webm")}
          type="video/webm; codecs=vp9"
        />
      </video>
    </div>
  );
};
