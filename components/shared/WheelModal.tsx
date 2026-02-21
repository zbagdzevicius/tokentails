import { cdnFile } from "@/constants/utils";
import React, { useRef, useState, useEffect } from "react";
import { CloseButton } from "./CloseButton";
import WheelComponent, { WheelRef } from "../shared/Wheel";
import { useToast } from "@/context/ToastContext";
import { useProfile } from "@/context/ProfileContext";
import { USER_API } from "@/api/user-api";
import { useGame } from "@/context/GameContext";
import { isMobile } from "@/constants/utils";

type Values = 1 | 5 | 10 | 25 | 50 | 100 | 250 | 1000;

const SEGMENTS: Values[] = [1, 5, 10, 25, 50, 100, 250, 1000];

interface WheelModalProps {
  close: () => void;
  winningSegment?: Values;
  onFinished?: (segment: Values) => void;
}

/**
 * Maps a tails value to the closest valid segment value
 */
const mapTailsToSegment = (tails: number): Values => {
  // If the value is exactly one of the segments, return it
  if (SEGMENTS.includes(tails as Values)) {
    return tails as Values;
  }

  // Find the closest segment value
  let closest = SEGMENTS[0];
  let minDiff = Math.abs(tails - closest);

  for (const segment of SEGMENTS) {
    const diff = Math.abs(tails - segment);
    if (diff < minDiff) {
      minDiff = diff;
      closest = segment;
    }
  }

  return closest;
};

export const WheelModal: React.FC<WheelModalProps> = ({
  close,
  winningSegment,
  onFinished,
}) => {
  const { profile, setProfileUpdate } = useProfile();
  const [hasSpin, setHasSpin] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showWinningNumber, setShowWinningNumber] = useState(false);
  const [wonSegment, setWonSegment] = useState<Values | undefined>(undefined);
  const [targetSegment, setTargetSegment] = useState<Values | undefined>(
    winningSegment,
  );

  const { addNotification } = useGame();
  const wheelRef = useRef<WheelRef>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const buttonAudioRefs = useRef<Record<"click" | "hover", HTMLAudioElement | null>>({
    click: null,
    hover: null,
  });
  const [isButtonHovering, setIsButtonHovering] = useState(false);
  const [showMascotVideo, setShowMascotVideo] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const audioCache = {
      click: new Audio(cdnFile("audio/button/click-close.wav")),
      hover: new Audio(cdnFile("audio/button/modern-mix.wav")),
    };
    audioCache.click.volume = 0.5;
    audioCache.hover.volume = 0.5;
    buttonAudioRefs.current = audioCache;
  }, []);

  useEffect(() => {
    if (isButtonHovering) {
      buttonAudioRefs.current.hover?.play();
    }
  }, [isButtonHovering]);

  useEffect(() => {
    if (videoRef.current) {
      if (isSpinning) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {
          // Some mobile browsers reject programmatic play.
        });
      } else if (hasSpin) {
        videoRef.current.pause();
        videoRef.current.currentTime = videoRef.current.duration;
      }
    }
  }, [isSpinning, hasSpin]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isMobile()) return;

    const testVideo = document.createElement("video");
    const webmSupport = testVideo.canPlayType('video/webm; codecs="vp9,opus"');
    // Mobile Safari does not support transparent WebM and shows black background.
    setShowMascotVideo(Boolean(webmSupport));
  }, []);

  const handleFinished = (segment: Values) => {
    setHasSpin(true);
    setIsSpinning(false);
    setWonSegment(segment);
    setTimeout(() => {
      setShowWinningNumber(true);
    }, 300);
    onFinished?.(segment);
  };

  const handleClose = () => {
    setHasSpin(false);
    setIsSpinning(false);
    setShowWinningNumber(false);
    setWonSegment(undefined);
    setTargetSegment(undefined);
    close();
  };

  const handleSpin = async () => {
    if (!profile?.canRedeemLives) {
      toast({ message: "You can't spin the wheel right now!" });
      return;
    }

    if (hasSpin) {
      toast({ message: "You already spun the wheel!" });
      return;
    }

    if (!wheelRef.current) {
      return;
    }

    buttonAudioRefs.current.click?.play();

    try {
      setIsSpinning(true);

      // Fetch tails from redeem API
      const { tails } = await USER_API.redeem();
      
      if (!tails) {
        toast({ message: "Failed to redeem reward. Please try again." });
        setIsSpinning(false);
        return;
      }

      // Map tails to closest segment value
      const segmentValue = mapTailsToSegment(tails);
      setTargetSegment(segmentValue);

      // Update profile with redeemed tails
      setProfileUpdate({
        canRedeemLives: false,
        streak: (profile.streak || 0) + 1,
        tails: (profile.tails || 0) + tails,
        monthStreak: (profile.monthStreak || 0) + 1,
      });

      // Start spinning after a short delay to allow state updates
      setTimeout(() => {
        wheelRef.current?.spin();
      }, 100);
    } catch (error) {
      console.error("Failed to redeem reward:", error);
      toast({ message: "Failed to redeem reward. Please try again." });
      setIsSpinning(false);
    }
  };

  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center items-center h-full">
      <div
        onClick={handleClose}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>

      <div
        className="m-auto z-50 font-secondary flex flex-col max-w-[95vw] md:max-w-[90vw] lg:max-w-[1100px] rounded-lg shadow h-fit animate-opacity border-4 border-yellow-300 glow-box overflow-hidden"
        style={{
          backgroundImage: `url(${cdnFile("roulette/roulette-bg.webp")})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <CloseButton onClick={handleClose} absolute />

        <div className="p-4 md:p-6 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center justify-center gap-1">
              <h2 className="md:text-h3 text-h5 font-primary text-yellow-300 glow ">
                $TAILS WHEEL
              </h2>
              <p className="md:text-p4 text-p5 font-primary text-center text-[#ead278] font-medium">
                Spin to win{" "}
                <span className="font-semibold">WIN $TAILS</span> tokens!
              </p>
            </div>
          </div>
        </div>

        <div className="relative p-4 md:p-6 lg:p-8 flex items-center justify-center">
          <WheelComponent
            ref={wheelRef}
            segments={SEGMENTS}
            segColors={[
              "#ef8d44",
              "#f2e0b8",
              "#f7d454",
              "#e6adb4",
              "#de711f",
              "#efcd85",
              "#e8b92b",
              "#e97588",
            ]}
            winningSegment={targetSegment}
            onFinished={handleFinished}
            isOnlyOnce={true}
          />

          {showMascotVideo ? (
            <video
              ref={videoRef}
              src={cdnFile("roulette/mascot.webm")}
              className="absolute -right-1 bottom-0 md:w-52 md:h-52 w-28 h-28"
              draggable="false"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={cdnFile("roulette/mascot.webp")}
              className="absolute -right-1 bottom-0 md:w-52 md:h-52 w-28 h-28 object-contain"
              draggable="false"
              alt="Mascot"
            />
          )}

          <div className="absolute left-1/2 -translate-x-1/2 top-0 md:top-3 w-[65%] md:w-[60%] -z-50">
            <img
              className="top-10 w-full h-full"
              src={cdnFile("roulette/ears.webp")}
              draggable="false"
              alt="Ears"
            />
            <img
              className={`absolute w-full -left-px md:top-1 md:right-px z-1 top-0 ${
                isSpinning ? "animate-blink" : ""
              }`}
              src={cdnFile("roulette/paws.webp")}
              draggable="false"
              alt="Paws"
            />
          </div>

          {(!isSpinning && !hasSpin) && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40">
              <button
                onClick={handleSpin}
                onMouseEnter={() => setIsButtonHovering(true)}
                onMouseLeave={() => setIsButtonHovering(false)}
                className="relative flex items-center justify-center hover:scale-110 transition-all duration-200 hover:brightness-125 active:scale-95 cursor-pointer w-24 h-24 md:w-32 md:h-32"
                style={{
                  aspectRatio: "1 / 1",
                  filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))",
                }}
              >
                {/* Background image like PixelButton */}
                <img
                  src={cdnFile("landing/button-bg.webp")}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover mix-blend-darken brightness-125"
                  style={{
                    borderRadius: "50%",
                    clipPath: "circle(50%)",
                  }}
                />
                {/* Outer pixel art border */}
                <div 
                  className="absolute inset-0"
                  style={{
                    borderRadius: "50%",
                    border: "4px solid #78350f",
                    boxSizing: "border-box",
                  }}
                ></div>
                {/* Main button background */}
                <div 
                  className="absolute"
                  style={{
                    inset: "4px",
                    borderRadius: "50%",
                    backgroundColor: "#fde047",
                    border: "2px solid #78350f",
                  }}
                ></div>
                {/* Inner highlight border */}
                <div 
                  className="absolute"
                  style={{
                    inset: "6px",
                    borderRadius: "50%",
                    border: "1px solid #854d0e",
                  }}
                ></div>
                {/* Text container */}
                <div className="relative z-10 flex flex-col items-center justify-center">
                  <p className="text-yellow-900 font-primary font-normal uppercase text-p4 md:text-p3 whitespace-nowrap">
                    SPIN!
                  </p>
                </div>
                {/* Pixel art highlight/shadow effect */}
                {!isButtonHovering && (
                  <div 
                    className="absolute"
                    style={{
                      inset: "6px",
                      borderRadius: "50%",
                      borderTop: "2px solid #fef08a",
                      borderLeft: "2px solid #fef08a",
                      borderRight: "1px solid #a16207",
                      borderBottom: "1px solid #a16207",
                      opacity: 0.6,
                    }}
                  ></div>
                )}
              </button>
            </div>
          )}

          {showWinningNumber && wonSegment && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
              <div className="absolute inset-0">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-1/2 top-1/2 w-3 h-3 rounded-full"
                    style={{
                      animation: `particle-${i} 1.5s ease-out forwards`,
                      animationDelay: "0.2s",
                      opacity: 0,
                    }}
                  />
                ))}
              </div>

              <div className="absolute">
                <div className="w-32 h-32 md:w-40 md:h-40"></div>
              </div>

              <div
                className="relative animate-bounce"
                style={{
                  animation:
                    "winningNumberAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                }}
              >
                <div className="relative w-24 h-24 md:w-32 md:h-32">
                  <img
                    src={cdnFile("roulette/roulette-center.webp")}
                    alt="Winner"
                    className="absolute inset-0 -top-1 left-1 w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div
                      className="text-3xl md:text-4xl pl-1 !leading-none font-bold text-[#ebc773] font-primary"
                      style={{
                        WebkitTextStroke: "2px #552000",
                      }}
                    >
                      {wonSegment}
                    </div>
                  </div>
                </div>

                <div className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full animate-ping"></div>
                <div
                  className="absolute -bottom-2 -left-2 w-3 h-3 bg-yellow-200 rounded-full animate-ping"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="absolute -top-2 -left-2 w-2 h-2 bg-white rounded-full animate-ping"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for particle animations */}
      <style jsx>{`
        @keyframes winningNumberAppear {
          0% {
            transform: scale(0) rotate(-180deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.2) rotate(10deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        ${[...Array(12)]
          .map(
            (_, i) => `
          @keyframes particle-${i} {
            0% {
              transform: translate(-50%, -50%) translate(0, 0) scale(0);
              opacity: 0;
            }
            20% {
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) translate(${
                Math.cos((i * 30 * Math.PI) / 180) * 150
              }px, ${Math.sin((i * 30 * Math.PI) / 180) * 150}px) scale(1);
              opacity: 0;
            }
          }
        `,
          )
          .join("")}
      `}</style>
    </div>
  );
};
