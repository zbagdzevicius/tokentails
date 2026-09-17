import { cdnFile } from "@/constants/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Homepage proof section: the Paris cat café event with Bybit and the
 * creator-reel marquee. Every media path lives under `landing/proof/` and is
 * served through `cdnFile`, so the same component works locally and on the CDN.
 *
 * Playback policy (lazy, motion-aware): videos carry `preload="none"` and no
 * `autoplay`. An IntersectionObserver on the section flips `inView`; videos
 * play only while in view, pause when the section scrolls away, and never play
 * under `prefers-reduced-motion: reduce`, where the posters stand in.
 */

type Reel = { src: string; poster: string };

type Stat = { value: string; label: string };

const PROOF_DIR = "landing/proof";

export const PARIS_VIDEO = `${PROOF_DIR}/paris-event.mp4`;
export const PARIS_POSTER = `${PROOF_DIR}/paris-event.jpg`;
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

export const REELS: Reel[] = [...UGC_REELS, ...CREATOR_REELS].map((name) => ({
  src: `${PROOF_DIR}/${name}.mp4`,
  poster: `${PROOF_DIR}/${name}.jpg`,
}));

const EVENT_STATS: Stat[] = [
  { value: "Bybit", label: "Web3 partner" },
  { value: "Real", label: "Shelter outcomes" },
  { value: "On-chain", label: "Track record" },
];

const REACH_STATS: Stat[] = [
  { value: "540K+", label: "Registered players" },
  { value: "186K", label: "Followers on X" },
  { value: "40", label: "Influencer cats onboarded" },
  { value: "3 taps", label: "From reel to on-chain" },
];

const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-xl border-2 border-yellow-300 bg-yellow-300/20 px-3 py-1 font-primary text-p6 md:text-p5 text-yellow-100 uppercase tracking-wide";

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

const EventChip = ({ value, label }: Stat) => (
  <span className={CHIP_CLASS}>
    {value}
    <span aria-hidden="true">·</span>
    {label}
  </span>
);

const ReachCard = ({ value, label }: Stat) => (
  <div className="rounded-2xl border-4 border-yellow-300 bg-gradient-to-b from-yellow-200/95 to-orange-200/95 p-3 md:p-4 text-center">
    <div className="font-primary text-p2 md:text-h5 text-yellow-900 uppercase leading-none">
      {value}
    </div>
    <div className="mt-1 text-p6 md:text-p5 text-yellow-900/90 uppercase">
      {label}
    </div>
  </div>
);

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
          src={cdnFile(reel.src)}
          poster={cdnFile(reel.poster)}
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
      { rootMargin: OBSERVER_ROOT_MARGIN },
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

export const ProofSection = () => {
  const { sectionRef, registerVideo, playing } = useSectionPlayback();

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

      <div className="relative z-30 px-4 md:px-8 lg:px-16 py-10 md:py-16 lg:py-20">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-6 md:gap-8">
          {/* BLOCK 1: PARIS EVENT */}
          <div className="rounded-2xl border-4 border-yellow-300/70 bg-black/35 p-4 md:p-6 lg:p-8">
            <Kicker>We&apos;ve already done this · Paris 2026</Kicker>
            <h2 className={HEADLINE_CLASS}>
              We&apos;ve already turned attention into on-chain action —{" "}
              <span className="glow text-yellow-300">with Bybit.</span>
            </h2>

            <div className="mt-5 md:mt-7 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 md:gap-6 items-center">
              <div className="rounded-2xl border-4 border-yellow-300 bg-black overflow-hidden aspect-video">
                <video
                  ref={registerVideo}
                  src={cdnFile(PARIS_VIDEO)}
                  poster={cdnFile(PARIS_POSTER)}
                  aria-label="Paris cat café event with Bybit and ChainforGood"
                  className="w-full h-full object-cover"
                  data-testid="paris-video"
                  {...VIDEO_PROPS}
                />
              </div>

              <div>
                <p className="text-p5 md:text-p4 text-yellow-50/90">
                  We hosted a curated day at a Paris cat café: cozy atmosphere,
                  real shelter cats, real on-the-ground engagement, backed by
                  Bybit and ChainforGood. Every visit and every share routed
                  real support to shelters.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {EVENT_STATS.map((stat) => (
                    <EventChip key={stat.label} {...stat} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* BLOCK 2: CREATOR REELS */}
          <div className="rounded-2xl border-4 border-yellow-300/70 bg-black/35 p-4 md:p-6 lg:p-8">
            <Kicker>The on-chain onramp</Kicker>
            <h2 className={HEADLINE_CLASS}>
              Cat influencers + creators.{" "}
              <span className="glow text-yellow-300">
                Then we bring the fun on-chain.
              </span>
            </h2>
            <p className="mt-2 md:mt-3 text-p5 md:text-p4 text-yellow-50/90 max-w-3xl">
              Cat content is our reach engine. A network of cat influencers and
              a creator community bring hundreds of thousands of cat lovers
              worldwide into Token Tails, and the fun goes on-chain in three
              taps.
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

            <div className="mt-5 md:mt-7 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {REACH_STATS.map((stat) => (
                <ReachCard key={stat.label} {...stat} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
