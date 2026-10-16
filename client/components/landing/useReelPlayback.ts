import { useReducedMotion } from "@/components/globe/useReducedMotion";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays the reel only while the section is in view and motion is allowed; the sources are attached
 * the first time it comes near the viewport, so nothing downloads before. Shared by the landing's
 * Catnip Heist reel and the Pink Paw Knight trailer. `sectionRef` goes on the element to observe.
 */
export function useReelPlayback<T extends Element = HTMLElement>(enabled: boolean) {
  const sectionRef = useRef<T | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reducedMotion = useReducedMotion();
  const [inView, setInView] = useState(false);
  const [armed, setArmed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  // Reduced motion never starts the reel by itself; the play button opts in.
  const [optedIn, setOptedIn] = useState(false);
  const motionOk = !reducedMotion || optedIn;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !enabled) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer: behave as if in view (the old browsers that lack it also lack lazy loading).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (latest) setInView(latest.isIntersecting);
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled && inView && motionOk) setArmed(true);
  }, [enabled, inView, motionOk]);

  // Sources were just added: make the element pick them up.
  useEffect(() => {
    if (armed) videoRef.current?.load?.();
  }, [armed]);

  const playing = enabled && armed && inView && motionOk && !userPaused;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !armed) return;
    if (playing) {
      const attempt = video.play?.();
      // Autoplay policy or a missing decoder can reject; the poster stays up.
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
    } else {
      video.pause?.();
    }
  }, [playing, armed]);

  const togglePause = useCallback(() => {
    if (!motionOk) {
      setOptedIn(true);
      setUserPaused(false);
      return;
    }
    setUserPaused((p) => !p);
  }, [motionOk]);

  return { sectionRef, videoRef, armed, playing, userPaused: userPaused || !motionOk, togglePause };
}
