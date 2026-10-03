import {
  impactAsOf,
  railCopyState,
  railIsDeployed,
  type PublicImpact,
  type RailState,
} from "@/api/impact-api";
import { Claim } from "@/components/claims/Claim";
import { isAppBuild } from "@/components/claims/build";
import { publicFact } from "@/components/claims/facts";
import { RAIL_CHIP_COPY } from "@/components/claims/rail-copy";
import { cdnFile } from "@/constants/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Homepage proof section: the Paris cat café day and the creator-reel marquee,
 * with every number cited to the facts registry (plan G11). Media are the
 * original deck files served by the pitch site; only the background image goes
 * through `cdnFile`.
 *
 * Claims: the event chip is gone until F-023 is sourced (decision #74); the
 * "Real · Shelter outcomes" chip became a published-outcomes count that stays
 * hidden while it is zero; the SEI chip shows the SEI-era figures (F-003, F-004);
 * "Now" names the current rails (F-025). The "3 taps" stat is gone (decision #75, task 7b):
 * no spec can back "from reel to on-chain in 3 taps", so P-001 is retired.
 *
 * Playback policy (lazy, motion-aware): videos carry `preload="none"` and no
 * `autoplay`. An IntersectionObserver on the section flips `inView`; videos
 * play only while in view, pause when the section scrolls away, and never play
 * under `prefers-reduced-motion: reduce`, where the posters stand in.
 */

type Reel = { src: string; poster?: string };

/** Original deck media, served by the pitch site (immutable cache, CORS *). */
export const DECK_MEDIA_BASE =
  "https://token-tails-pitch.vercel.app/deck-assets/videos";

export const PARIS_VIDEO = `${DECK_MEDIA_BASE}/paris-event.mp4`;
export const SECTION_BACKGROUND = "landing/card-bg.webp";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const OBSERVER_ROOT_MARGIN = "200px 0px";

const UGC_REELS = ["ugc-1", "ugc-2", "ugc-7"];

const CREATOR_REELS = [
  "reel-DUlqgzIgOC_",
  "reel-DUgk--7gIly",
  "reel-DUXOuxojM4N",
  "reel-DURFlMngLxt",
  "reel-DULySXpCcQn",
  "reel-DUHDB6aDt89",
  "reel-DUG5ccrDH2P",
  "reel-DT1QdklAXzw",
  "reel-DSFva36DFtZ",
  "reel-DSA6UUxjEfB",
  "reel-DQgkWBRiLVl",
  "reel-DJsMa1Lhukz",
];

export const REELS: Reel[] = [
  // The three UGC clips are WebM originals without posters, as in the deck.
  ...UGC_REELS.map((name) => ({ src: `${DECK_MEDIA_BASE}/${name}.webm` })),
  ...CREATOR_REELS.map((name) => ({
    src: `${DECK_MEDIA_BASE}/${name}.mp4`,
    poster: `${DECK_MEDIA_BASE}/${name}.jpg`,
  })),
];

/**
 * The published-outcomes count (plan G11) renders only through its registry entry, so it never
 * ships uncited. The registry (task 2c) has no `L-outcomes` yet; until it does the chip stays
 * hidden even when the snapshot has outcomes. Looked up by a variable for the same reason as above.
 */
export const OUTCOMES_ID = "L-outcomes";

/** Whether the shelter rail exists yet (any state but `not-deployed`). */
export function railDeployed(state: RailState | undefined | null): boolean {
  return railIsDeployed(state);
}

const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-xl border-2 border-tt-cream bg-tt-cream/20 px-3 py-1 font-primary text-p6 md:text-p5 text-tt-cream uppercase tracking-wide";

const HEADLINE_CLASS =
  "mt-2 text-p2 md:text-h5 lg:text-h3 xl:text-h2 font-bold uppercase drop-shadow-lg font-primary text-white leading-none";

/** Same markup as the Rescue Mission Hub badge. */
const Kicker = ({ children }: { children: React.ReactNode }) => (
  <div className={CHIP_CLASS}>
    <img
      src={cdnFile("icons/check.webp")}
      alt="mission icon"
      className="h-4 w-4 object-contain"
    />
    {children}
  </div>
);

const REACH_CARD_CLASS =
  "rounded-2xl border-4 border-tt-cream/80 bg-tt-night-900/75 p-3 md:p-4 text-tt-cream [&_.claim-figure]:text-tt-gold-400 [&_.claim-figure]:[text-shadow:0_0_5px_#ffe89a,0_0_12px_#ffcf66]";

/** Shared attributes for every video in the section; playback is driven by the controller. */
const VIDEO_PROPS = {
  muted: true,
  loop: true,
  playsInline: true,
  preload: "none",
} as const;

type VideoRef = (video: HTMLVideoElement | null) => void;

const ReelGroup = ({
  hidden = false,
  registerVideo,
}: {
  hidden?: boolean;
  registerVideo: VideoRef;
}) => (
  <div className="reel-group" aria-hidden={hidden || undefined}>
    {REELS.map((reel, index) => (
      <div key={reel.src} className="reel-item">
        <video
          ref={registerVideo}
          src={reel.src}
          poster={reel.poster}
          aria-label={`Creator reel ${index + 1} of ${REELS.length}`}
          {...VIDEO_PROPS}
        />
      </div>
    ))}
  </div>
);

/**
 * Tracks viewport intersection and the motion preference; drives every
 * registered <video> from the resulting `playing` state.
 */
function useSectionPlayback() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videos = useRef(new Set<HTMLVideoElement>());
  const [inView, setInView] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const registerVideo = useCallback<VideoRef>((video) => {
    if (video) {
      videos.current.add(video);
    }
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer support: fall back to the pre-controller behaviour.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        // Entries are ordered oldest to newest; with the site's smooth
        // scrolling several can batch, so only the latest one is current.
        const latest = entries[entries.length - 1];
        if (latest) setInView(latest.isIntersecting);
      },
      { rootMargin: OBSERVER_ROOT_MARGIN }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    // Preference must be read after mount to keep SSR output hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduceMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReduceMotion(event.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  const playing = inView && !reduceMotion;

  useEffect(() => {
    videos.current.forEach((video) => {
      if (playing) {
        const attempt = video.play();
        // Autoplay policy or a missing decoder can reject; the poster stays up.
        if (attempt && typeof attempt.catch === "function") {
          attempt.catch(() => {});
        }
      } else {
        video.pause();
      }
    });
  }, [playing]);

  return { sectionRef, registerVideo, playing };
}

export interface ProofSectionProps {
  /** The impact snapshot from the page's getStaticProps; the section works without it. */
  impact?: PublicImpact | null;
}

export const ProofSection = ({ impact = null }: ProofSectionProps) => {
  const { sectionRef, registerVideo, playing } = useSectionPlayback();
  const isApp = isAppBuild();
  const outcomes = impact?.outcomes.published ?? 0;
  const outcomesFact = publicFact(OUTCOMES_ID);
  const showOutcomes = !!impact && outcomes > 0 && !!outcomesFact;

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      data-testid="proof-section"
    >
      <img
        src={cdnFile(SECTION_BACKGROUND)}
        className="w-full h-full object-cover pixelated inset-0 absolute"
        alt=""
        data-testid="proof-background"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/55" />
      {/* Matching fades at both ends, so the hero and globe sections blend into this one. */}
      <div className="absolute inset-x-0 top-0 h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 md:h-48 bg-gradient-to-b from-transparent to-tt-night-900 pointer-events-none" />

      <div className="relative z-30 px-4 md:px-8 lg:px-16 py-10 md:py-16 lg:py-20">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-6 md:gap-8">
          {/* BLOCK 1: PARIS EVENT */}
          <div className="rounded-2xl border-4 border-tt-cream/70 bg-black/35 p-4 md:p-6 lg:p-8">
            <Kicker>Off-screen too · Paris</Kicker>
            <h2 className={HEADLINE_CLASS}>
              Cat lovers, meet{" "}
              <span className="glow text-tt-cream">real shelter cats.</span>
            </h2>

            <div className="mt-5 md:mt-7 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 md:gap-6 items-center">
              <div className="rounded-2xl border-4 border-tt-cream bg-black overflow-hidden aspect-video">
                <video
                  ref={registerVideo}
                  src={PARIS_VIDEO}
                  aria-label="A day at a Paris cat café with shelter cats"
                  className="w-full h-full object-cover"
                  data-testid="paris-video"
                  {...VIDEO_PROPS}
                />
              </div>

              <div>
                <p className="text-p5 md:text-p4 text-tt-cream/90">
                  We hosted a curated day at a Paris cat café: cozy atmosphere
                  and real shelter cats.
                </p>
                {(!isApp || showOutcomes) && (
                  <div className="mt-4" data-testid="track-record">
                    <p className="font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-muted">
                      Track record
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {showOutcomes && impact && outcomesFact && (
                        <span data-testid="outcomes-chip">
                          <Claim
                            id={outcomesFact.id}
                            values={{ n: outcomes.toLocaleString("en-US") }}
                            liveAsOf={impactAsOf(impact, "mongo")}
                            variant="chip"
                          />
                        </span>
                      )}
                      {/* App builds name no chains (R10); the SEI and Stellar chips are web only. */}
                      {isApp ? null : (
                        <>
                          <Claim id="F-003" variant="chip" />
                          <Claim id="F-004" variant="chip" />
                          {/* F-025 vouches for its own words only. The rail state is plain copy
                              beside it, future tense until the rail is deployed. */}
                          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Claim id="F-025" variant="chip" />
                            <span className="font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-cream/85">
                              <span aria-hidden>· </span>
                              <span data-testid="rail-chip">
                                {RAIL_CHIP_COPY[railCopyState(impact?.rail.state)]}
                              </span>
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BLOCK 2: CREATOR REELS */}
          <div className="rounded-2xl border-4 border-tt-cream/70 bg-black/35 p-4 md:p-6 lg:p-8">
            <Kicker>Our reach</Kicker>
            <h2 className={HEADLINE_CLASS}>
              Cat influencers + creators.{" "}
              <span className="glow text-tt-cream">
                Then the fun moves into the game.
              </span>
            </h2>
            <p className="mt-2 md:mt-3 text-p5 md:text-p4 text-tt-cream/90 max-w-3xl">
              Cat content is our reach engine. A network of cat influencers and
              a creator community bring cat lovers from around the world into
              Token Tails.
            </p>

            <div
              className="reel-marquee overflow-hidden mt-5 md:mt-7 -mx-4 md:-mx-6 lg:-mx-8"
              data-testid="reel-marquee"
            >
              <div className={`reel-track${playing ? "" : " is-paused"}`}>
                <ReelGroup registerVideo={registerVideo} />
                <ReelGroup registerVideo={registerVideo} hidden />
              </div>
            </div>

            <div
              className="mt-5 md:mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4"
              data-testid="reach-stats"
            >
              <div className={REACH_CARD_CLASS}>
                <Claim id="F-001" variant="stat" />
              </div>
              <div className={REACH_CARD_CLASS}>
                <Claim id="F-011" variant="stat" />
              </div>
              <div className={REACH_CARD_CLASS}>
                <Claim id="F-013" variant="stat" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
