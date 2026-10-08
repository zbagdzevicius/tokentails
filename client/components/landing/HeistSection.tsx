import { railCopyState, railIsDeployed, type RailCopyState, type RailState } from "@/api/impact-api";
import { isAppBuild } from "@/components/claims/build";
import { useReducedMotion } from "@/components/globe/useReducedMotion";
import { PixelButton } from "@/components/shared/PixelButton";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The Catnip Heist section (founder request, Oct 2026): the 30 s showreel, three beats and the
 * PLAY CATNIP HEIST call to action, between the proof section and the globe.
 *
 * Media are served from the app origin (`client/public/landing/`, versioned names), so they work
 * before the CDN sync copies them under `w/landing/`. Playback: no source is attached until the
 * section first comes near the viewport, the reel plays only while in view, pauses when it scrolls
 * away, has a pause toggle, and never starts by itself under `prefers-reduced-motion: reduce` (the
 * poster stands in and a play button arms it on request). App builds show the poster only: the
 * reel's end card names the payout layer, which app copy never does (R10), and the files are
 * pruned from the app export (`scripts/prune-app-export.mjs`).
 *
 * The reel is a video, so copy-lint and `facts gate` cannot read it. Its claims are listed here and
 * gate it in code instead (`heistReelAllowed`):
 *
 * claim: F-001 "540K+ registered players" (baked in; maxAgeDays 365, re-cut when stale)
 * claim: F-011 "180K on X" (baked in; maxAgeDays 90, re-cut when stale)
 * claim: F-023 the Paris cat café card (Chat-Rivari footage, 2026-04-17; company-reported,
 *   founder-confirmed 2026-10-04). The footage only: the partner names stay off (decision #74).
 * claim: L-rail "Tap the rescue treat. Token Tails sends Pink Paw a small treat." (present tense)
 * claim: L-rail "Every payout public, on-chain" (end card)
 *
 * The poster (`heist-reel-poster-v1.jpg`) carries no claim ("Swap · Free the shelter cat").
 *
 * The third beat follows the treat rail state from the impact snapshot (L-rail): it says Token
 * Tails sends Pink Paw a treat only while the rail is live.
 */

/**
 * Versioned file names: a new cut gets `-v2`, old files are never deleted (installed apps).
 * `cleared` is false while the cut shows a claim no landing surface may carry. v1 shows the
 * Chat-Rivari café (F-023): cleared since the founder confirmed the event on 2026-10-04 (F-023 is
 * company-reported with the landing surface). If F-023 loses that surface, set this back to false.
 */
export const HEIST_REEL = Object.freeze({
  webm: "/landing/heist-reel-v1.webm",
  mp4: "/landing/heist-reel-v1.mp4",
  poster: "/landing/heist-reel-poster-v1.jpg",
  cleared: true,
});

/**
 * The reel says, in the present tense, that Token Tails sends Pink Paw a treat and that every
 * payout is public. It may play only when the cut is cleared and the rail is live (a treat goes out
 * now, or today's budget is spent and comes back at 00:00 UTC). Not deployed, paused or unknown:
 * the poster only, so the video never contradicts the third beat beside it.
 */
export function heistReelAllowed(
  state: RailState | null | undefined,
  cleared: boolean = HEIST_REEL.cleared
): boolean {
  if (!cleared) return false;
  const copyState = railCopyState(state);
  return copyState === "open" || copyState === "exhausted";
}

/** `from=landing_heist` feeds `heist_open {from}` on the host page (stripped on arrival). */
export const HEIST_SECTION_HREF = "/heist?from=landing_heist";

/**
 * The levels in catnip-heist/src/levels (heist-01 to heist-08). A test counts the level files, so
 * this copy cannot drift from the game.
 */
export const HEIST_LEVEL_COUNT = 8;

/**
 * The note under the CTA: /heist plays straight away, sign-in is only offered after a run. It is
 * about the game; treats need no sign-up either (Oct 8, 2026).
 */
export const HEIST_NO_SIGNUP_NOTE = "Free in your browser · no sign-up needed";
/** App builds run the game in the app, not a browser. */
export const HEIST_NO_SIGNUP_NOTE_APP = "Free to play · no sign-up needed";

/**
 * On by default: the founder overrode decision #15 (the Poki carve-out) for this landing section on
 * 2026-10-04. The hero pill and the picker card stay off under #15. `NEXT_PUBLIC_HEIST_LANDING_SECTION`
 * set to `0`, `false` or `off` hides it again (the kill switch); unset or anything else shows it.
 */
export function heistSectionEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_HEIST_LANDING_SECTION
): boolean {
  const value = (raw || "").trim().toLowerCase();
  return !(value === "0" || value === "false" || value === "off");
}

/** The third beat per rail state. `web` may say on-chain (app builds never do, R10). */
export function heistTreatBeat(state: RailState | null | undefined, isApp: boolean): string {
  const copy: Record<RailCopyState, string> = {
    // claim: L-rail (only while the rail is live). Anyone can send one, no sign-in (POST
    // /shelter/donate/guest, Oct 8, 2026); the wallet is held by Token Tails until handover (donations-STATUS).
    open: isApp
      ? "Free the shelter cat. Tap, no sign-in needed, and Token Tails sends Pink Paw a small treat, held by Token Tails until handover."
      : "Free the shelter cat. Tap, no sign-in needed, and Token Tails sends Pink Paw a small treat, on-chain (wallet held by Token Tails until handover).",
    // claim: L-rail
    exhausted: "Free the shelter cat. Today's treats for Pink Paw are used up; back at 00:00 UTC.",
    // claim: L-rail
    paused: "Free the shelter cat. Treats for Pink Paw are paused for now.",
    // claim: L-rail (not deployed yet: future tense)
    soon: "Free the shelter cat. Real treats for Pink Paw, from Token Tails, open soon.",
  };
  return copy[railCopyState(state)];
}

const BEAT_CLASS =
  "flex gap-3 md:gap-4 rounded-2xl border-2 border-tt-cream/25 bg-tt-night-900/60 p-3 md:p-4 backdrop-blur-sm";

const BEAT_NUMBER_CLASS =
  "flex h-9 w-9 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-xl border-2 font-primary text-p4 md:text-p3 leading-none";

/**
 * Plays the reel only while the section is in view and motion is allowed; the sources are attached
 * the first time it comes near the viewport, so nothing downloads before.
 */
function useReelPlayback(enabled: boolean) {
  const sectionRef = useRef<HTMLElement | null>(null);
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

export interface HeistSectionProps {
  /** The rail state from the impact snapshot; unknown reads as "opens soon". */
  railState?: RailState | null;
  /** Tests only; defaults to `heistSectionEnabled()`. */
  enabled?: boolean;
  /** Tests only; defaults to `HEIST_REEL.cleared`. */
  reelCleared?: boolean;
}

export const HeistSection = ({
  railState = null,
  enabled = heistSectionEnabled(),
  reelCleared = HEIST_REEL.cleared,
}: HeistSectionProps) => {
  const isApp = isAppBuild();
  const withVideo = enabled && !isApp && heistReelAllowed(railState, reelCleared);
  const { sectionRef, videoRef, armed, userPaused, togglePause } = useReelPlayback(withVideo);
  if (!enabled) return null;
  const showPayoutsLink = !isApp && railIsDeployed(railState);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-tt-night-900"
      data-testid="heist-section"
      aria-labelledby="heist-section-title"
    >
      {/* Ambient light from the reel itself, then the night fades both ways (seamless edges). */}
      <img
        src={HEIST_REEL.poster}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_45%,rgb(var(--tt-mint)/.16),transparent_55%),radial-gradient(ellipse_at_80%_60%,rgb(var(--tt-pink)/.14),transparent_55%)]" />
      <div className="absolute inset-x-0 top-0 h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 md:h-48 bg-gradient-to-b from-transparent to-tt-night-900 pointer-events-none" />

      <div className="relative z-30 mx-auto max-w-[1400px] px-4 md:px-8 lg:px-16 py-16 md:py-24 lg:py-28">
        {/* Phones: heading, reel, beats and CTA. From lg the reel spans the left column. */}
        <div className="grid grid-cols-1 items-center gap-8 md:gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-x-14 lg:gap-y-6">
          <div className="flex flex-col items-center text-center lg:col-start-2 lg:row-start-1 lg:items-start lg:self-end lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-tt-mint/70 bg-tt-mint/15 px-3 py-1 font-primary text-p6 md:text-p5 uppercase tracking-widest text-tt-mint">
              <span aria-hidden className="h-2 w-2 rounded-full bg-tt-mint motion-safe:animate-pulse" />
              New game mode
            </span>
            <h2
              id="heist-section-title"
              className="mt-3 font-primary uppercase leading-[0.9] text-[3.25rem] sm:text-[4rem] md:text-[5rem] xl:text-[6.25rem] drop-shadow-lg"
            >
              <span className="text-tt-mint [text-shadow:0_0_8px_rgb(var(--tt-mint)/.7),0_0_24px_rgb(var(--tt-mint)/.45)]">
                Catnip
              </span>{" "}
              <span className="glow text-tt-cream">Heist</span>
            </h2>
            {/* claim:fiction the in-game story: Kibble Corp, its guard dogs and the crate are the level */}
            <p className="mt-3 max-w-md text-p5 md:text-p4 text-tt-cream/90">
              Two cats, one vault. Slip past Kibble Corp&apos;s guard dogs, grab the catnip and free
              the shelter cat.
            </p>
          </div>

          {/* The reel (it opens on its own security-cam overlay). */}
          <div className="relative w-full lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <div className="relative overflow-hidden rounded-2xl border-4 border-tt-gold-400/80 bg-tt-night-950 aspect-video shadow-[0_0_24px_rgb(var(--tt-gold-400)/.35),0_0_80px_rgb(var(--tt-mint)/.18)]">
              {withVideo ? (
                <video
                  ref={videoRef}
                  poster={HEIST_REEL.poster}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-label="Catnip Heist showreel: two cats sneak past guard dogs, swap, collect catnip and free the shelter cat across eight heists"
                  className="h-full w-full object-cover"
                  data-testid="heist-reel"
                  data-armed={armed ? "1" : "0"}
                >
                  {armed && <source src={HEIST_REEL.webm} type="video/webm" />}
                  {armed && <source src={HEIST_REEL.mp4} type="video/mp4" />}
                </video>
              ) : (
                <img
                  src={HEIST_REEL.poster}
                  alt="Catnip Heist: a cat swaps in to free the shelter cat"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  data-testid="heist-reel-poster"
                />
              )}
              {withVideo && (
                <button
                  type="button"
                  onClick={togglePause}
                  aria-pressed={userPaused}
                  aria-label={userPaused ? "Play the showreel" : "Pause the showreel"}
                  data-testid="heist-reel-toggle"
                  className="absolute bottom-3 right-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-tt-cream/60 bg-tt-night-950/70 text-tt-cream backdrop-blur-sm transition hover:bg-tt-night-950/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
                >
                  {userPaused ? (
                    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M4 2.5v11l9-5.5z" /></svg>
                  ) : (
                    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" /></svg>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center lg:col-start-2 lg:row-start-2 lg:items-start lg:self-start">
            <ol className="flex w-full max-w-md flex-col gap-3 text-left" data-testid="heist-beats">
              <li className={BEAT_CLASS}>
                <span aria-hidden className={`${BEAT_NUMBER_CLASS} border-tt-mint/70 text-tt-mint`}>1</span>
                <div>
                  <p className="font-primary uppercase text-p4 md:text-p3 leading-tight text-tt-cream">
                    Sneak &amp; swap
                  </p>
                  <p className="mt-1 text-p6 md:text-p5 text-tt-cream/80">
                    Stay out of sight, meow to lure a guard, and swap cats to hold the door.
                  </p>
                </div>
              </li>
              <li className={BEAT_CLASS}>
                <span aria-hidden className={`${BEAT_NUMBER_CLASS} border-tt-gold-400/70 text-tt-gold-400`}>2</span>
                <div>
                  <p className="font-primary uppercase text-p4 md:text-p3 leading-tight text-tt-cream">
                    {HEIST_LEVEL_COUNT} heists
                  </p>
                  <p className="mt-1 text-p6 md:text-p5 text-tt-cream/80">
                    From the Kibble Corp warehouse to its HQ, each one a new trick to crack.
                  </p>
                </div>
              </li>
              <li className={BEAT_CLASS} data-testid="heist-treat-beat">
                <span aria-hidden className={`${BEAT_NUMBER_CLASS} border-tt-pink/70 text-tt-pink`}>3</span>
                <div>
                  <p className="font-primary uppercase text-p4 md:text-p3 leading-tight text-tt-cream">
                    A real shelter
                  </p>
                  <p className="mt-1 text-p6 md:text-p5 text-tt-cream/80">
                    {heistTreatBeat(railState, isApp)}
                    {showPayoutsLink && (
                      <>
                        {" "}
                        <Link
                          href="/shelter-payouts"
                          className="whitespace-nowrap text-tt-gold-400 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
                          data-testid="heist-payouts-link"
                        >
                          See every payout ›
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            </ol>

            <div className="mt-8 flex w-full max-w-md flex-col items-center gap-4 md:gap-6">
              {/* Plain anchor on purpose: /heist hosts a static build and loads fully. */}
              <a
                href={HEIST_SECTION_HREF}
                aria-label="PLAY CATNIP HEIST"
                data-testid="heist-section-cta"
                className="rounded-xl py-2 md:py-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400"
              >
                {/* Between the md and lg PixelButton scales: lg (2x) overflows this column. */}
                <span className="glow-box block scale-125 md:scale-150">
                  <PixelButton as="span" text="PLAY" subtext="CATNIP HEIST" />
                </span>
              </a>
              <p className="font-primary text-p6 md:text-p5 uppercase tracking-widest text-tt-cream/75" data-testid="heist-no-signup">
                {isApp ? HEIST_NO_SIGNUP_NOTE_APP : HEIST_NO_SIGNUP_NOTE}
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default HeistSection;
