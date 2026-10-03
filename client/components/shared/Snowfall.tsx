import { useMemo, useSyncExternalStore } from "react";

/**
 * Falling petals over the game menu, now a seasonal toggle that is off by default (plan G6,
 * founder decision #47). Turn it on for a season with `NEXT_PUBLIC_SNOWFALL=on` at build time, or
 * by listing the season in SNOWFALL_SEASONS. It never runs for visitors who ask for reduced motion.
 */

/** Inclusive month-day windows (`MM-DD`) when the effect is on. Empty: off all year. */
export const SNOWFALL_SEASONS: ReadonlyArray<{ from: string; to: string }> = [];

const pad = (n: number) => String(n).padStart(2, "0");

/** Whether the season toggle is on for `date` (the env flag wins, then the season windows). */
export function isSnowfallSeason(
  date: Date = new Date(),
  flag: string | undefined = process.env.NEXT_PUBLIC_SNOWFALL,
  seasons: ReadonlyArray<{ from: string; to: string }> = SNOWFALL_SEASONS,
): boolean {
  if (flag === "on") return true;
  if (flag === "off") return false;
  const today = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return seasons.some(({ from, to }) =>
    from <= to ? today >= from && today <= to : today >= from || today <= to,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

const reducedMotionSnapshot = () =>
  typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;

const Snowfall: React.FC<{ size?: "sm" | "md" }> = ({ size = "md" }) => {
  // The server snapshot reports reduced motion, so the server HTML never carries the petals and
  // hydration matches; the client then follows the live media query.
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => true);
  const inSeason = useMemo(() => isSnowfallSeason(), []);

  if (!inSeason || reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 w-screen h-screen overflow-hidden z-0 pointer-events-none"
    >
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          className={`chamomile-flower ${size === "sm" ? "small" : ""}`}
          key={i}
        />
      ))}
    </div>
  );
};

export default Snowfall;
