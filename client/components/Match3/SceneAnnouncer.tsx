import { useEffect, useState } from "react";
import { TT_ANNOUNCE, type AnnouncePoliteness, type TTAnnounceDetail } from "./sceneSignals";

/**
 * How long a region stays empty before the new text goes in. Screen readers announce a change of
 * content, so clearing first and writing on a later tick makes a repeated message (a second
 * "Follow the glow") speak again.
 */
export const ANNOUNCE_REFILL_MS = 60;

type Regions = Record<AnnouncePoliteness, string>;

/**
 * The scene's screen reader lines (plan G12): `tt:announce` events for `game` go into one of two
 * live regions, a polite `role="status"` and an assertive `role="alert"`. Two fixed regions,
 * because screen readers often ignore an `aria-live` value that changes on one element (5c review).
 */
export function useSceneAnnouncements(game: string): Regions {
  const [regions, setRegions] = useState<Regions>({ polite: "", assertive: "" });
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<TTAnnounceDetail>).detail;
      if (!detail || detail.game !== game || !detail.message) return;
      const politeness: AnnouncePoliteness = detail.politeness === "assertive" ? "assertive" : "polite";
      setRegions((current) => ({ ...current, [politeness]: "" }));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setRegions((current) => ({ ...current, [politeness]: detail.message }));
      }, ANNOUNCE_REFILL_MS);
      timers.add(timer);
    };
    window.addEventListener(TT_ANNOUNCE, onAnnounce);
    return () => {
      window.removeEventListener(TT_ANNOUNCE, onAnnounce);
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [game]);
  return regions;
}

/** The two visually hidden live regions for one game. */
export function SceneAnnouncer({ game, testId }: { game: string; testId: string }) {
  const regions = useSceneAnnouncements(game);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid={testId}>
        {regions.polite}
      </div>
      <div
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid={`${testId}-assertive`}
      >
        {regions.assertive}
      </div>
    </>
  );
}
