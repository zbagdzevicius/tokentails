// copy-lint: web-only the section never renders in the app build (swordcatSectionEnabled)
import { railCopyState, type RailCopyState, type RailState } from "@/api/impact-api";
import { isAppBuild } from "@/components/claims/build";
import { PixelButton } from "@/components/shared/PixelButton";
import { swordcatEnabled } from "@/components/swordcat/flags";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";

/**
 * The Swordcat landing section (Swordcat plan TOKENTAILS-PLAN.md §12.1 item 10, §12.3 E): a compact
 * section right after the Catnip Heist section. One still (the game's own share image, served with
 * the build at `/swordcat-game/og.jpg`, lazy), a short line, a treat beat that follows the rail state
 * (like the Heist section, so it always renders), and one link to `/swordcat`.
 *
 * On by default on the web (launch, Oct 16 2026); `NEXT_PUBLIC_SWORDCAT=0` (or false/no/off) is the kill
 * switch. Never in the app build. No release date and no number that is not read live.
 *
 * claim: L-rail "Token Tails can send Pink Paw a free treat" (only while the rail is live)
 * claim: the kittens carry the names and photos of real cats at Pink Paw (licence for the named cats'
 *   names and photos, Oct 11; the gallery is the only source)
 */

/** `from=landing_swordcat` says where the player came from (stripped on arrival at /swordcat). */
export const SWORDCAT_SECTION_HREF = "/swordcat?from=landing_swordcat";
/** The game's share image, 1200x630, copied with the build (`npm run build:tokentails`). */
export const SWORDCAT_SECTION_STILL = "/swordcat-game/og.jpg";
export const SWORDCAT_SECTION_LABEL = "Early access";
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
  if (!(enabled ?? swordcatSectionEnabled())) return null;
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
          <div className="relative overflow-hidden rounded-2xl border-4 border-tt-pink/70 bg-tt-night-950 aspect-[40/21] shadow-[0_0_24px_rgb(var(--tt-pink)/.3)]">
            <img
              src={SWORDCAT_SECTION_STILL}
              alt={`${SWORDCAT_TITLE}: a tiny knight cat with a pink bow`}
              loading="lazy"
              decoding="async"
              width={1200}
              height={630}
              className="h-full w-full object-cover"
              data-testid="swordcat-section-still"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default SwordcatSection;
