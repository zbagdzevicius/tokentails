// copy-lint: web-only the section never renders in the app build (badcatEntryEnabled)
import {
  BADCAT_LINE,
  BADCAT_POSTER,
  BADCAT_TITLE,
  badcatEntryEnabled,
  badcatHref,
} from "@/components/badcat/entry";
import { PixelButton } from "@/components/shared/PixelButton";

/**
 * The Bad Cat Daily landing section (founder, Oct 17: "it must be enabled without any flags"): a compact
 * section among the game sections, modelled on SwordcatSection. A poster captured from the built game (the
 * first heist in the Kitchen), the game's own one-liner, and one link to `/badcat`. Web only (no rewrites
 * in the app build, and the game's Stripe checkout); no flag.
 *
 * No money or shelter claim on purpose: the game's Pink Paw treat link only shows when its build sets
 * VITE_BADCAT_TREAT_URL, and any Pink Paw share of the game's sales is the game's own copy to make, at
 * checkout, not this section's.
 */
export const BADCAT_SECTION_HREF = badcatHref("landing_badcat");
export const BADCAT_SECTION_LABEL = "New · daily";
export const BADCAT_SECTION_HOOK = "Cats are chaos. Snap your own cat and wreck today's room.";

export const BadcatSection = ({ enabled }: { enabled?: boolean }) => {
  const on = enabled ?? badcatEntryEnabled();
  if (!on) return null;
  return (
    <section
      className="relative w-full overflow-hidden bg-tt-night-900"
      data-testid="badcat-section"
      aria-labelledby="badcat-section-title"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgb(var(--tt-gold-400)/.12),transparent_60%)]" />
      <div className="relative z-30 mx-auto max-w-[1100px] px-4 md:px-8 lg:px-16 py-12 md:py-20">
        <div className="grid grid-cols-1 items-center gap-6 md:gap-10 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col items-center text-center md:order-2 md:items-start md:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-tt-gold-400/70 bg-tt-gold-400/15 px-3 py-1 font-primary text-p6 md:text-p5 uppercase tracking-widest text-tt-gold-400">
              {BADCAT_SECTION_LABEL}
            </span>
            <h2
              id="badcat-section-title"
              className="mt-3 font-primary uppercase leading-[0.95] text-[2.5rem] sm:text-[3rem] md:text-[3.5rem] xl:text-[4.25rem] text-tt-cream drop-shadow-lg"
            >
              {BADCAT_TITLE}
            </h2>
            <p className="mt-3 max-w-md text-p5 md:text-p4 text-tt-cream/90">{BADCAT_LINE}</p>
            <p className="mt-3 max-w-md text-p6 md:text-p5 text-tt-cream/75">{BADCAT_SECTION_HOOK}</p>
            {/* Plain anchor on purpose: /badcat is a static build served top level and loads fully. */}
            <a
              href={BADCAT_SECTION_HREF}
              aria-label={`Play ${BADCAT_TITLE}`}
              data-testid="badcat-section-cta"
              className="mt-6 rounded-xl py-2 md:py-3 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400"
            >
              <span className="glow-box block md:scale-110 md:origin-left">
                <PixelButton as="span" text="PLAY" subtext="BAD CAT" />
              </span>
            </a>
          </div>
          {/* Fixed 16:10 box, so nothing shifts while the poster loads. The poster is a link too. */}
          <a
            href={BADCAT_SECTION_HREF}
            tabIndex={-1}
            aria-hidden="true"
            className="relative block overflow-hidden rounded-2xl border-4 border-tt-gold-400/70 bg-tt-night-950 aspect-[16/10] shadow-[0_0_24px_rgb(var(--tt-gold-400)/.25)] md:order-1"
          >
            <img
              src={BADCAT_POSTER.src}
              alt=""
              loading="lazy"
              decoding="async"
              width={BADCAT_POSTER.width}
              height={BADCAT_POSTER.height}
              className="h-full w-full object-cover"
              data-testid="badcat-section-poster"
            />
          </a>
        </div>
      </div>
    </section>
  );
};

export default BadcatSection;
