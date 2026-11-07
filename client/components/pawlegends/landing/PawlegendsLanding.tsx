import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { LANDING_CSS } from "./landingCss";
import { landingMarkup } from "./markup";

/** Built once: React compares this string on every render, so it never rewrites the animated DOM. */
const MARKUP = { __html: landingMarkup() };
const CSS = { __html: LANDING_CSS };

/** The motion chunk did not load: show the finished page now instead of after the 5 s CSS fallback. */
function MotionFailed({ error }: { error?: Error | null }) {
  useEffect(() => {
    if (error) document.querySelector(".pll.js-intro")?.classList.remove("js-intro");
  }, [error]);
  return null;
}

/**
 * Server rendered on purpose (it renders nothing): next/dynamic then lists the chunk's scripts in the page HTML, so
 * GSAP downloads in parallel with the framework rather than in a second round trip after hydration.
 */
const LandingMotion = dynamic(() => import("./LandingMotion"), { loading: MotionFailed });

/**
 * The Pawlegends landing (port of the vs-screen landing). The server renders the markup and its scoped stylesheet;
 * the motion chunk (GSAP + the original engine, `motion.js`) loads only on this page and stops on unmount. Until it
 * runs the hero is hidden by `.js-intro` (motion that is allowed only; CSS shows it after 5 s regardless), so the
 * intro never flashes its finished layout.
 */
export function PawlegendsLanding() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <style dangerouslySetInnerHTML={CSS} />
      <div ref={ref} className="pll js-intro" data-testid="pawlegends-landing" dangerouslySetInnerHTML={MARKUP} />
      <LandingMotion rootRef={ref} />
    </>
  );
}
