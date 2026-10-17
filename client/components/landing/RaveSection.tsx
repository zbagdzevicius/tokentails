// copy-lint: web-only the section never renders in the app build (raveLandingEnabled)
import { useReelPlayback } from "@/components/landing/useReelPlayback";
import { PixelButton } from "@/components/shared/PixelButton";
import { useEffect, useRef, useState, type RefObject } from "react";
import { RaveLiveLine } from "./RaveLiveLine";
import { raveLandingEnabled } from "./RavePill";
import { raveHref, useRaveLive, type RaveCheckout } from "./raveLive";

/**
 * The Moon Rave landing section (founder, Oct 17: "update landing page of token tails to highlight
 * rave"): the first game section, above Catnip Heist and Swordcat. The 30 s promo reel (muted loop,
 * the Heist reel's playback rules via useReelPlayback: no source until the section nears the
 * viewport, plays only in view, a pause toggle, never starts by itself under
 * `prefers-reduced-motion`; the poster until then), portrait on phones and landscape from `md` up.
 * The $1 = 1 cat rule, "on Arc" with the Arc logo, the live line and JOIN THE RAVE.
 *
 * Web only (never in the app build; `scripts/prune-app-export.mjs` drops the videos). No flag.
 *
 * claim: the rave rule "every $1 paid out to Pink Paw on-chain = one dancing cat", whoever pays it
 *   (cat-rave/README.md "The $1 = 1 cat rule" and "Data source"; cats = floor of the on-chain
 *   total). Token Tails pays out the free treats, the card cats and the 50% Pink Paw share of each $5
 *   shelter cat; givers pay out their wallet gifts, sponsor matches and USDC cats.
 * claim: live rave checkout (GET /rave/status) "$1 by card or in USDC on Arc", shown only while
 *   /rave/status says that way is on and live (livemode). Card: Token Tails' keeper pays the full
 *   donation out to the split, covering the card fee when the buyer does not (CHECKOUT-SPEC.md, the
 *   payout keeper). USDC: the buyer's own disburse to the Arc split (shelter-rail
 *   donateTokenWithInjected). Both reach Pink Paw in full while the split pays Pink Paw 10000 bps
 *   (rotated 16 Oct 2026; /rave/status lists a USDC chain only when publicGivingVerified passes).
 *   Ad slots are not cat orders and are not claimed here (ad money goes to the treasury).
 *
 * The reel is a video, so copy-lint cannot read it. v2 is v1 without its closing total card
 * ("$21.93 paid out to Pink Paw so far · 21 cats dancing · 17 Oct 2026"): the live line is the only
 * total in the section. Its claims:
 * claim: the rave rule "Every $1 to Pink Paw = 1 cat on the dance floor" and the end card's "Every
 *   cat = $1 to Pink Paw · on Arc" (the same rule; "on Arc" is where the reel's checkout pays, not
 *   where every cat comes from: cats count payouts on all 7 chains)
 * claim: "Live on Arc · USDC payouts to Pink Paw, on-chain" (the Arc splits pay Pink Paw's wallet
 *   since 16 Oct 2026)
 * claim: the filmed laptop screen (about 0:19 to 0:21) shows the rave's own live total as filmed on
 *   17 Oct 2026 (about $21.5); it is a screen recording of tokentails.com/rave, labelled so.
 */

export const RAVE_SECTION_HREF = raveHref("landing_rave");
/** Every payout, with its explorer link: the proof under the number. */
export const RAVE_PROOF_HREF = "/shelter-payouts";
/**
 * The promo reel. Versioned names: a new cut gets a new version (v1 never shipped). Portrait for
 * phones (720x1280), landscape from `md` (1280x720); 28 s, H.264, faststart, no audio track. Both
 * posters are the "Live on Arc" frame, which shows no number.
 */
export const RAVE_REEL = Object.freeze({
  landscape: "/landing/rave/rave-promo-v2-16x9.mp4",
  portrait: "/landing/rave/rave-promo-v2-9x16.mp4",
  posterLandscape: "/landing/rave/rave-promo-v2-poster-16x9.jpg",
  posterPortrait: "/landing/rave/rave-promo-v2-poster-9x16.jpg",
});
/** Tailwind's `md`: landscape from here up. */
export const RAVE_LANDSCAPE_QUERY = "(min-width: 768px)";
/** The Arc wordmark from the rave's own brand kit (cat-rave/public/brand). */
export const RAVE_ARC_LOGO = "/rave/brand/arc-logo-white.svg";
export const RAVE_REEL_LABEL =
  "Moon Rave promo: cream kittens dance under a green moon while a DJ cat plays; every dollar to Pink Paw adds one";

export const RAVE_SECTION_BADGE = "New · Moon Rave";
export const RAVE_SECTION_TITLE = "Dance. Save cats.";
// claim: the rave rule (cat-rave/README.md "The $1 = 1 cat rule" and "Data source"; see above)
export const RAVE_SECTION_RULE =
  // copy-lint-ignore R2 the rave's count rule, sourced in the claim comments above; no registry id until L-rave exists
  "Every $1 Token Tails or a giver pays out to Pink Paw on-chain puts one more cat on the dance floor. Free treats, wallet gifts, sponsor matches, rave cats and Pink Paw's 50% share of each $5 shelter cat all count.";

/** The "add a cat" line for what checkout takes right now; null when it is off or unread. */
export function raveAddLine(checkout: RaveCheckout | null | undefined): string | null {
  if (!checkout) return null;
  // claim: live rave checkout (GET /rave/status) (only the ways /rave/status reports as on and live; see above)
  if (checkout.card && checkout.usdcArc) {
    return "Anyone can add a cat for $1, by card or in USDC on Arc. By card, Token Tails pays the full $1 out to Pink Paw on-chain; in USDC, the full $1 goes from your wallet straight to the Pink Paw split.";
  }
  if (checkout.card) return "Anyone can add a cat for $1 by card. Token Tails pays the full $1 out to Pink Paw on-chain.";
  if (checkout.usdcArc) {
    return "Anyone can add a cat for $1 in USDC on Arc. The full $1 goes from your wallet straight to the Pink Paw split.";
  }
  return null;
}

/**
 * Portrait or landscape, read after mount: null until then, so the server HTML carries no poster and
 * a phone never fetches the landscape one. The reel's source is attached later, when the section
 * nears the viewport, so the right file is the only one downloaded.
 */
function useLandscape(): boolean | null {
  const [landscape, setLandscape] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      // No media queries (very old browsers): the landscape reel, as before this hook existed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLandscape(true);
      return;
    }
    const mq = window.matchMedia(RAVE_LANDSCAPE_QUERY);
    setLandscape(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return landscape;
}

/** Posters wait until the section is this close, so a visitor who never scrolls there fetches none. */
const POSTER_MARGIN = "1200px 0px";

/** True once `ref` comes within POSTER_MARGIN of the viewport (true at once without an observer). */
function useNear(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || near || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: POSTER_MARGIN }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled, near]);
  return near;
}

export const RaveSection = ({ enabled }: { enabled?: boolean }) => {
  const on = enabled ?? raveLandingEnabled();
  const live = useRaveLive(on);
  const { sectionRef, videoRef, armed, playing, userPaused, togglePause } = useReelPlayback<HTMLDivElement>(on);
  const landscape = useLandscape();
  const rootRef = useRef<HTMLElement | null>(null);
  const near = useNear(rootRef, on);
  // The orientation arriving, or a rotation, after arming swaps the file: reload it and resume if playing.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !armed || landscape === null) return;
    video.load?.();
    if (playingRef.current) video.play?.()?.catch?.(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landscape]);
  if (!on) return null;
  const addLine = raveAddLine(live.checkout);
  const poster =
    landscape === null || !near ? undefined : landscape ? RAVE_REEL.posterLandscape : RAVE_REEL.posterPortrait;
  // The source waits for the orientation too, so only the right file downloads.
  const sourceReady = armed && landscape !== null;

  return (
    <section
      ref={rootRef}
      id="moon-rave"
      className="relative w-full overflow-hidden bg-black"
      data-testid="rave-section"
      aria-labelledby="rave-section-title"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgb(var(--tt-mint)/.22),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgb(var(--tt-pink)/.18),transparent_55%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-tt-night-900 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-tt-night-900 pointer-events-none" />
      <div className="relative z-30 mx-auto max-w-[1200px] px-4 md:px-8 lg:px-16 py-14 md:py-24">
        <div className="grid grid-cols-1 items-start gap-8 md:gap-10 md:grid-cols-[1fr_1.25fr]">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-tt-pink/80 bg-tt-pink/15 px-3 py-1 font-primary text-p6 md:text-p5 uppercase tracking-widest text-tt-pink shadow-[0_0_16px_rgb(var(--tt-pink)/.35)]">
              {RAVE_SECTION_BADGE}
            </span>
            <h2
              id="rave-section-title"
              className="mt-3 font-primary uppercase leading-[1.05] text-[2.25rem] sm:text-[3rem] md:text-[3.5rem] xl:text-[4.25rem] text-tt-mint drop-shadow-[0_0_18px_rgb(var(--tt-mint)/.6)]"
            >
              {RAVE_SECTION_TITLE}
            </h2>
            <p className="mt-4 max-w-md font-primary text-p4 md:text-p3 text-tt-cream">
              <span className="text-tt-pink">$1 = 1 cat.</span> {RAVE_SECTION_RULE}
            </p>
            {/* Always in the layout (empty while unread or off), so /rave/status answering shifts nothing. */}
            <p
              className="mt-3 min-h-[5.5rem] sm:min-h-[4.125rem] md:min-h-[5.25rem] max-w-md font-primary text-p5 md:text-p4 text-tt-cream/80"
              data-testid="rave-add-slot"
            >
              {addLine && <span data-testid="rave-add-line">{addLine}</span>}
            </p>
            <div className="mt-4 flex min-h-[3.5rem] md:min-h-[4.25rem] items-start">
            <RaveLiveLine
              live={live}
              skeletonClassName="mt-2"
              className="max-w-md rounded-xl border border-tt-mint/40 bg-black/60 px-3 py-2 font-primary text-p5 md:text-p4 text-tt-cream"
            />
            </div>
            <div className="mt-4 flex items-center gap-2 font-primary text-p6 md:text-p5 uppercase tracking-widest text-tt-cream/70">
              <span>On</span>
              <img src={RAVE_ARC_LOGO} alt="Arc" width={72} height={24} className="h-5 md:h-6 w-auto" loading="lazy" />
            </div>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row md:items-center">
              {/* Plain anchor on purpose: /rave hosts a static build and loads fully. */}
              <a
                href={RAVE_SECTION_HREF}
                aria-label="Join the Moon Rave"
                data-testid="rave-section-cta"
                className="rounded-xl py-2 md:py-3 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400"
              >
                <span className="glow-box block md:scale-110 md:origin-left">
                  <PixelButton as="span" text="JOIN" subtext="THE RAVE" />
                </span>
              </a>
              <a
                href={RAVE_PROOF_HREF}
                data-testid="rave-section-proof"
                className="inline-flex min-h-[44px] items-center rounded-full border border-tt-mint/60 px-4 py-2 font-primary text-p5 uppercase tracking-wide text-tt-mint transition hover:bg-tt-mint/10 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400 md:ml-4"
              >
                See every payout
              </a>
            </div>
          </div>
          {/* Fixed box per orientation: the poster, the video and the toggle share it, so nothing shifts. */}
          <div
            ref={sectionRef}
            className="relative order-first md:order-none mx-auto w-[min(100%,360px,calc(70svh*9/16))] md:w-full md:max-w-none overflow-hidden rounded-2xl border-4 border-tt-mint/70 bg-black aspect-[9/16] md:aspect-video shadow-[0_0_28px_rgb(var(--tt-mint)/.4),0_0_60px_rgb(var(--tt-pink)/.2)]"
          >
            <video
              ref={videoRef}
              poster={poster}
              muted
              loop
              playsInline
              preload="none"
              aria-label={RAVE_REEL_LABEL}
              width={landscape === false ? 720 : 1280}
              height={landscape === false ? 1280 : 720}
              className="h-full w-full object-cover"
              data-testid="rave-reel"
              data-armed={sourceReady ? "1" : "0"}
            >
              {/* One source for the current orientation (keyed, so a rotation swaps the file). */}
              {sourceReady && (
                <source
                  key={landscape ? "landscape" : "portrait"}
                  src={landscape ? RAVE_REEL.landscape : RAVE_REEL.portrait}
                  type="video/mp4"
                />
              )}
            </video>
            <button
              type="button"
              onClick={togglePause}
              aria-pressed={userPaused}
              aria-label={userPaused ? "Play the Moon Rave reel" : "Pause the Moon Rave reel"}
              data-testid="rave-reel-toggle"
              className="absolute bottom-3 right-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-tt-mint/70 bg-black/70 text-tt-mint backdrop-blur-sm transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
            >
              {userPaused ? (
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M4 2.5v11l9-5.5z" /></svg>
              ) : (
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RaveSection;
