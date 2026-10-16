// copy-lint: web-only the section never renders in the app build (swordcatSectionEnabled)
import { railCopyState, type RailCopyState, type RailState } from "@/api/impact-api";
import { isAppBuild } from "@/components/claims/build";
import { useReelPlayback } from "@/components/landing/useReelPlayback";
import { PixelButton } from "@/components/shared/PixelButton";
import { swordcatEnabled } from "@/components/swordcat/flags";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";

/**
 * The Swordcat landing section (Swordcat plan TOKENTAILS-PLAN.md §12.1 item 10, §12.3 E): a compact
 * section right after the Catnip Heist section. The 30 s trailer (founder, 2026-10-16; muted loop,
 * the Heist reel's playback rules: no source until the section nears the viewport, plays only in
 * view, a pause toggle, never starts by itself under `prefers-reduced-motion`), a short line, a treat
 * beat that follows the rail state (like the Heist section, so it always renders), and one link to
 * `/swordcat`. Until the trailer plays, and whenever it may not, its poster (a trailer frame) stands in.
 *
 * On by default on the web (launch, Oct 16 2026); `NEXT_PUBLIC_SWORDCAT=0` (or false/no/off) is the kill
 * switch. Never in the app build. No release date and no number that is not read live.
 *
 * claim: L-rail "Token Tails can send Pink Paw a free treat" (only while the rail is live)
 * claim: the kittens carry the names and photos of real cats at Pink Paw (licence for the named cats'
 *   names and photos, Oct 11; the gallery is the only source)
 *
 * The trailer is a video, so copy-lint cannot read it. Its claims (gated by `swordcatTrailerAllowed`):
 * claim: L-rail "One tap. Free for you." / "Send Pink Paw a free treat daily." (one free treat per
 *   player per day, sponsored by Token Tails, up to 100 a day per chain; present tense)
 * claim: L-rail "0.01 USDC on Arc." and "ShelterSplit sets 100% aside for Pink Paw." (Arc split)
 * claim: "54 real treats on Arc so far." (baked in, read from Arc mainnet 16 Oct 2026; "so far" dates it)
 * claim: Judas, a real Pink Paw cat (live gallery, 16 Oct 2026); the in-game tap is staged, the receipt
 *   is a real Catnip Heist treat of 8 Oct 2026, labelled as such
 * The poster carries no claim (Clem with her sword).
 */

/** `from=landing_swordcat` says where the player came from (stripped on arrival at /swordcat). */
export const SWORDCAT_SECTION_HREF = "/swordcat?from=landing_swordcat";
/**
 * The trailer, cut from the game's own footage. Versioned names: a new cut gets `-v2`, old files are
 * never deleted (installed apps). Web only: the section never renders in the app build and
 * `scripts/prune-app-export.mjs` drops the videos from the app export.
 */
export const SWORDCAT_TRAILER = Object.freeze({
  webm: "/landing/pinkpaw-knight-trailer-v1.webm",
  mp4: "/landing/pinkpaw-knight-trailer-v1.mp4",
  poster: "/landing/pinkpaw-knight-trailer-poster-v1.jpg",
});
/** The still shown until the trailer plays (and instead of it while it may not): a trailer frame, 1280x720. */
export const SWORDCAT_SECTION_STILL = SWORDCAT_TRAILER.poster;
/** The video's accessible name. */
export const SWORDCAT_TRAILER_LABEL =
  "Pink Paw Knight trailer: Clem, a tiny knight cat with a pink bow, rescues a lost kitten";
export const SWORDCAT_SECTION_LABEL = "Out now";
export const SWORDCAT_SECTION_LINE =
  "Save lost kittens with a tiny knight. Every cat you save is a real cat at Pink Paw in Kaunas.";
// claim: L-rail (present tense only while the rail is live)
export const SWORDCAT_SECTION_TREAT_BEAT =
  "Save one, and Token Tails can send Pink Paw a free treat. It goes to Pink Paw's wallet.";

/** The treat beat per rail state. Present tense only while the rail is live. */
export function swordcatTreatBeat(state: RailState | null | undefined): string {
  const copy: Record<RailCopyState, string> = {
    // claim: L-rail (only while the rail is live)
    open: SWORDCAT_SECTION_TREAT_BEAT,
    // claim: L-rail
    exhausted: "Today's treats for Pink Paw are used up. Back at 00:00 UTC.",
    // claim: L-rail
    paused: "Treats for Pink Paw are paused for now.",
    // claim: L-rail (not deployed yet: future tense)
    soon: "Real treats for Pink Paw, from Token Tails, open soon.",
  };
  return copy[railCopyState(state)];
}

/**
 * The trailer says, in the present tense, that a tap sends Pink Paw a free treat. It may play only
 * while the rail is live (a treat goes out now, or today's budget is spent and comes back at
 * 00:00 UTC). Not deployed, paused or unknown: the poster only, so the video never contradicts the
 * treat beat beside it (the Heist reel's rule, `heistReelAllowed`).
 */
export function swordcatTrailerAllowed(state: RailState | null | undefined): boolean {
  const copyState = railCopyState(state);
  return copyState === "open" || copyState === "exhausted";
}

/** Shown unless `NEXT_PUBLIC_SWORDCAT` is an off value, and never in the app build. */
export function swordcatSectionEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_SWORDCAT,
  isApp: boolean = isAppBuild()
): boolean {
  return swordcatEnabled(flag) && !isApp;
}

interface SwordcatSectionProps {
  /** The treat rail from the impact snapshot: the treat beat follows its state. */
  railState: RailState | null;
  /** Override the flag and app-build check (tests). */
  enabled?: boolean;
}

export const SwordcatSection = ({ railState, enabled }: SwordcatSectionProps) => {
  const on = enabled ?? swordcatSectionEnabled();
  const withVideo = on && !isAppBuild() && swordcatTrailerAllowed(railState);
  const { sectionRef, videoRef, armed, userPaused, togglePause } = useReelPlayback<HTMLDivElement>(withVideo);
  if (!on) return null;
  const treatBeat = swordcatTreatBeat(railState);

  return (
    <section
      className="relative w-full overflow-hidden bg-tt-night-900"
      data-testid="swordcat-section"
      aria-labelledby="swordcat-section-title"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgb(var(--tt-pink)/.16),transparent_60%)]" />
      <div className="relative z-30 mx-auto max-w-[1100px] px-4 md:px-8 lg:px-16 py-12 md:py-20">
        <div className="grid grid-cols-1 items-center gap-6 md:gap-10 md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-tt-pink/70 bg-tt-pink/15 px-3 py-1 font-primary text-p6 md:text-p5 uppercase tracking-widest text-tt-pink">
              {SWORDCAT_SECTION_LABEL}
            </span>
            <h2
              id="swordcat-section-title"
              className="mt-3 font-primary uppercase leading-[0.95] text-[2.5rem] sm:text-[3rem] md:text-[3.5rem] xl:text-[4.25rem] text-tt-cream drop-shadow-lg"
            >
              {SWORDCAT_TITLE}
            </h2>
            <p className="mt-3 max-w-md text-p5 md:text-p4 text-tt-cream/90">{SWORDCAT_SECTION_LINE}</p>
            <p className="mt-3 max-w-md text-p6 md:text-p5 text-tt-cream/75" data-testid="swordcat-treat-beat">
              {treatBeat}
            </p>
            {/* Plain anchor on purpose: /swordcat hosts a static build and loads fully. */}
            <a
              href={SWORDCAT_SECTION_HREF}
              aria-label={`Play ${SWORDCAT_TITLE}`}
              data-testid="swordcat-section-cta"
              className="mt-6 rounded-xl py-2 md:py-3 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400"
            >
              <span className="glow-box block md:scale-110 md:origin-left">
                <PixelButton as="span" text="PLAY" subtext={SWORDCAT_TITLE.toUpperCase()} />
              </span>
            </a>
          </div>
          {/* Fixed 16:9 box: the poster, the video and the toggle share it, so nothing shifts. */}
          <div
            ref={sectionRef}
            className="relative overflow-hidden rounded-2xl border-4 border-tt-pink/70 bg-tt-night-950 aspect-video shadow-[0_0_24px_rgb(var(--tt-pink)/.3)]"
          >
            {withVideo ? (
              <video
                ref={videoRef}
                poster={SWORDCAT_TRAILER.poster}
                muted
                loop
                playsInline
                preload="none"
                aria-label={SWORDCAT_TRAILER_LABEL}
                width={1280}
                height={720}
                className="h-full w-full object-cover"
                data-testid="swordcat-trailer"
                data-armed={armed ? "1" : "0"}
              >
                {armed && <source src={SWORDCAT_TRAILER.webm} type="video/webm" />}
                {armed && <source src={SWORDCAT_TRAILER.mp4} type="video/mp4" />}
              </video>
            ) : (
              <img
                src={SWORDCAT_SECTION_STILL}
                alt={`${SWORDCAT_TITLE}: a tiny knight cat with a pink bow`}
                loading="lazy"
                decoding="async"
                width={1280}
                height={720}
                className="h-full w-full object-cover"
                data-testid="swordcat-section-still"
              />
            )}
            {withVideo && (
              <button
                type="button"
                onClick={togglePause}
                aria-pressed={userPaused}
                aria-label={userPaused ? "Play the trailer" : "Pause the trailer"}
                data-testid="swordcat-trailer-toggle"
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
      </div>
    </section>
  );
};

export default SwordcatSection;
