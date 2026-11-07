import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { LANDING_CSS } from "./landingCss";
import { landingMarkup } from "./markup";
import { revealLanding } from "./reveal";
import { guardMotionChunk } from "./motionChunk";
import { useLandingVariant } from "../landingVariant";

/** Built once: React compares this string on every render, so it never rewrites the animated DOM. */
const MARKUP = { __html: landingMarkup() };
const CSS = { __html: LANDING_CSS };

/** The motion chunk did not load: show the finished page now instead of after the 5 s CSS fallback. */
export function MotionFailed({ error }: { error?: Error | null }) {
  useEffect(() => {
    if (error) revealLanding();
  }, [error]);
  return null;
}

/**
 * Server rendered on purpose (it renders nothing): next/dynamic then lists the chunk's scripts in the page HTML, so
 * GSAP downloads in parallel with the framework rather than in a second round trip after hydration. The pages router
 * waits for those scripts before it hydrates, so guardMotionChunk gives up on a failed or stalled chunk (the page then
 * hydrates without motion and MotionFailed shows the hero).
 */
const LandingMotion = dynamic(() => guardMotionChunk(import("./LandingMotion")), { loading: MotionFailed });

/**
 * The Pawlegends landing (port of the vs-screen landing). The server renders the markup and its scoped stylesheet;
 * the motion chunk (GSAP + the original engine, `motion.js`) loads only on this page and stops on unmount. Until it
 * runs the hero is hidden by `.js-intro` (motion that is allowed only; CSS shows it after 5 s regardless), so the
 * intro never flashes its finished layout.
 */
export function PawlegendsLanding() {
  const ref = useRef<HTMLDivElement>(null);
  // Landing A/B arm A (`/legends` is B): reported on view and on every play click.
  useLandingVariant(ref, "A");
  return (
    <>
      <style dangerouslySetInnerHTML={CSS} />
      <div ref={ref} className="pll js-intro" data-testid="pawlegends-landing" dangerouslySetInnerHTML={MARKUP} />
      <LandingMotion rootRef={ref} />
    </>
  );
}
