/**
 * The gilt frame of `/yourcat` (docs/plans/yourcat-polish.md §2.6, §11): one object that stays
 * mounted from S1 to S3; only its contents change. Square corners and a two-tone bevel from outside
 * in: 4 px gold-400, 4 px gold-shadow, a 2 px night-950 keyline, with a cream highlight in the top
 * left outer pixels. The inner box is `box-content` at an integer multiple of 96 (192 phones, 384
 * md+), so pixel art inside stays even. Tone `cream` is the shelter frame (2 px cream, 2 px muted,
 * 1 px night keyline) around any 2:3 box. `bump()` runs the clock's scale beats with WAAPI (§4.2).
 */
import { forwardRef, useCallback, useImperativeHandle, useRef, type CSSProperties, type ReactNode } from "react";
import { EASE } from "./motion";

export type FrameBump = "hold" | "settle" | "pulse" | "drop";

export interface FrameHandle {
  inner: HTMLDivElement | null;
  bump(kind: FrameBump): void;
}

export interface FrameProps {
  tone?: "gold" | "cream";
  /** The inner box in px on phones, and from md up (defaults to the phone size). */
  inner: { w: number; h: number; mdW?: number; mdH?: number };
  legs?: boolean;
  /** A light band crosses the glass every 5 s (S1 idle), or once (`"once"`, after `sheenDelayMs`). */
  sheen?: boolean | "once";
  /** The delay of a `"once"` sheen in ms (default 0). */
  sheenDelayMs?: number;
  /**
   * A slow gold glow ring around the bevel (S2 beat C): a transparent ring 6 px outside the frame
   * with a soft gold box-shadow (and a faint inset one, so the 6 px gap never reads as a dark band),
   * no fill. Reduced motion: a static 2 px gold inner border.
   */
  breathe?: boolean;
  /** A file is dragged over the stage: scale 1.03 over 160 ms. */
  dragOver?: boolean;
  /** The work failed: the keyline turns rust and the idle motion stops. */
  failed?: boolean;
  /** Accessible name of the frame group. */
  label?: string;
  reducedMotion: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Bevel widths in px, outside in (gold: 4 + 4 + 2; cream: 2 + 2 + 1). */
export const FRAME_BEVEL = Object.freeze({ gold: 10, cream: 5 });

const BUMPS: Record<FrameBump, { frames: Keyframe[]; options: KeyframeAnimationOptions }> = {
  hold: { frames: [{ transform: "scale(1)" }, { transform: "scale(1.03)" }], options: { duration: 150, easing: EASE.std, fill: "forwards" } },
  settle: { frames: [{ transform: "scale(1.03)" }, { transform: "scale(1)" }], options: { duration: 320, easing: EASE.spring } },
  pulse: {
    frames: [{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }],
    options: { duration: 260, easing: EASE.spring },
  },
  drop: { frames: [{ transform: "scale(.97)" }, { transform: "scale(1)" }], options: { duration: 240, easing: EASE.spring } },
};

/**
 * The gilt frame's glass: night velvet, a radial gradient from `tt-night-700` at the centre (a little
 * above it, where the light from the altar falls) to `tt-night-950` at the bevel (R2-03), so the
 * empty frame reads as cloth behind glass, not a hole. Photos and pixel art cover it.
 */
export const FRAME_VELVET =
  "bg-tt-night-950 bg-[radial-gradient(ellipse_75%_70%_at_50%_42%,rgb(var(--tt-night-700))_0%,rgb(var(--tt-night-800))_45%,rgb(var(--tt-night-950))_100%)]";

/** The legs: two 4x8 px gold posts that stand the frame on the altar. */
const LEG = "block h-2 w-1 bg-tt-gold-400 shadow-[inset_-2px_0_0_rgb(var(--tt-gold-shadow))]";

export const Frame = forwardRef<FrameHandle, FrameProps>(function Frame(
  { tone = "gold", inner, legs = false, sheen = false, sheenDelayMs = 0, breathe = false, dragOver = false, failed = false, label, reducedMotion, className, style, children },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<Animation | null>(null);

  const bump = useCallback(
    (kind: FrameBump) => {
      const node = rootRef.current;
      if (reducedMotion || !node || typeof node.animate !== "function") return;
      try {
        const { frames, options } = BUMPS[kind];
        // Every beat after the hold starts from where the hold left the frame, then releases it.
        holdRef.current?.cancel();
        holdRef.current = null;
        const animation = node.animate(frames, options);
        if (kind === "hold") holdRef.current = animation;
      } catch {
        // A missed bump only loses a beat of motion.
      }
    },
    [reducedMotion],
  );

  useImperativeHandle(
    ref,
    () => ({
      get inner() {
        return innerRef.current;
      },
      bump,
    }),
    [bump],
  );

  const gold = tone === "gold";
  const sizeVars = {
    "--yc-iw": `${inner.w}px`,
    "--yc-ih": `${inner.h}px`,
    "--yc-iw-md": `${inner.mdW ?? inner.w}px`,
    "--yc-ih-md": `${inner.mdH ?? inner.h}px`,
  } as CSSProperties;
  const animateIdle = !reducedMotion && !failed;

  return (
    <div
      ref={rootRef}
      role={label ? "group" : undefined}
      aria-label={label}
      className={`relative inline-flex flex-col items-stretch ${className ?? ""}`}
      style={{ ...sizeVars, ...style }}
      data-testid={gold ? "yourcat-frame" : "yourcat-frame-cream"}
      data-tone={tone}
      data-failed={failed ? "true" : undefined}
    >
      <div
        className={`relative ${reducedMotion ? "" : "transition-transform duration-150"} ${dragOver && !reducedMotion ? "scale-[1.03]" : ""}`}
        style={{ transitionTimingFunction: EASE.out }}
        data-drag-over={dragOver ? "true" : undefined}
      >
        {/* The breathing glow: a ring around the bevel, never a filled block (it has no background of
            its own and inherits none, so no panel tint shows through it). */}
        {breathe && animateIdle && (
          <span
            aria-hidden="true"
            className="yc-ring pointer-events-none absolute -inset-[6px] bg-transparent shadow-[0_0_18px_4px_rgb(var(--tt-gold-400)/.55),inset_0_0_6px_2px_rgb(var(--tt-gold-400)/.4)]"
            data-testid="yourcat-frame-breathe"
          />
        )}
        <div
          className={`box-content relative ${
            gold
              ? "border-4 border-tt-gold-400 shadow-[0_6px_0_rgb(var(--tt-night-950)/.55)]"
              : "border-2 border-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)/.5)]"
          }`}
        >
          {gold && (
            <span aria-hidden="true" className="pointer-events-none absolute -left-1 -top-1 z-[1] block h-1 w-1">
              <span className="absolute left-0 top-0 h-0.5 w-0.5 bg-tt-cream" />
              <span className="absolute left-0.5 top-0 h-0.5 w-0.5 bg-tt-cream" />
              <span className="absolute left-0 top-0.5 h-0.5 w-0.5 bg-tt-cream" />
            </span>
          )}
          <div className={gold ? "border-4 border-tt-gold-shadow" : "border-2 border-tt-muted"}>
            <div className={`${gold ? "border-2" : "border"} ${failed ? "border-tt-rust" : "border-tt-night-950"}`}>
              <div
                ref={innerRef}
                className={`relative box-content h-[var(--yc-ih)] w-[var(--yc-iw)] overflow-hidden md:h-[var(--yc-ih-md)] md:w-[var(--yc-iw-md)] ${
                  gold ? FRAME_VELVET : "bg-tt-night-950"
                }`}
                data-testid="yourcat-frame-inner"
              >
                {children}
                {/* The band spans the glass width, so translateX(±120%) starts and ends fully off the glass. */}
                {sheen && animateIdle && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="yourcat-frame-sheen">
                    <span
                      className={`${sheen === "once" ? "yc-sheen-once" : "yc-sheen"} absolute inset-0 bg-gradient-to-r from-transparent from-[38%] via-tt-cream/[.12] to-transparent to-[62%]`}
                      style={sheen === "once" ? ({ "--yc-delay": `${sheenDelayMs}ms`, "--yc-dur": "700ms" } as CSSProperties) : undefined}
                      data-sheen={sheen === "once" ? "once" : "loop"}
                    />
                  </span>
                )}
                {breathe && reducedMotion && !failed && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-tt-gold-400" />
                )}
                {dragOver && reducedMotion && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-dashed border-tt-cream" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {legs && (
        <div aria-hidden="true" className="flex justify-between px-4 md:px-8" data-testid="yourcat-frame-legs">
          <span className={LEG} />
          <span className={LEG} />
        </div>
      )}
    </div>
  );
});

/**
 * The empty frame's contents (S1, S0 companion): a dashed cream silhouette of a sitting cat, 8%
 * cream fill, and the label under it, inside the frame. `marching` runs the dash while a file is
 * dragged over. `compact` is the small friend-view frame (72 px phones, 128 md+): a smaller cat and
 * the label in `tt-cream text-p6` at every width (R1-11); otherwise the label is lilac.
 */
export function FrameSilhouette({ label, marching = false, compact = false }: { label: string; marching?: boolean; compact?: boolean }) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center ${compact ? "gap-1 p-1.5 md:gap-2 md:p-3" : "gap-[6%] p-[8%]"}`}
      data-testid="yourcat-frame-silhouette"
    >
      <svg viewBox="0 0 64 72" aria-hidden="true" className={`${compact ? "h-[44%]" : "h-[62%]"} w-auto shrink-0 overflow-visible`}>
        <path
          d="M18 10 L24 22 Q32 19 40 22 L46 10 L48 28 Q52 34 50 42 Q58 50 56 62 Q54 70 44 70 L20 70 Q8 70 8 60 Q8 50 14 44 Q12 36 16 28 Z M50 64 Q62 62 60 50"
          className={`fill-tt-cream/[.08] stroke-tt-cream ${marching ? "yc-dash" : ""}`}
          strokeWidth={2}
          strokeDasharray="5 3"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {label && (
        <span
          className={`text-center font-primary uppercase tracking-wide ${compact ? "text-p6 leading-none text-tt-cream" : "text-p6 md:text-p5 text-tt-lilac"}`}
          data-testid="yourcat-frame-label"
        >
          {label}
        </span>
      )}
    </div>
  );
}
