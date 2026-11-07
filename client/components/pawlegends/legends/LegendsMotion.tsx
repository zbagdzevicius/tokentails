import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useEffect, type RefObject } from "react";
import { revealLanding } from "../landing/reveal";
import { startLegendsMotion } from "./motion";

/**
 * The `/legends` motion chunk: GSAP, its plugins and the engine (`motion.js`) in one async chunk, loaded the same way
 * as the `/pawlegends` landing's (`../landing/LandingMotion.tsx`): listed in the page HTML by `next/dynamic`, so the
 * browser fetches it next to the framework. Renders nothing; starts the motion on the landing root and stops it on
 * unmount.
 */
export default function LegendsMotion({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // A task of its own, so hydration and the motion's setup (SplitText, ScrollTrigger, the lane layout) are not one long task.
    let stop: (() => void) | undefined;
    const id = setTimeout(() => {
      try {
        stop = startLegendsMotion(el, {
          gsap,
          ScrollTrigger,
          SplitText,
          CustomEase,
          DrawSVGPlugin,
          Physics2DPlugin,
          Flip,
          MotionPathPlugin,
          ScrambleTextPlugin,
        });
      } catch (err) {
        // A broken engine must not leave the intro curtain up until the 5 s CSS fallback: show the page.
        console.error("Pawlegends /legends motion failed", err);
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
