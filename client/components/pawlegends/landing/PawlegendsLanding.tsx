import { useEffect, useRef } from "react";
import { LANDING_CSS } from "./landingCss";
import { landingMarkup } from "./markup";

/** Built once: React compares this string on every render, so it never rewrites the animated DOM. */
const MARKUP = { __html: landingMarkup() };
const CSS = { __html: LANDING_CSS };

/**
 * The Pawlegends landing (port of the vs-screen landing). The server renders the markup and its scoped stylesheet;
 * the motion chunk (GSAP + the original engine, `motion.js`) loads only on this page and stops on unmount. Until it
 * runs the hero is hidden by `.js-intro` (motion that is allowed only; CSS shows it after 5 s regardless), so the
 * intro never flashes its finished layout.
 */
export function PawlegendsLanding() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    Promise.all([
      import("./motion"),
      import("gsap"),
      import("gsap/ScrollTrigger"),
      import("gsap/SplitText"),
      import("gsap/CustomEase"),
      import("gsap/DrawSVGPlugin"),
      import("gsap/MorphSVGPlugin"),
      import("gsap/MotionPathPlugin"),
    ])
      .then(([m, g, st, split, ease, draw, morph, path]) => {
        const el = ref.current;
        if (!live || !el) return;
        stop = m.startLandingMotion(el, {
          gsap: g.gsap,
          ScrollTrigger: st.ScrollTrigger,
          SplitText: split.SplitText,
          CustomEase: ease.CustomEase,
          DrawSVGPlugin: draw.DrawSVGPlugin,
          MorphSVGPlugin: morph.MorphSVGPlugin,
          MotionPathPlugin: path.MotionPathPlugin,
        });
      })
      .catch(() => {
        // No motion: show the finished page.
        ref.current?.classList.remove("js-intro");
      });
    return () => {
      live = false;
      stop?.();
    };
  }, []);
  return (
    <>
      <style dangerouslySetInnerHTML={CSS} />
      <div ref={ref} className="pll js-intro" data-testid="pawlegends-landing" dangerouslySetInnerHTML={MARKUP} />
    </>
  );
}
