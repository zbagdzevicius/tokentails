import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * One IMPACT tab card: the night panel of the landing (night-800 with a gold hairline and the
 * soft lift shadow), a Passion One eyebrow and an optional chip on the right.
 */
export const ImpactPanel = ({
  title,
  aside,
  children,
  className,
  testId,
  labelledBy,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Id for the heading, so the section is a named region. */
  labelledBy: string;
}) => (
  <section
    data-testid={testId}
    aria-labelledby={labelledBy}
    className={clsx(
      "relative flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-tt-gold-500/50 bg-gradient-to-b from-tt-night-700/95 to-tt-night-900/95 p-3 text-tt-cream shadow-[0_6px_0_rgb(var(--tt-night-950)/0.6)] md:p-4",
      className
    )}
  >
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h3
        id={labelledBy}
        className="font-primary text-p5 uppercase tracking-wide text-tt-gold-400 md:text-p4"
      >
        {title}
      </h3>
      {aside}
    </div>
    {children}
  </section>
);

/** A cream-on-night action button that is always at least 44 px tall (touch target). */
export const ImpactButton = ({
  children,
  onClick,
  disabled,
  tone = "gold",
  pressed,
  testId,
  className,
  ariaLabel,
  busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "gold" | "ghost";
  pressed?: boolean;
  testId?: string;
  className?: string;
  ariaLabel?: string;
  busy?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    aria-pressed={pressed}
    aria-busy={busy || undefined}
    aria-label={ariaLabel}
    data-testid={testId}
    // In px, not rem: the root font size scales on some screens and a target must stay 44 px.
    style={{ minHeight: 44, minWidth: 44 }}
    className={clsx(
      "inline-flex items-center justify-center gap-1.5 rounded-lg border-2 px-3 font-primary text-p6 uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream disabled:cursor-not-allowed disabled:opacity-50 md:text-p5",
      tone === "gold"
        ? "border-tt-gold-500 bg-tt-gold-400 text-tt-gold-ink shadow-[0_3px_0_rgb(var(--tt-gold-shadow))] enabled:hover:brightness-105 enabled:active:translate-y-px"
        : "border-tt-cream/40 bg-tt-night-900/70 text-tt-cream enabled:hover:border-tt-gold-500 enabled:hover:text-tt-gold-400",
      className
    )}
  >
    {children}
  </button>
);
