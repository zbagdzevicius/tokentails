/**
 * The landing's brand kit for `/yourcat` (docs/plans/yourcat-polish.md §2.3, §2.4, §11): the
 * headline and pill classes, the `.glow` key words, the check chip, the one `PixelButton` primary
 * action per screen, a focusable headline, and every `yc-*` keyframe with its calm twin under
 * `prefers-reduced-motion` (§1.7). No framer-motion or Phaser here.
 */
import Link from "next/link";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { PixelButton } from "@/components/shared/PixelButton";
import { EASE } from "./motion";

/**
 * The landing headline: white, uppercase, `.glow` key words (strings stay sentence case in copy.ts).
 * Capped at `text-h4` (R2-08): at `h3` the 420 px column broke S1 into three lines; at `h4` it reads
 * "YOUR CAT, / IN THE GAME." on two.
 */
export const HEADLINE =
  "font-primary uppercase leading-none text-white drop-shadow-lg text-balance outline-none text-h6 sm:text-h5 md:text-h4";

/** The second-level heading: the headline at `text-p2 md:text-h6`. */
export const H2 = "font-primary uppercase leading-none text-white drop-shadow-lg text-balance outline-none text-p2 md:text-h6";

/** Body copy and captions (§2.3). */
export const BODY = "text-p5 md:text-p4 text-tt-cream";
export const CAPTION = "text-p6 md:text-p5 text-tt-lilac";

/** The landing chip (`ProofSection.tsx` CHIP_CLASS). */
export const CHIP =
  "inline-flex items-center gap-2 rounded-xl border-2 border-tt-cream bg-tt-cream/20 px-3 py-1 font-primary text-p6 md:text-p5 text-tt-cream uppercase tracking-wide";

export const PANEL =
  "w-full rounded-2xl border-4 border-tt-cream/70 bg-black/35 p-4 md:p-6 text-tt-cream backdrop-blur-[2px]";

/** Every secondary action: the night gold pill. */
export const NIGHT_PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-tt-gold-400/60 bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 transition-colors hover:bg-tt-night-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-cream disabled:cursor-not-allowed disabled:opacity-60";

/** The destructive pill (delete, start over). */
export const DANGER_PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-tt-rust bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-cream transition-colors hover:bg-tt-night-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-cream disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Key words up to this many characters never break inside (R2-08: "YOUR / CAT" split across lines).
 * A longer glow ("painted like royalty.", a 20-character name) may wrap, or it would overflow a phone.
 */
export const GLOW_NOWRAP_MAX = 16;

/** The key words of a headline, in the landing's cream glow (`globals.scss` `.glow`), kept on one line. */
export function Glow({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return <span className={`glow text-tt-cream ${wrap ? "" : "whitespace-nowrap"}`}>{children}</span>;
}

/** The landing chip with its 16 px check. */
export function ChipCheck({ children }: { children: ReactNode }) {
  return (
    <span className={CHIP}>
      <img src="/icons/check.webp" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 object-contain" draggable={false} />
      {children}
    </span>
  );
}

export interface PrimaryActionProps {
  text: ReactNode;
  onClick?(): void;
  href?: string;
  disabled?: boolean;
  busy?: boolean;
  fullWidth?: boolean;
  className?: string;
  /** The id of the line that describes the action (set on the focusable element). */
  describedBy?: string;
}

/**
 * The one primary action per screen: the landing `PixelButton` at `size="lg"`. With `href` (and not
 * disabled) it is `<Link><PixelButton as="span"/></Link>`, one tab stop. The wrapper reserves the
 * room the button's visual scale takes (`lg` is scaled 1.25x on phones), so nothing overlaps it.
 */
export function PrimaryAction({ text, onClick, href, disabled, busy, fullWidth, className, describedBy }: PrimaryActionProps) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const wrapClass = [
    "relative flex justify-center py-1.5 md:py-3",
    fullWidth ? "w-full px-[12%]" : "w-fit mx-auto",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    // PixelButton takes no aria props: describe its button from here.
    const button = wrapRef.current?.querySelector("button");
    if (!button) return;
    if (describedBy) button.setAttribute("aria-describedby", describedBy);
    else button.removeAttribute("aria-describedby");
  }, [describedBy, href, disabled]);

  // The md+ scale is held at 1.5x (the landing hero's 2x would overflow the 420 px column, §3).
  const buttonClass = "md:!scale-150 md:hover:!scale-[1.6]";

  if (href && !disabled) {
    return (
      <span ref={wrapRef} className={wrapClass} data-testid="yourcat-primary">
        <Link
          href={href}
          onClick={onClick}
          aria-describedby={describedBy}
          className={`${fullWidth ? "w-full" : ""} rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-tt-cream`}
        >
          <PixelButton as="span" size="lg" text={text} fullWidth={fullWidth} className={buttonClass} />
        </Link>
      </span>
    );
  }
  return (
    <span ref={wrapRef} className={wrapClass} data-testid="yourcat-primary">
      <PixelButton size="lg" text={text} onClick={onClick} disabled={disabled} busy={busy} fullWidth={fullWidth} className={buttonClass} />
    </span>
  );
}

/** A headline in parts: `before <Glow>glow</Glow> after` (§2.3). */
export type HeadlineParts = { before?: string; glow: string; after?: string };

const NO_SPACE_BEFORE = /^[\s.,!?:;…'’)]/;

/** The text of `parts` as one line (for aria, tests and the card). */
export function headlineText(parts: HeadlineParts): string {
  const before = parts.before ?? "";
  const after = parts.after ?? "";
  return `${before}${before && !/\s$/.test(before) ? " " : ""}${parts.glow}${after && !NO_SPACE_BEFORE.test(after) ? " " : ""}${after}`;
}

/**
 * A screen heading that takes focus when its screen appears (tabIndex -1): `before`, the glowing key
 * words, `after`. Level 1 uses `HEADLINE`, level 2 `H2`, unless `className` replaces it.
 */
export const Headline = forwardRef<HTMLHeadingElement, { parts: HeadlineParts; level?: 1 | 2; className?: string }>(
  ({ parts, level = 1, className }, ref) => {
    const Tag = level === 1 ? "h1" : "h2";
    const before = parts.before ?? "";
    const after = parts.after ?? "";
    return (
      <Tag ref={ref} tabIndex={-1} className={className ?? (level === 1 ? HEADLINE : H2)}>
        {before}
        {before && !/\s$/.test(before) ? " " : null}
        <Glow wrap={parts.glow.length > GLOW_NOWRAP_MAX}>{parts.glow}</Glow>
        {after && !NO_SPACE_BEFORE.test(after) ? " " : null}
        {after}
      </Tag>
    );
  },
);

/**
 * Every `yc-*` animation of the page, one `<style>` element (§4). Durations and delays read
 * `--yc-dur` / `--yc-delay` where a screen tunes them. Under `prefers-reduced-motion: reduce` each
 * one becomes an opacity fade of 120 to 400 ms, a calm opacity pulse, or nothing (§1.7). The stage's
 * fireflies (`.yc-firefly`, the landing's `Fireflies` look) stay, still; the frame's glow ring
 * (`.yc-ring`) gives way to the frame's static 2 px inner border.
 */
export const YourcatMotionStyles = () => (
  <style>{`
@keyframes yc-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes yc-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes yc-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes yc-rise-sm { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes yc-pop-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
@keyframes yc-press { 0%, 100% { transform: none; } 50% { transform: scaleY(.94); } }
@keyframes yc-peek { from { transform: translateY(100%); } to { transform: none; } }
@keyframes yc-walk-in { from { transform: translateX(-24px); } to { transform: none; } }
@keyframes yc-jump-out {
  0% { transform: translate(-56px, -24px); animation-timing-function: steps(3, end); }
  50% { transform: translate(-28px, -64px); animation-timing-function: steps(3, end); }
  100% { transform: none; }
}
@keyframes yc-sheen { 0% { transform: translateX(-120%) skewX(-12deg); } 14%, 100% { transform: translateX(120%) skewX(-12deg); } }
@keyframes yc-sheen-once { from { transform: translateX(-120%) skewX(-12deg); } to { transform: translateX(120%) skewX(-12deg); } }
@keyframes yc-breathe { from { opacity: .25; } to { opacity: .55; } }
@keyframes yc-ring { from { opacity: .5; } to { opacity: 1; } }
@keyframes yc-firefly {
  0%, 100% { transform: none; opacity: .35; }
  30% { opacity: .95; }
  50% { transform: translate(var(--yc-fly-dx, 12px), var(--yc-fly-dy, -12px)) scale(1.15); opacity: .7; }
  75% { opacity: 1; }
}
@keyframes yc-dash { to { stroke-dashoffset: -16; } }
@keyframes yc-scan { from { transform: translateY(-100%); } to { transform: translateY(var(--yc-scan-h, 192px)); } }
@keyframes yc-wait { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes yc-seg-pop { 0% { transform: scale(0); } 60% { transform: scale(1.25); } 100% { transform: none; } }
@keyframes yc-mote { 0% { opacity: 0; transform: none; } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(-40px); } }
@keyframes yc-push-in { from { transform: none; } to { transform: scale(1.04); } }
@keyframes yc-shake { 0%, 100% { transform: none; } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
@keyframes yc-title { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
@keyframes yc-glow-on { from { text-shadow: none; } }
@keyframes yc-slide-in { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
@keyframes yc-heart { 0% { opacity: 0; transform: none; } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-24px); } }
@keyframes yc-heart-calm { 0% { opacity: 0; } 20%, 70% { opacity: 1; } 100% { opacity: 0; } }
@keyframes yc-bar-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes yc-print { from { opacity: 0; transform: translateY(12px) rotate(-1.5deg); } to { opacity: 1; transform: none; } }
@keyframes yc-wipe { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(100% 0 0 0); } }
@keyframes yc-paw { 0%, 100% { transform: none; } 50% { transform: scale(1.08); } }
@keyframes yc-squash { 0%, 100% { transform: none; } 50% { transform: scale(1.08, .9); } }
@keyframes yc-hop {
  0%, 95% { transform: none; animation-timing-function: ${EASE.hop}; }
  97.5% { transform: translateY(-6px); animation-timing-function: ${EASE.std}; }
  100% { transform: none; }
}
@keyframes yc-sprite { from { background-position-x: 0; } to { background-position-x: calc(var(--yc-frames) * var(--yc-cell) * -1); } }
.yc-fade-in { animation: yc-fade-in var(--yc-dur, 240ms) ${EASE.out} var(--yc-delay, 0ms) both; }
.yc-fade-out { animation: yc-fade-out var(--yc-dur, 200ms) ${EASE.out} var(--yc-delay, 0ms) both; }
.yc-rise { animation: yc-rise var(--yc-dur, 420ms) ${EASE.out} var(--yc-delay, 0ms) both; }
.yc-rise-sm { animation: yc-rise-sm var(--yc-dur, 220ms) ${EASE.out} var(--yc-delay, 0ms) both; }
.yc-pop-in { animation: yc-pop-in var(--yc-dur, 380ms) ${EASE.spring} var(--yc-delay, 0ms) both; }
.yc-press { animation: yc-press 90ms ${EASE.std} both; }
.yc-peek { animation: yc-peek var(--yc-dur, 320ms) steps(4, end) var(--yc-delay, 0ms) both; }
.yc-walk-in { animation: yc-walk-in var(--yc-dur, 480ms) steps(6, end) var(--yc-delay, 0ms) both; }
.yc-jump-out { animation: yc-jump-out var(--yc-dur, 480ms) linear var(--yc-delay, 0ms) both; }
.yc-sheen { animation: yc-sheen 5s ${EASE.std} var(--yc-delay, 1200ms) infinite both; }
.yc-sheen-once { animation: yc-sheen-once var(--yc-dur, 600ms) ${EASE.std} var(--yc-delay, 0ms) 1 both; }
.yc-breathe { animation: yc-breathe 2s ease-in-out infinite alternate both; }
.yc-ring { animation: yc-ring 2s ease-in-out infinite alternate both; }
.yc-firefly {
  position: absolute; width: var(--yc-fly-size, 4px); height: var(--yc-fly-size, 4px); border-radius: 9999px; opacity: .35;
  background: radial-gradient(circle, rgb(var(--tt-gold-400)) 0%, rgb(var(--tt-gold-500)) 55%, transparent 100%);
  box-shadow: 0 0 calc(var(--yc-fly-size, 4px) * .75) rgb(var(--tt-gold-400) / .9), 0 0 calc(var(--yc-fly-size, 4px) * 2) rgb(var(--tt-gold-400) / .35);
  animation: yc-firefly var(--yc-dur, 14s) ease-in-out var(--yc-delay, 0s) infinite both;
}
.yc-dash { animation: yc-dash 1s linear infinite; }
.yc-scan { animation: yc-scan var(--yc-scan, 1800ms) ease-in-out infinite; will-change: transform; }
.yc-wait { animation: yc-wait 1.2s ease-in-out infinite; }
.yc-seg-pop { animation: yc-seg-pop 260ms ${EASE.spring} both; }
.yc-mote { animation: yc-mote var(--yc-dur, 1800ms) ${EASE.out} var(--yc-delay, 0ms) infinite both; }
.yc-push-in { animation: yc-push-in 8s linear both; }
.yc-shake { animation: yc-shake 50ms linear 3; }
.yc-title { animation: yc-title 280ms ${EASE.spring} both; }
.yc-glow-on .glow, .glow.yc-glow-on { animation: yc-glow-on 400ms ${EASE.out} both; }
.yc-slide-in { animation: yc-slide-in var(--yc-dur, 240ms) ${EASE.out} var(--yc-delay, 0ms) both; }
.yc-heart { animation: yc-heart var(--yc-dur, 600ms) ${EASE.out} var(--yc-delay, 0ms) both; }
.yc-bar-in { animation: yc-bar-in 260ms ${EASE.out} both; }
.yc-print { animation: yc-print 420ms ${EASE.spring} both; }
.yc-wipe { animation: yc-wipe 900ms ${EASE.std} both; }
.yc-paw { animation: yc-paw 2s ease-in-out 4; }
.yc-squash { animation: yc-squash 90ms ${EASE.std} both; }
.yc-hop { animation: yc-hop 6s linear 3; }
.yc-sprite { animation: yc-sprite calc(var(--yc-frames) * var(--yc-frame-ms, 125ms)) steps(var(--yc-frames), end) var(--yc-iter, infinite) both; }
.yc-paused, .yc-paused * { animation-play-state: paused !important; }
@media (prefers-reduced-motion: reduce) {
  .yc-fade-in, .yc-rise, .yc-rise-sm, .yc-pop-in, .yc-peek, .yc-walk-in, .yc-jump-out, .yc-title,
  .yc-slide-in, .yc-bar-in, .yc-print, .yc-seg-pop { animation: yc-fade-in 150ms linear var(--yc-rm-delay, 0ms) both; }
  .yc-fade-out { animation: yc-fade-out 150ms linear both; }
  .yc-heart { animation: yc-heart-calm 600ms linear var(--yc-delay, 0ms) both; }
  .yc-wipe { animation: yc-fade-out 300ms linear both; }
  .yc-wait { animation: yc-wait 1.2s ease-in-out infinite; }
  .yc-firefly { animation: none; opacity: .6; }
  .yc-ring { animation: none; display: none; }
  .yc-press, .yc-sheen, .yc-sheen-once, .yc-breathe, .yc-dash, .yc-push-in, .yc-shake, .yc-paw,
  .yc-squash, .yc-hop, .yc-sprite, .yc-glow-on .glow, .glow.yc-glow-on { animation: none; }
  .yc-sheen, .yc-sheen-once, .yc-scan, .yc-mote { display: none; animation: none; }
}
`}</style>
);
