/**
 * Shared look of `/yourcat`: the night page language of the landing (gold CTAs, cream frames on
 * dark glass), the motion keyframes with their reduced-motion fallbacks (§1: transform and opacity
 * only), and the sprite still frame.
 */
import { forwardRef, useEffect, useState, type CSSProperties, type ReactNode } from "react";

export const PANEL =
  "w-full rounded-2xl border-4 border-tt-cream/70 bg-black/35 p-4 md:p-6 text-tt-cream backdrop-blur-[2px]";

export const TITLE =
  "font-primary text-h6 md:text-h4 font-bold leading-none text-tt-gold-400 text-balance outline-none [text-shadow:0_0_5px_#ffe89a,0_0_12px_#ffcf66]";

export const SUBTITLE = "font-primary text-p1 md:text-h6 font-bold leading-tight text-tt-gold-400 text-balance outline-none";

export const EYEBROW = "font-secondary text-p5 md:text-p4 uppercase tracking-[0.2em] text-tt-lilac";

export const BODY = "text-p5 md:text-p4 text-tt-cream";

export const CAPTION = "text-p6 md:text-p5 text-tt-cream";

export const GOLD_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border-4 border-tt-gold-shadow bg-tt-gold-400 px-5 py-2 font-primary text-p4 md:text-p3 uppercase tracking-wide text-tt-gold-ink shadow-[0_0_24px_rgb(var(--tt-gold-400)/.45),0_4px_0_rgb(var(--tt-night-950))] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-cream disabled:cursor-not-allowed disabled:opacity-60";

export const GHOST_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border-2 border-tt-cream/70 bg-tt-night-900/60 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-cream transition hover:bg-tt-night-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400 disabled:cursor-not-allowed disabled:opacity-60";

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

/** Keyframes for the page; every animation stops under `prefers-reduced-motion: reduce`. */
export const YourcatStyles = () => (
  <style>{`
@keyframes yc-scan { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes yc-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.yc-scan { animation: yc-scan 1600ms linear infinite; will-change: transform; }
.yc-pulse { animation: yc-pulse 1200ms ease-in-out infinite; }
.yc-fade-up { opacity: 0; transform: translateY(8px); transition: opacity 240ms ease-out, transform 240ms ease-out; }
.yc-fade-up[data-in="true"] { opacity: 1; transform: none; }
.yc-dot { transition: background-color 200ms ease-out, transform 200ms ease-out; }
.yc-land { transform: scale(0.96); opacity: 0; transition: transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out; }
.yc-land[data-in="true"] { transform: scale(1); opacity: 1; }
.yc-fade { transition: opacity 180ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .yc-scan { display: none; animation: none; }
  .yc-pulse { animation: none; }
  .yc-fade-up { transform: none; transition: opacity 120ms linear; }
  .yc-dot { transition: none; }
  .yc-land { transform: none; transition: opacity 120ms linear; }
  .yc-fade { transition: none; }
}
`}</style>
);

/** Fades its child up 8 px over 240 ms after `delay` ms (S1 stagger). Reduced motion: opacity only. */
export function FadeUp({ delay = 0, children, className = "" }: { delay?: number; children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delay + 16);
    return () => clearTimeout(timer);
  }, [delay]);
  return (
    <div className={`yc-fade-up ${className}`} data-in={shown ? "true" : "false"}>
      {children}
    </div>
  );
}

/**
 * The sprite sheet's frame 0 (48 px grid on a 720 x 480 sheet) as a CSS background: at `scale`
 * (48 x scale px), or filling its parent (`scale="fill"`, the sheet sized 1500% x 1000%).
 */
export function SpriteStill({
  spriteImg,
  scale,
  label,
  className = "",
}: {
  spriteImg: string;
  scale: number | "fill";
  label?: string;
  className?: string;
}) {
  const fill = scale === "fill";
  const style: CSSProperties = {
    width: fill ? "100%" : 48 * scale,
    height: fill ? "100%" : 48 * scale,
    backgroundImage: `url("${spriteImg}")`,
    backgroundSize: fill ? "1500% 1000%" : `${720 * scale}px ${480 * scale}px`,
    backgroundPosition: "0 0",
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
  return (
    <div
      className={`pixelated shrink-0 ${className}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-testid="sprite-still"
    />
  );
}

/** A screen heading that takes focus when its screen appears (§1.6). */
export const ScreenHeading = forwardRef<HTMLHeadingElement, { level?: 1 | 2; className?: string; children: ReactNode }>(
  ({ level = 1, className = TITLE, children }, ref) => {
    const Tag = level === 1 ? "h1" : "h2";
    return (
      <Tag ref={ref} tabIndex={-1} className={className}>
        {children}
      </Tag>
    );
  },
);

/** The drawn pixel paw of S6 (not an emoji glyph). */
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
