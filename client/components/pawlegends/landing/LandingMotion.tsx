import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useEffect, type RefObject } from "react";
import { startLandingMotion } from "./motion";
import { revealLanding } from "./reveal";

/**
 * The landing's motion chunk: GSAP, its plugins and the engine (`motion.js`) in one async chunk. PawlegendsLanding
 * loads it with `next/dynamic`, so the server lists its scripts in the page HTML and the browser fetches them next
 * to the framework instead of after hydration (the hero stays hidden until the intro runs, so this is the LCP path).
 * Renders nothing; starts the motion on the landing root and stops it on unmount.
 */
export default function LandingMotion({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // A task of its own, so hydration and the motion's setup (SplitText, ScrollTrigger) are not one long task.
    let stop: (() => void) | undefined;
    const id = setTimeout(() => {
      try {
        stop = startLandingMotion(el, { gsap, ScrollTrigger, SplitText, CustomEase, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin });
      } catch (err) {
        // A broken engine must not leave the hero hidden until the 5 s CSS fallback: show the finished page.
        console.error("Pawlegends landing motion failed", err);
        revealLanding(el);
      }
    }, 0);
    return () => {
      clearTimeout(id);
      stop?.();
    };
  }, [rootRef]);
  return null;
}
