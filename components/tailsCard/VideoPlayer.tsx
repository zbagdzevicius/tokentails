import React, { useRef, useEffect } from "react";

const VIDEO_OPENING = "/cards/video-opening.webm";
const VIDEO_PLAY_DELAY = 50;

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
      const timer = setTimeout(() => {
        videoRef.current?.play();
      }, VIDEO_PLAY_DELAY);

      return () => clearTimeout(timer);
    }
  }, [isPlaying]);

  if (!isPlaying) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <video
        ref={videoRef}
        src={VIDEO_OPENING}
        className="w-full h-full object-cover"
        onEnded={onEnded}
        playsInline
      />
    </div>
  );
};
