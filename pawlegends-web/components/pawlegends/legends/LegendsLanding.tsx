import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { guardMotionChunk } from "../landing/motionChunk";
import { revealLanding } from "../landing/reveal";
import { useLandingVariant } from "../landingVariant";
import { LEGENDS_CSS } from "./legendsCss";
import { legendsMarkup } from "./markup";

/** Built once: React compares this string on every render, so it never rewrites the animated DOM. */
const MARKUP = { __html: legendsMarkup() };
const CSS = { __html: LEGENDS_CSS };

/** The motion chunk did not load: lift the intro curtain now instead of after the 5 s CSS fallback. */
export function LegendsMotionFailed({ error }: { error?: Error | null }) {
  useEffect(() => {
    if (error) revealLanding(document.querySelector(".lgb"));
  }, [error]);
  return null;
}

/**
 * Server rendered on purpose (it renders nothing), like the `/pawlegends` landing's motion: next/dynamic lists the
 * chunk's scripts in the page HTML, and guardMotionChunk gives up on a failed or stalled chunk so the page still
 * hydrates (LegendsMotionFailed then lifts the intro curtain).
 */
const LegendsMotion = dynamic(() => guardMotionChunk(import("./LegendsMotion")), { loading: LegendsMotionFailed });

/**
 * The `/legends` landing (landing A/B arm B): the scroll-lane-map landing. The server renders the markup and its scoped
 * stylesheet; the motion chunk (GSAP + `motion.js`) loads only on this page and stops on unmount. Until it runs, the
 * `js-intro` curtain covers the page (motion that is allowed only; CSS lifts it after 5 s regardless), so the fog
 * intro never flashes the finished layout first.
 */
export function LegendsLanding() {
  const ref = useRef<HTMLDivElement>(null);
  useLandingVariant(ref, "B");
  return (
    <>
      <style dangerouslySetInnerHTML={CSS} />
      <div ref={ref} className="lgb js-intro" data-testid="legends-landing" dangerouslySetInnerHTML={MARKUP} />
      <LegendsMotion rootRef={ref} />
    </>
  );
}
