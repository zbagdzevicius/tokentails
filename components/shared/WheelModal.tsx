import { cdnFile } from "@/constants/utils";
import React, { useRef, useState, useEffect } from "react";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import WheelComponent, { WheelRef } from "../shared/Wheel";
import { useToast } from "@/context/ToastContext";
import { useProfile } from "@/context/ProfileContext";

type Values = 1 | 5 | 10 | 25 | 50 | 100 | 250 | 1000;

interface WheelModalProps {
  close: () => void;
  winningSegment?: Values;
  onFinished?: (segment: Values) => void;
}

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
  const wheelRef = useRef<WheelRef>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (videoRef.current) {
      if (isSpinning) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      } else if (hasSpin) {
        videoRef.current.pause();
        videoRef.current.currentTime = videoRef.current.duration;
      }
    }
  }, [isSpinning, hasSpin]);

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

  const handleSpin = () => {
    if (!profile?.canRedeemLives) {
      toast({ message: "You can't spin the wheel right now!" });
      return;
    }

    if (hasSpin) {
      toast({ message: "You already spin the wheel!" });
      return;
    }

    if (wheelRef.current) {
      wheelRef.current.spin();
      setIsSpinning(true);
      // Mock backend call
      setTimeout(() => {
        const segments: Values[] = [1, 5, 10, 25, 50, 100, 250, 1000];
        const randomValue =
          segments[Math.floor(Math.random() * segments.length)];
        setTargetSegment(randomValue);
      }, 300);
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
              <p className="md:text-p4 text-p5 font-primary  text-center text-[#ead278] font-medium">
                Spin to win{" "}
                <span className=" font-semibold ">1-1000 $TAILS</span> tokens!
              </p>{" "}
            </div>
          </div>
        </div>

        <div className=" relative p-4 md:p-6 lg:p-8 flex items-center justify-center">
          <WheelComponent
            ref={wheelRef}
            segments={[1, 5, 10, 25, 50, 100, 250, 1000] as Values[]}
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

          <video
            ref={videoRef}
            src={cdnFile("roulette/mascot.webm")}
            className="absolute -right-1 bottom-0 md:w-52 md:h-52 w-28 h-28"
            draggable="false"
            muted
            playsInline
          />

          {/* <img
            src={cdnFile("roulette/mascot-showing.webp")}
            className="absolute -right-1  bottom-0 md:w-52 md:h-52 w-28 h-28"
            draggable="false"
            alt="Pointer"
          /> */}

          <div
            className={`absolute left-1/2 -translate-x-1/2 top-0 md:top-3 w-[65%] md:w-[60%] -z-50`}
          >
            <img
              className="top-10 w-full h-full "
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

              <div className="absolute ">
                <div className="w-32 h-32 md:w-40 md:h-40 "></div>
              </div>

              <div
                className="relative animate-bounce"
                style={{
                  animation:
                    "winningNumberAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                }}
              >
                <div className="relative w-24 h-24 md:w-32 md:h-32 ">
                  <img
                    src={cdnFile("roulette/roulette-center.webp")}
                    alt="Winner"
                    className="absolute inset-0 -top-1 left-1   w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div
                      className="text-3xl md:text-4xl pl-1 !leading-none  font-bold text-[#ebc773] font-primary"
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

        {isSpinning ||
          (!hasSpin && (
            <div className="p-4 pr-2 md:pr-1 flex items-center justify-center">
              <PixelButton isMedium onClick={handleSpin} text="SPIN!" />
            </div>
          ))}
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
