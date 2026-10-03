import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `everyMs` (default one minute). Null during server rendering
 * and the hydrating render, so built HTML never carries a time that is wrong on arrival.
 */
export function useClock(everyMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The first reading happens after mount on purpose (hydration-safe, see above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}
