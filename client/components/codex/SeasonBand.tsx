import { useClock } from "@/components/impact/useClock";
import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import { localSeasonTime, seasonFrozen, seasonLeft, type SeasonTimes } from "./season";

interface SeasonBandProps {
  season: SeasonTimes | null;
  /** True while the progression (which carries the season) is loading. */
  loading?: boolean;
  /** Test seams: a fixed clock and an explicit locale and time zone. */
  now?: Date | null;
  locale?: string;
  timeZone?: string;
  className?: string;
}

/**
 * The season band at the top of IMPACT (plan G5 P6): when this season's counters freeze, in the
 * viewer's local time, and how long is left. During the freeze it says when the next season
 * starts. The instants come from the backend; nothing is computed here.
 */
export const SeasonBand = ({ season, loading, now: nowProp, locale, timeZone, className }: SeasonBandProps) => {
  const ticking = useClock(30_000);
  const now = nowProp === undefined ? ticking : nowProp;
  const frozen = season ? seasonFrozen(season, now) : false;
  const left = season && now ? seasonLeft(frozen ? season.anchorAt : season.freezeAt, now) : null;

  return (
    <section
      data-testid="season-band"
      data-season-frozen={frozen || undefined}
      aria-label="Season"
      className={clsx(
        "flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 border-tt-lilac/50 bg-gradient-to-r from-tt-night-900 via-tt-night-800 to-tt-night-700 px-3 py-2.5 text-tt-cream shadow-[0_6px_0_rgb(var(--tt-night-950)/0.6)] md:px-4",
        className
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-tt-lilac/60 bg-tt-night-950/70 px-2 py-1 font-primary text-p6 uppercase tracking-wide text-tt-lilac md:text-p5">
        <PixelIcon name="bookmark" size={14} />
        {frozen ? "Season wrap-up" : "This season"}
      </span>
      {season ? (
        <>
          <p className="order-3 min-w-0 basis-full font-secondary text-p5 leading-snug sm:order-none sm:basis-0 sm:flex-1 md:text-p4" data-testid="season-line">
            {frozen ? (
              <>
                Results are being counted. The next season starts{" "}
                <strong className="whitespace-nowrap font-bold text-tt-gold-400" data-testid="season-at">
                  {localSeasonTime(season.anchorAt, locale, timeZone)}
                </strong>
                .
              </>
            ) : (
              <>
                Season progress counts until{" "}
                <strong className="whitespace-nowrap font-bold text-tt-gold-400" data-testid="season-at">
                  {localSeasonTime(season.freezeAt, locale, timeZone)}
                </strong>{" "}
                <span className="whitespace-nowrap text-tt-muted">(your time)</span>
              </>
            )}
          </p>
          {left && (
            <span
              data-testid="season-left"
              className="ml-auto shrink-0 rounded-lg border-2 border-tt-gold-500/60 bg-tt-night-950/70 px-2.5 py-1 font-primary text-p5 uppercase text-tt-cream"
            >
              {left} left
            </span>
          )}
        </>
      ) : (
        <p className="min-w-0 flex-1 font-secondary text-p5 text-tt-muted" data-testid="season-line">
          {loading ? "Loading this season's dates…" : "Season dates show here once your progress loads."}
        </p>
      )}
    </section>
  );
};

export default SeasonBand;
