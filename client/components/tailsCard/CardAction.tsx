import NextLink from "next/link";
import { createContext, type MouseEvent, type ReactNode } from "react";

/**
 * Makes a card read as tappable everywhere: the whole card is one link or button (so the touch
 * target is the card, never the badge), and a round gold "open" badge sits on its top-right
 * corner with a slow ping (always visible, so it works on touch).
 * Desktop hover and keyboard focus lift the card and light its rim; touch press shrinks it.
 *
 * Sizes: "lg" is the approved landing look (48 px badge); "md" (36 px) for card grids such as
 * /cats; "sm" (28 px) for dense grids such as My Pets. The badge offset scales with the size, so
 * it sits on the corner and never covers the card's name. In a grid, pass `ping` only on the
 * first card, so a wall of cards is not a wall of pulses.
 */
export type CardActionSize = "sm" | "md" | "lg";

/**
 * True inside a CardAction. A TailsCard reads it and hides its own "flip" badge there: the card
 * already opens something, and two corner badges (or a button inside a link) would compete.
 */
export const InsideCardActionContext = createContext(false);

// Full class names, so Tailwind sees them. The badge gold is Tailwind's yellow 300 shade (#fde047)
// written as a hex (the design-tokens test bans that class name); the ink is tt-gold-shadow (#713f12).
const SIZES: Record<
  CardActionSize,
  { radius: string; lift: string; glow: string; badge: string; dot: string; icon: string; badgeLift: string }
> = {
  lg: {
    radius: "rounded-[22px]",
    lift: "motion-safe:group-hover:-translate-y-2 motion-safe:group-focus-visible:-translate-y-2",
    glow: "group-hover:drop-shadow-[0_0_24px_rgba(253,224,71,0.55)] group-focus-visible:drop-shadow-[0_0_24px_rgba(253,224,71,0.55)]",
    badge: "-right-3 -top-3 h-12 w-12",
    dot: "h-12 w-12 shadow-[0_3px_0_rgba(113,63,18,0.9),0_0_16px_rgba(253,224,71,0.6)]",
    icon: "h-6 w-6",
    badgeLift: "motion-safe:group-hover:-translate-y-2",
  },
  md: {
    radius: "rounded-[18px]",
    lift: "motion-safe:group-hover:-translate-y-1.5 motion-safe:group-focus-visible:-translate-y-1.5",
    glow: "group-hover:drop-shadow-[0_0_18px_rgba(253,224,71,0.55)] group-focus-visible:drop-shadow-[0_0_18px_rgba(253,224,71,0.55)]",
    badge: "-right-2.5 -top-2.5 h-9 w-9",
    dot: "h-9 w-9 shadow-[0_2px_0_rgba(113,63,18,0.9),0_0_12px_rgba(253,224,71,0.6)]",
    icon: "h-[18px] w-[18px]",
    badgeLift: "motion-safe:group-hover:-translate-y-1.5",
  },
  sm: {
    radius: "rounded-[14px]",
    lift: "motion-safe:group-hover:-translate-y-1 motion-safe:group-focus-visible:-translate-y-1",
    glow: "group-hover:drop-shadow-[0_0_12px_rgba(253,224,71,0.55)] group-focus-visible:drop-shadow-[0_0_12px_rgba(253,224,71,0.55)]",
    badge: "-right-2 -top-2 h-7 w-7",
    dot: "h-7 w-7 shadow-[0_2px_0_rgba(113,63,18,0.9),0_0_8px_rgba(253,224,71,0.6)]",
    icon: "h-3.5 w-3.5",
    badgeLift: "motion-safe:group-hover:-translate-y-1",
  },
};

type Target =
  /** A link. Plain anchor (full page load) unless `clientNav`, e.g. /game needs a full load. */
  | { href: string; clientNav?: boolean; target?: string; onClick?: never }
  /** A button that runs the card's existing click, e.g. opening a detail modal. */
  | { onClick: (e: MouseEvent<HTMLButtonElement>) => void; href?: never; clientNav?: never; target?: never };

export const CardAction = ({
  ariaLabel,
  children,
  size = "lg",
  ping = true,
  badge = true,
  fill = false,
  className = "",
  ...target
}: Target & {
  /** Accessible name for the whole card, e.g. "Meet Judas". */
  ariaLabel: string;
  children: ReactNode;
  size?: CardActionSize;
  /** The slow ping on the badge (motion-safe only). In a grid, only the first card. */
  ping?: boolean;
  /**
   * The gold "open" badge. Default on; a dense grid where the whole card is plainly the button
   * (My Pets) keeps it on the first card only, as the hint.
   */
  badge?: boolean;
  /** Block-level and full width (grid cells); otherwise inline-block around the card. */
  fill?: boolean;
  /** Extra classes on the outer link or button, e.g. a max width in a grid. */
  className?: string;
}) => {
  const s = SIZES[size];
  const outer = `group relative ${fill ? "block w-full" : "inline-block"} ${s.radius} outline-none focus-visible:ring-4 focus-visible:ring-[#fde047] focus-visible:ring-offset-4 focus-visible:ring-offset-tt-night-900 ${className}`;

  const inner = (
    <>
      <span
        className={`block ${s.radius} transition-[transform,filter] duration-300 ease-out ${s.glow} ${s.lift} motion-safe:group-active:translate-y-0 motion-safe:group-active:scale-[0.97]`}
      >
        <InsideCardActionContext.Provider value={true}>{children}</InsideCardActionContext.Provider>
      </span>
      {badge && (
        <span
          aria-hidden="true"
          data-card-action-badge={size}
          className={`pointer-events-none absolute z-10 flex items-center justify-center transition-transform duration-300 ${s.badge} ${s.badgeLift} motion-safe:group-hover:scale-110`}
        >
          {ping && (
            <span
              data-card-action-ping=""
              className="absolute inset-0 rounded-full bg-[#fde047]/60 motion-safe:animate-ping [animation-duration:2.4s]"
            />
          )}
          <span
            className={`relative flex items-center justify-center rounded-full border-2 border-tt-gold-shadow/80 bg-gradient-to-b from-yellow-200 to-yellow-400 text-tt-gold-shadow ${s.dot}`}
          >
            {/* Expand / open icon */}
            <svg viewBox="0 0 24 24" className={s.icon} fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h6v6" />
              <path d="M20 4l-7 7" />
              <path d="M10 20H4v-6" />
              <path d="M4 20l7-7" />
            </svg>
          </span>
        </span>
      )}
    </>
  );

  if (target.href !== undefined) {
    if (target.clientNav) {
      return (
        <NextLink href={target.href} target={target.target} aria-label={ariaLabel} className={outer}>
          {inner}
        </NextLink>
      );
    }
    return (
      // Plain anchor: card targets such as /game need a full page load.
      <a href={target.href} target={target.target} aria-label={ariaLabel} className={outer}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" aria-label={ariaLabel} onClick={target.onClick} className={`${outer} text-left`}>
      {inner}
    </button>
  );
};
