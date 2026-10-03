import { cdnFile, isMobile } from "@/constants/utils";
import React, { useRef, useState, useEffect } from "react";
import WheelComponent, { WheelRef } from "./Wheel";
import { useToast } from "@/context/ToastContext";
import { useProfile } from "@/context/ProfileContext";
import { USER_API } from "@/api/user-api";
import { GameModal } from "@/components/ui/GameModal";
import { useAccountAction, useLatest } from "@/hooks/useAccountAction";
import { apiUrl } from "@/api/api";
import { formatTails, TAILS_NO_CASH_VALUE } from "@/shared-contracts/copy";
import { useQuery } from "@tanstack/react-query";

type Values = 1 | 5 | 10 | 25 | 50 | 100 | 250 | 1000;

const SEGMENTS: Values[] = [1, 5, 10, 25, 50, 100, 250, 1000];

/**
 * How long the won value stays locked on screen after it appears (the particle burst runs 1.5 s
 * from a 0.2 s delay), so a tap cannot close the modal mid-reveal.
 */
export const WHEEL_REVEAL_HOLD_MS = 1700;
/**
 * The tallest an `art` panel may be: the viewport minus GameModal's safe-area padding, so the
 * panel never runs under a notch or the home indicator (plan G14 "panel `max-h` with safe areas"),
 * less 2rem so the X hanging off the top corner (`placement="outside"`) stays on screen.
 */
export const ART_PANEL_MAX_HEIGHT =
  "calc(100dvh - max(0.75rem, env(safe-area-inset-top)) - max(0.75rem, env(safe-area-inset-bottom)) - 2rem)";
/** Room on each side of a full-width `art` panel for the X that hangs off its corner. */
export const ART_PANEL_FULL_WIDTH = "!w-[calc(100%-2rem)]";

/** The won value appears this long after the wheel stops. */
const WHEEL_REVEAL_DELAY_MS = 300;
/**
 * The longest the redeem request may take before the spin gives up waiting (`rawApiFetch` has no
 * timeout of its own, and a phone on a flaky network can hang for minutes).
 */
export const WHEEL_REDEEM_TIMEOUT_MS = 10000;
/**
 * The longest the modal stays locked once the wheel starts turning (the spin itself takes about
 * 4 to 6 s: 1.6 s up, up to a turn at full speed to line up, 2.4 s down; all of it time based in
 * `Wheel.tsx`). The budget starts at `wheelRef.current.spin()`, not at the SPIN tap, so a slow
 * redeem (bounded on its own by `WHEEL_REDEEM_TIMEOUT_MS`) cannot eat into it. Past it the lock
 * lifts, so a wheel that never reports where it stopped cannot trap the player in the modal.
 */
export const MAX_SPIN_LOCK_MS = 12000;

/** The rejection `withTimeout` uses (a marker, since `instanceof` on Error subclasses is unreliable once transpiled). */
const REDEEM_TIMEOUT = { reason: "redeem-timeout" } as const;

/** Rejects with `REDEEM_TIMEOUT` when `promise` has not settled after `ms`. */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(REDEEM_TIMEOUT), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });

/** One row of the published odds (`GET /user/catbassadors/lives/odds`, backend src/user/wheel.ts). */
export interface WheelOddsRow {
  tails: number;
  chancePercent: number;
}

/**
 * The wheel's published odds (plan G5 "publish odds"): the same table the backend draws from.
 * Null when the route is unreachable; the modal then shows no odds rather than made-up ones.
 */
export async function fetchWheelOdds(signal?: AbortSignal): Promise<WheelOddsRow[] | null> {
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}/user/catbassadors/lives/odds`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const rows: WheelOddsRow[] = Array.isArray(body?.slices)
      ? body.slices
          .map((r: { tails?: unknown; chancePercent?: unknown }) => ({
            tails: Number(r?.tails),
            chancePercent: Number(r?.chancePercent),
          }))
          .filter((r: WheelOddsRow) => Number.isFinite(r.tails) && Number.isFinite(r.chancePercent))
      : [];
    return rows.length ? rows.sort((a, b) => b.tails - a.tails) : null;
  } catch {
    return null;
  }
}

/** "1%" or "24%"; at most two decimals, no trailing zeros. */
export const oddsPercent = (value: number) => `${Number(value.toFixed(2))}%`;

/** The published odds, folded under the wheel. */
export const WheelOdds = ({ rows }: { rows: WheelOddsRow[] }) => (
  <details data-testid="wheel-odds" className="mx-4 mb-4 rounded-md border-2 border-tt-gold-500/60 bg-tt-night-900/85 px-3 py-2 text-tt-cream md:mx-6">
    <summary className="min-h-[44px] cursor-pointer py-2 font-primary text-p5 uppercase tracking-wide">
      Odds of each prize
    </summary>
    <ul className="grid grid-cols-2 gap-x-6 gap-y-1 pb-2 font-secondary text-p5 sm:grid-cols-4">
      {rows.map((row) => (
        <li key={row.tails} className="flex justify-between gap-2">
          <span>{formatTails(row.tails)}</span>
          <span className="text-tt-gold-400">{oddsPercent(row.chancePercent)}</span>
        </li>
      ))}
    </ul>
    <p className="pb-1 font-secondary text-p6 text-tt-muted">One spin a day. {TAILS_NO_CASH_VALUE}</p>
  </details>
);

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

  // A spin cannot be interrupted (plan G14 "Close and modal", F3.3 `canClose`): from the tap
  // until the reveal has played, the X is aria-disabled and Esc and the scrim do nothing.
  const [isRevealing, setIsRevealing] = useState(false);
  // The claim is spent (or may be: a redeem still in flight past its timeout). From then on SPIN
  // never comes back, whatever the lock does, so a second tap cannot send a second redeem.
  const [claimSpent, setClaimSpent] = useState(false);
  const canClose = !isSpinning && !isRevealing;
  const { runWithAccount } = useAccountAction();
  const latest = useLatest({ profile, setProfileUpdate });
  const wheelRef = useRef<WheelRef>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const buttonAudioRefs = useRef<
    Record<"click" | "hover", HTMLAudioElement | null>
  >({
    click: null,
    hover: null,
  });
  const [isButtonHovering, setIsButtonHovering] = useState(false);
  const [showMascotVideo, setShowMascotVideo] = useState(true);
  const toast = useToast();
  const { data: odds } = useQuery({
    queryKey: ["wheel-odds"],
    queryFn: ({ signal }) => fetchWheelOdds(signal),
    staleTime: 3_600_000,
    retry: false,
  });

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
        // `duration` is NaN until the metadata loaded; assigning NaN throws.
        if (Number.isFinite(videoRef.current.duration)) {
          videoRef.current.currentTime = videoRef.current.duration;
        }
      }
    }
  }, [isSpinning, hasSpin]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isMobile()) return;

    const testVideo = document.createElement("video");
    const webmSupport = testVideo.canPlayType('video/webm; codecs="vp9,opus"');
    // Mobile Safari does not support transparent WebM and shows black background.
    // Codec support must be read after mount to keep SSR output hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowMascotVideo(Boolean(webmSupport));
  }, []);

  const revealTimers = useRef<number[]>([]);
  const spinWatchdog = useRef<number | undefined>(undefined);
  /** The watchdog gave up on this spin: a late `onFinished` shows the result without re-locking. */
  const spinAbandoned = useRef(false);
  const clearSpinWatchdog = () => {
    window.clearTimeout(spinWatchdog.current);
    spinWatchdog.current = undefined;
  };
  useEffect(
    () => () => {
      revealTimers.current.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(spinWatchdog.current);
    },
    []
  );

  /** Lifts the lock from the SPIN tap; the modal can be closed again. */
  const unlockSpin = () => {
    clearSpinWatchdog();
    setIsSpinning(false);
    setIsRevealing(false);
  };

  const startSpinWatchdog = () => {
    clearSpinWatchdog();
    spinAbandoned.current = false;
    spinWatchdog.current = window.setTimeout(() => {
      spinWatchdog.current = undefined;
      spinAbandoned.current = true;
      setIsSpinning(false);
      setIsRevealing(false);
      toast({ message: "The wheel got stuck. If your spin went through, your Tails are on your profile." });
    }, MAX_SPIN_LOCK_MS);
  };

  const handleFinished = (segment: Values) => {
    clearSpinWatchdog();
    setHasSpin(true);
    setClaimSpent(true);
    setIsSpinning(false);
    setWonSegment(segment);
    if (spinAbandoned.current) {
      // The lock already lifted (and the player may be closing): show the prize, do not re-lock.
      setShowWinningNumber(true);
      onFinished?.(segment);
      return;
    }
    setIsRevealing(true);
    revealTimers.current.push(
      window.setTimeout(() => {
        setShowWinningNumber(true);
      }, WHEEL_REVEAL_DELAY_MS),
      window.setTimeout(() => {
        setIsRevealing(false);
      }, WHEEL_REVEAL_DELAY_MS + WHEEL_REVEAL_HOLD_MS)
    );
    onFinished?.(segment);
  };

  const handleClose = () => {
    if (!canClose) return;
    setHasSpin(false);
    setIsSpinning(false);
    setShowWinningNumber(false);
    setWonSegment(undefined);
    setTargetSegment(undefined);
    close();
  };

  // The Daily Spin is a claim: a guest gets the AuthSheet first, and the spin goes on once they
  // signed in (decision #9). `spin` reads the profile through a ref, since it may run after the
  // sheet replaced the guest profile with the account's.
  const handleSpin = () => {
    if (isSpinning || hasSpin || claimSpent) return;
    void runWithAccount("claim-rewards", spin);
  };

  const spin = async () => {
    const { profile } = latest.current;
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

    // The redeem request itself keeps running past the timeout: when it lands late the claim was
    // spent server side, so the profile still takes the Tails (without a spin to watch).
    const redeemRequest = USER_API.redeem();
    try {
      setIsSpinning(true);

      // Fetch tails from redeem API
      const { tails } = await withTimeout(redeemRequest, WHEEL_REDEEM_TIMEOUT_MS);

      if (!tails) {
        toast({ message: "Failed to redeem reward. Please try again." });
        unlockSpin();
        return;
      }

      setClaimSpent(true);
      // Map tails to closest segment value
      const segmentValue = mapTailsToSegment(tails);
      setTargetSegment(segmentValue);

      // Update profile with redeemed tails, from the profile as it is now: anything that changed
      // it while the redeem was in flight is kept.
      const { profile: current, setProfileUpdate } = latest.current;
      setProfileUpdate({
        canRedeemLives: false,
        streak: (current?.streak || 0) + 1,
        tails: (current?.tails || 0) + tails,
        monthStreak: (current?.monthStreak || 0) + 1,
      });

      // Start spinning after a short delay to allow state updates
      revealTimers.current.push(
        window.setTimeout(() => {
          if (!wheelRef.current) {
            // The wheel is gone (unmounted mid-request): nothing will report where it stopped.
            unlockSpin();
            return;
          }
          startSpinWatchdog();
          wheelRef.current.spin();
        }, 100)
      );
    } catch (error) {
      if (error === REDEEM_TIMEOUT) {
        toast({ message: "The network is slow. If your spin went through, your Tails will show up on your profile." });
        // The modal can close, but SPIN stays away until the request settles: a second tap would
        // race a second redeem against the first.
        setClaimSpent(true);
        unlockSpin();
        redeemRequest.then(
          ({ tails }) => {
            if (!tails) {
              setClaimSpent(false);
              return;
            }
            const { profile: current, setProfileUpdate: update } = latest.current;
            setHasSpin(true);
            update({
              canRedeemLives: false,
              streak: (current?.streak || 0) + 1,
              tails: (current?.tails || 0) + tails,
              monthStreak: (current?.monthStreak || 0) + 1,
            });
            toast({ message: `Your spin landed: +${formatTails(tails)}` });
          },
          // The claim was not spent after all: the player may try again.
          () => setClaimSpent(false)
        );
        return;
      }
      console.error("Failed to redeem reward:", error);
      toast({ message: "Failed to redeem reward. Please try again." });
      unlockSpin();
    }
  };

  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title="TAILS WHEEL"
      name="wheel"
      surface="art"
      size="lg"
      canClose={canClose}
      className="!w-fit !max-w-[95vw] md:!max-w-[90vw] lg:!max-w-[1100px]"
    >
      <div
        data-testid="wheel-panel"
        data-spinning={isSpinning || undefined}
        className="isolate font-secondary flex flex-col overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border-4 border-tt-gold-500 bg-tt-night-800 shadow-[0_6px_0_rgb(var(--tt-night-950)),0_0_28px_rgb(var(--tt-gold-400)/0.14)]"
        style={{
          maxHeight: ART_PANEL_MAX_HEIGHT,
          backgroundImage: `linear-gradient(rgb(var(--tt-night-900) / 0.55), rgb(var(--tt-night-900) / 0.35)), url(${cdnFile("roulette/roulette-bg.webp")})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="p-4 md:p-6 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center justify-center gap-1">
              <p
                aria-hidden="true"
                className="md:text-h3 text-h5 font-primary text-tt-gold-400 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))]"
              >
                TAILS WHEEL
              </p>
              <p className="md:text-p4 text-p5 font-primary text-center text-tt-cream font-medium">
                One free spin a day for rescue points
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
              alt=""
              aria-hidden="true"
            />
          )}

          <div className="absolute left-1/2 -translate-x-1/2 top-0 md:top-3 w-[65%] md:w-[60%] -z-50">
            <img
              className="top-10 w-full h-full"
              src={cdnFile("roulette/ears.webp")}
              draggable="false"
              alt=""
              aria-hidden="true"
            />
            <img
              className={`absolute w-full -left-px md:top-1 md:right-px z-1 top-0 ${
                isSpinning ? "animate-blink" : ""
              }`}
              src={cdnFile("roulette/paws.webp")}
              draggable="false"
              alt=""
              aria-hidden="true"
            />
          </div>

          {!isSpinning && !hasSpin && !claimSpent && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40">
              <button
                type="button"
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
                  alt=""
                  aria-hidden="true"
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
                  <p className="text-tt-gold-ink font-primary font-normal uppercase text-p4 md:text-p3 whitespace-nowrap">
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
                    alt=""
              aria-hidden="true"
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
        {odds && <WheelOdds rows={odds} />}
        <p className="sr-only" aria-live="polite">
          {isSpinning ? "Spinning…" : showWinningNumber && wonSegment ? `You won ${formatTails(wonSegment)}` : ""}
        </p>
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
    </GameModal>
  );
};
