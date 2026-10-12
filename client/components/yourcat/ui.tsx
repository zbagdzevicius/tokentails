/**
 * The form pieces of `/yourcat` that the brand kit (`brand.tsx`: headline, chip, panel, pills, the
 * primary action and the motion keyframes) does not cover: the text field, the alert, the two link
 * styles and the drawn pixel paw.
 */

export const TEXT_LINK =
  "inline-flex min-h-11 items-center underline underline-offset-4 text-tt-lilac hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";

/**
 * A link inside running text: inline, so it keeps the caption's line height, with a 44 px hit area
 * from block padding that a matching negative margin takes back out of the layout.
 */
export const INLINE_LINK =
  "inline -my-3 py-3 underline underline-offset-4 text-tt-lilac hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";

export const INPUT =
  "min-h-11 w-full rounded-xl border-2 border-tt-gold-500 bg-tt-night-600 px-3 py-2 text-p5 md:text-p4 text-tt-cream placeholder:text-tt-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";

export const ALERT = "rounded-xl border-2 border-tt-rust bg-tt-night-800 px-4 py-3 text-p5 md:text-p4 text-tt-cream";

/** The drawn pixel paw (not an emoji glyph). */
export const PixelPaw = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 12 12" className={`pixelated ${className}`} aria-hidden="true" shapeRendering="crispEdges">
    <g fill="currentColor">
      <rect x="1" y="3" width="2" height="3" />
      <rect x="4" y="1" width="2" height="3" />
      <rect x="7" y="1" width="2" height="3" />
      <rect x="9" y="3" width="2" height="3" />
      <rect x="3" y="6" width="6" height="4" />
      <rect x="4" y="10" width="4" height="1" />
      <rect x="2" y="7" width="1" height="2" />
      <rect x="9" y="7" width="1" height="2" />
    </g>
  </svg>
);
