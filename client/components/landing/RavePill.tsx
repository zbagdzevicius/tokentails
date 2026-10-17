// copy-lint: web-only the hero callout never renders in the app build (raveLandingEnabled)
import { isAppBuild } from "@/components/claims/build";
import { RaveLiveLine } from "./RaveLiveLine";
import { raveHref, useRaveLive } from "./raveLive";

export const RAVE_PILL_BADGE = "New · Moon Rave";
export const RAVE_PILL_CTA = "Join the rave →";
/** `from=landing_hero` says which callout sent the visitor. */
export const RAVE_PILL_HREF = raveHref("landing_hero");

/** The Moon Rave callouts are web only: /rave is a web page, and its checkout takes cards and USDC. */
export function raveLandingEnabled(isApp: boolean = isAppBuild()): boolean {
  return !isApp;
}

/**
 * The hero's Moon Rave callout (founder, Oct 17: "update landing page of token tails to highlight
 * rave"): a glowing pill to /rave with the live line under it. Web only; no flag.
 */
export const RavePill = ({ enabled }: { enabled?: boolean }) => {
  const on = enabled ?? raveLandingEnabled();
  const live = useRaveLive(on);
  if (!on) return null;
  return (
    <div className="mb-2 flex flex-col items-center gap-1.5" data-testid="rave-pill-wrap">
      {/* Plain anchor on purpose: /rave hosts a static build and loads fully. */}
      <a
        href={RAVE_PILL_HREF}
        data-testid="rave-pill"
        className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-tt-mint bg-black/80 py-1.5 pl-1.5 pr-4 md:py-2.5 md:pl-2.5 md:pr-5 font-primary text-p5 md:text-p3 uppercase tracking-wide text-tt-cream shadow-[0_0_24px_rgb(var(--tt-mint)/.7),0_0_52px_rgb(var(--tt-pink)/.35)] backdrop-blur-sm transition hover:scale-[1.03] hover:shadow-[0_0_30px_rgb(var(--tt-mint)/.8),0_0_60px_rgb(var(--tt-pink)/.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <span className="rounded-full bg-tt-pink px-2.5 py-1 text-p6 md:text-p4 text-black">{RAVE_PILL_BADGE}</span>
        <span className="text-tt-mint group-hover:text-tt-cream">{RAVE_PILL_CTA}</span>
      </a>
      {/* A fixed slot (two lines on phones): the number arriving, or staying hidden, moves nothing. */}
      <div className="flex min-h-[3.25rem] sm:min-h-[1.75rem] items-start justify-center" data-testid="rave-pill-line-slot">
        <RaveLiveLine
          live={live}
          stackOnPhone
          className="rounded-2xl bg-black/70 px-3 py-0.5 text-center font-primary text-p5 md:text-p4 text-tt-cream backdrop-blur-sm"
        />
      </div>
    </div>
  );
};
