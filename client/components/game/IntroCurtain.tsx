import { analytics, buildEvent } from "@/analytics";
import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import { useLatest } from "@/components/onboarding/useLatest";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";

/**
 * The night intro curtain of `/game` (plan G14 "Intro", section 1.3 step 2, 2.13 row 35).
 *
 * It replaces the fixed 2 s brown pinwheel. Readiness-driven, so it covers real loading and needs
 * no "once per session" flag:
 *
 * - Lifts when `ready` (the guest session or account and its profile are ready, or the AuthSheet
 *   opened), but never before `minMs` (no flash) and always by `maxMs` (never a wall).
 * - A tap or key lifts it at once. The tap never reaches what is below: the curtain swallows the
 *   pointer and click events and stays hit-testable while it fades.
 * - `z-intro` (300): above the AuthSheet (200), below reveals (400) and toasts (500).
 * - Night 900 with a gold glow; reduced motion keeps only a short fade.
 */
export const INTRO_MIN_MS = 700;
export const INTRO_MAX_MS = 2500;
/** The fade-out. The curtain keeps catching taps until it is gone. */
export const INTRO_FADE_MS = 320;
export const INTRO_FADE_REDUCED_MS = 160;

export type IntroLiftReason = "ready" | "max" | "tap";

/** When to lift, as a pure function of the elapsed time (unit-tested). */
export function introLiftReason({
  elapsed,
  ready,
  tapped,
  minMs = INTRO_MIN_MS,
  maxMs = INTRO_MAX_MS,
}: {
  elapsed: number;
  ready: boolean;
  tapped: boolean;
  minMs?: number;
  maxMs?: number;
}): IntroLiftReason | null {
  if (tapped) return "tap";
  if (elapsed >= maxMs) return "max";
  if (ready && elapsed >= minMs) return "ready";
  return null;
}

export interface IntroLift {
  ms: number;
  reason: IntroLiftReason;
}

interface IntroCurtainProps {
  /** `authReady || sheet open` from the auth runtime. */
  ready: boolean;
  /** Called once, when the curtain starts to lift (the next screen mounts under the fade). */
  onLift?: (lift: IntroLift) => void;
  /** Called when the curtain is gone from the page. */
  onGone?: () => void;
  reducedMotion?: boolean;
  minMs?: number;
  maxMs?: number;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * When the player first saw the curtain. `/game` is pre-rendered, so on the document's first load
 * the curtain is in the static HTML and visible from the first paint, before React hydrates; the
 * bounds then count from that paint (a late hydration lifts it at once). After a client-side
 * navigation to /game the curtain appears on mount, so they count from the mount.
 */
export function curtainStartedAt(mountedAt: number, firstPaintAt: number | null, initialLoad: boolean): number {
  if (!initialLoad || firstPaintAt === null || firstPaintAt > mountedAt) return mountedAt;
  return firstPaintAt;
}

let mountedInThisDocument = false;

/** True for the first curtain of a document that was loaded at its current path. */
function isInitialLoad(): boolean {
  if (mountedInThisDocument) return false;
  mountedInThisDocument = true;
  try {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!navigation) return false;
    return new URL(navigation.name).pathname === window.location.pathname;
  } catch {
    return false;
  }
}

function firstPaint(): number | null {
  try {
    const entries = performance.getEntriesByType("paint");
    // "first-paint": the night background of the curtain is the first thing painted.
    const paint = entries.find((entry) => entry.name === "first-paint") || entries[0];
    return paint ? paint.startTime : null;
  } catch {
    return null;
  }
}

export const IntroCurtain = ({
  ready,
  onLift,
  onGone,
  reducedMotion = false,
  minMs = INTRO_MIN_MS,
  maxMs = INTRO_MAX_MS,
}: IntroCurtainProps) => {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");
  const [lifted, setLifted] = useState<IntroLift | null>(null);
  const [tick, setTick] = useState(0);
  const liftedRef = useRef(false);
  const callbacks = useLatest({ onLift, onGone });
  // Read once, on the first client render (a lazy initializer, so never during later renders).
  const [startedAt] = useState(() =>
    typeof window !== "undefined" ? curtainStartedAt(now(), firstPaint(), isInitialLoad()) : 0,
  );
  const [hydratedMs, setHydratedMs] = useState<number | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHydratedMs(Math.round(now() - startedAt)));
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);

  const lift = useCallback(
    (reason: IntroLiftReason) => {
      if (liftedRef.current) return;
      liftedRef.current = true;
      const ms = Math.round(now() - startedAt);
      try {
        analytics.track(buildEvent("intro_lifted", { ms }));
      } catch {
        // Analytics never blocks the game.
      }
      callbacks.current.onLift?.({ ms, reason });
      setLifted({ ms, reason });
      setPhase("leaving");
    },
    [callbacks, startedAt],
  );

  // Re-evaluate at the min and max bounds; `ready` changes re-render on their own.
  useEffect(() => {
    const elapsed = now() - startedAt;
    const timers = [minMs, maxMs]
      .filter((at) => at > elapsed)
      .map((at) => setTimeout(() => setTick((value) => value + 1), at - elapsed + 5));
    return () => timers.forEach(clearTimeout);
  }, [minMs, maxMs, startedAt]);

  useEffect(() => {
    if (phase !== "shown") return;
    const reason = introLiftReason({
      elapsed: now() - startedAt,
      ready,
      tapped: false,
      minMs,
      maxMs,
    });
    // Lifting reacts to `ready` and the bound timers, and also reports to the caller and
    // analytics, so it cannot be derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reason) lift(reason);
  }, [ready, tick, phase, minMs, maxMs, lift, startedAt]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => {
      setPhase("gone");
      callbacks.current.onGone?.();
    }, reducedMotion ? INTRO_FADE_REDUCED_MS : INTRO_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase, reducedMotion, callbacks]);

  // A key also skips it (Escape, Enter, Space), without reaching the page.
  useEffect(() => {
    if (phase === "gone") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      lift("tap");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, lift]);

  if (phase === "gone") return null;

  const swallow = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="intro-curtain"
      data-phase={phase}
      data-hydrated={hydratedMs !== null ? "true" : undefined}
      data-hydrated-ms={hydratedMs ?? undefined}
      data-lift-ms={lifted?.ms}
      data-lift-reason={lifted?.reason}
      onPointerDown={(event) => {
        swallow(event);
        lift("tap");
      }}
      onPointerUp={swallow}
      onClick={swallow}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={swallow}
      onContextMenu={swallow}
      className={clsx(
        "fixed inset-0 z-intro flex cursor-pointer select-none flex-col items-center justify-center bg-tt-night-900",
        "transition-opacity ease-out",
        phase === "leaving" ? "opacity-0" : "opacity-100",
      )}
      style={{
        transitionDuration: `${reducedMotion ? INTRO_FADE_REDUCED_MS : INTRO_FADE_MS}ms`,
        // The fade must never let a tap through: keep catching events until unmounted.
        pointerEvents: "auto",
        touchAction: "none",
      }}
    >
      {/* Gold glow behind the mark, the altar light of the landing. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(80vw,560px)] w-[min(80vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgb(var(--tt-gold-400) / 0.28), rgb(var(--tt-gold-400) / 0.08) 55%, transparent 72%)",
        }}
      />
      <img
        src={cdnFile("logo/logo-text.webp")}
        alt=""
        aria-hidden="true"
        draggable={false}
        width={600}
        height={337}
        className={clsx(
          "relative h-auto w-[min(62vw,280px)] [filter:drop-shadow(0_6px_0_rgb(var(--tt-night-950)))]",
          !reducedMotion && "animate-tt-intro-float motion-reduce:animate-none",
        )}
      />
      <span aria-hidden="true" className="relative mt-8 flex gap-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className={clsx(
              "block h-[10px] w-[10px] bg-tt-gold-400 shadow-[0_3px_0_rgb(var(--tt-gold-shadow))]",
              !reducedMotion && "animate-tt-intro-dot motion-reduce:animate-none",
            )}
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">Loading Token Tails. Tap to skip.</span>
      <style>{`
        .animate-tt-intro-float {
          animation: tt-intro-float 2.4s ease-in-out infinite;
        }
        .animate-tt-intro-dot {
          animation: tt-intro-dot 0.9s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-tt-intro-float,
          .animate-tt-intro-dot {
            animation: none;
          }
        }
        @keyframes tt-intro-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
        }
        @keyframes tt-intro-dot {
          0%,
          100% {
            opacity: 0.35;
            transform: translateY(0);
          }
          50% {
            opacity: 1;
            transform: translateY(-4px);
          }
        }
      `}</style>
    </div>
  );
};

export default IntroCurtain;
