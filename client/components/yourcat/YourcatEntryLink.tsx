import Link from "next/link";
import { useYourcatAvailable, YOURCAT_ENTRY_COPY, YOURCAT_ENTRY_HREF, type YourcatAvailableOptions } from "./useYourcatAvailable";

/** The landing's quiet secondary pill (the look of `HeistPill`): night glass, gold text, one tab stop. */
export const ENTRY_PILL =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-tt-gold-400/50 bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 shadow-[0_0_18px_rgb(var(--tt-gold-400)/.25)] backdrop-blur-sm transition hover:bg-tt-night-900/90 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400";

/** A plain text link (the onboarding ceremony's panels). */
export const ENTRY_TEXT_LINK =
  "inline-flex min-h-11 items-center font-sans text-p5 underline underline-offset-4 text-tt-cream hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";

/**
 * "Turn your cat's photo into your game cat" → `/yourcat`, rendered only while `/yourcat` is on and
 * open (`useYourcatAvailable`). Nothing renders while loading, on error, when paused or spent, in the
 * app build, or while `NEXT_PUBLIC_YOURCAT_ENTRY` is off. No price, shelter or urgency wording.
 */
export function YourcatEntryLink({
  className = ENTRY_PILL,
  testId = "yourcat-entry",
  ...options
}: YourcatAvailableOptions & { className?: string; testId?: string }) {
  const available = useYourcatAvailable(options);
  if (!available) return null;
  return (
    <Link href={YOURCAT_ENTRY_HREF} className={className} data-testid={testId}>
      {YOURCAT_ENTRY_COPY}
    </Link>
  );
}

export default YourcatEntryLink;
