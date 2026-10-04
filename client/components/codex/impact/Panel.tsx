import { IconSlot, type ModalIcon } from "@/components/ui/modal";
import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * One IMPACT tab card: the modal system's section card (`tt-card`, one card level), an icon and a
 * Passion One heading, an optional one-line helper and an optional chip on the right.
 */
export const ImpactPanel = ({
  title,
  icon,
  helper,
  aside,
  tone,
  children,
  className,
  testId,
  labelledBy,
}: {
  title: ReactNode;
  icon?: ModalIcon;
  /** One plain line under the heading. */
  helper?: ReactNode;
  aside?: ReactNode;
  tone?: "highlight" | "success";
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Id for the heading, so the section is a named region. */
  labelledBy: string;
}) => (
  <section
    data-testid={testId}
    aria-labelledby={labelledBy}
    data-tone={tone}
    className={clsx("tt-card relative flex min-w-0 flex-col gap-3 p-3 text-tt-cream md:p-4 short:!p-2.5", className)}
  >
    <div className="flex min-w-0 items-start gap-2">
      {icon != null && (
        <span className="mt-[2px] text-tt-gold-400" aria-hidden="true">
          <IconSlot icon={icon} size={20} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 id={labelledBy} className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-gold-400">
          {title}
        </h3>
        {helper != null && (
          <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">{helper}</p>
        )}
      </div>
      {aside != null && <div className="ml-auto flex shrink-0 items-center gap-2">{aside}</div>}
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
    data-variant={tone === "gold" ? "primary" : "secondary"}
    // In px, not rem: the root font size scales on some screens and a target must stay 44 px.
    style={{ minHeight: 44, minWidth: 44 }}
    className={clsx(
      "tt-btn inline-flex items-center justify-center gap-1.5 px-3 font-primary text-p5 uppercase leading-none tracking-wide transition-[filter,background-color,color] duration-150 enabled:active:translate-y-[2px] motion-reduce:transition-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[4px] focus-visible:outline-tt-gold-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50",
      tone === "gold"
        ? "bg-tt-gold-400 text-tt-gold-ink enabled:hover:brightness-110"
        : "bg-tt-night-600 text-tt-cream enabled:hover:bg-tt-night-500",
      className
    )}
  >
    {children}
  </button>
);
