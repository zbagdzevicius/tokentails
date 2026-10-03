/**
 * The landing pill copy (plan G2, G11 rail copy). Kept in one place so the copy lint and the
 * tests read the same string.
 */
export const HEIST_PILL_COPY = "Or play Catnip Heist now, no sign-up";

/** `from=landing` feeds `heist_open {from}` on the host page (the pill sends nothing itself). */
export const HEIST_PILL_HREF = "/heist?from=landing";

/**
 * Decision #15: the pill stays off until the Poki carve-out is in writing and the strategy's 40%
 * completion gate for levels 1-3 is met. Turn it on with `NEXT_PUBLIC_HEIST_LANDING_PILL=1`.
 */
export function heistPillEnabled(raw: string | undefined = process.env.NEXT_PUBLIC_HEIST_LANDING_PILL): boolean {
  const value = (raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

/** A quiet secondary link under the hero CTA: night glass, gold text, one tab stop. */
export const HeistPill = ({ enabled = heistPillEnabled() }: { enabled?: boolean }) => {
  if (!enabled) return null;
  return (
    // Plain anchor on purpose: /heist hosts a static build and loads fully.
    <a
      href={HEIST_PILL_HREF}
      data-testid="heist-pill"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-tt-gold-400/50 bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 shadow-[0_0_18px_rgb(var(--tt-gold-400)/.25)] backdrop-blur-sm transition hover:bg-tt-night-900/90 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400"
    >
      {HEIST_PILL_COPY}
    </a>
  );
};
