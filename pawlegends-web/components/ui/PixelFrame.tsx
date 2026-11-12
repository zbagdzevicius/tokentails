import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

/**
 * Stepped "pixel" corners as a clip-path polygon: two steps of `unit` px at each corner.
 * Used only on decorative layers, never on the content box, so focus rings, tooltips and
 * overflowing badges inside a frame are not clipped.
 */
export function pixelCorners(unit: number): string {
  const u = `${unit}px`;
  const u2 = `${unit * 2}px`;
  const r = (v: string) => `calc(100% - ${v})`;
  return `polygon(${[
    `${u2} 0`,
    `${r(u2)} 0`,
    `${r(u2)} ${u}`,
    `${r(u)} ${u}`,
    `${r(u)} ${u2}`,
    `100% ${u2}`,
    `100% ${r(u2)}`,
    `${r(u)} ${r(u2)}`,
    `${r(u)} ${r(u)}`,
    `${r(u2)} ${r(u)}`,
    `${r(u2)} 100%`,
    `${u2} 100%`,
    `${u2} ${r(u)}`,
    `${u} ${r(u)}`,
    `${u} ${r(u2)}`,
    `0 ${r(u2)}`,
    `0 ${u2}`,
    `${u} ${u2}`,
    `${u} ${u}`,
    `${u2} ${u}`,
  ].join(", ")})`;
}

export type PixelFrameTone = "night" | "parchment";

interface PixelFrameProps {
  children?: ReactNode;
  tone?: PixelFrameTone;
  /** Size of one pixel step in CSS px. Defaults to 4. */
  unit?: number;
  className?: string;
  /** Classes for the (unclipped) content box. */
  contentClassName?: string;
  /**
   * Classes for the decorative layer stack, for effects that must follow the stepped corners
   * (a `filter: drop-shadow(...)`). Put filters here, never in `className`: a filter or transform
   * on an ancestor makes it the containing block of `position: fixed` children, so a fixed
   * overlay or a viewport-placed CloseButton inside the frame would size to the panel.
   */
  shadowClassName?: string;
  /**
   * Night tone only: paints the "night sky" fill (lilac top light, dusk foot glow, pixel stars, an
   * inner vignette; styles/globals.scss `.tt-panel-*`) instead of the flat gradient. GameModal's
   * panel and sheet use it; small inline frames (DeathCard, RunGate) keep the flat fill.
   */
  ambient?: boolean;
  style?: CSSProperties;
}

const TONES: Record<PixelFrameTone, { outline: string; rim: string; fill: string; glint: string }> = {
  night: {
    outline: "bg-tt-night-950",
    rim: "bg-tt-gold-500",
    fill: "bg-gradient-to-b from-tt-night-700 to-tt-night-800",
    glint: "bg-tt-night-500/70",
  },
  parchment: {
    outline: "bg-tt-gold-shadow",
    rim: "bg-tt-gold-500",
    fill: "bg-gradient-to-b from-tt-parchment-from to-tt-parchment-to",
    glint: "bg-white/40",
  },
};

/**
 * The pixel panel frame for night chrome (plan F3.3): a night-950 outline, a gold-500 rim and a
 * night-700 to night-800 fill, each a separately clipped layer behind the content.
 */
export const PixelFrame = ({
  children,
  tone = "night",
  unit = 4,
  className,
  contentClassName,
  shadowClassName,
  ambient = false,
  style,
}: PixelFrameProps) => {
  const colors = TONES[tone];
  const sky = ambient && tone === "night";
  const layer = (inset: number, extra: string) => (
    <span
      aria-hidden="true"
      className={clsx("pointer-events-none absolute", extra)}
      style={{ inset, clipPath: pixelCorners(unit) }}
    />
  );

  return (
    <div
      className={clsx("relative isolate", className)}
      style={style}
      data-pixel-frame={tone}
      data-ambient={sky || undefined}
    >
      <span
        aria-hidden="true"
        data-pixel-frame-layers=""
        className={clsx("pointer-events-none absolute inset-0", shadowClassName)}
      >
        {layer(0, colors.outline)}
        {layer(unit, colors.rim)}
        {layer(unit * 2, sky ? "tt-panel-sky" : colors.fill)}
        {sky && layer(unit * 2, "tt-panel-stars")}
        {sky && layer(unit * 2, "tt-panel-stars-twinkle")}
        {/* Top glint: one pixel row of light under the rim, the bevel the landing buttons use. */}
        <span
          className={clsx("pointer-events-none absolute h-[2px]", colors.glint)}
          style={{ top: unit * 2, left: unit * 4, right: unit * 4 }}
        />
      </span>
      <div className={clsx("relative", contentClassName)} style={{ padding: unit * 2 }}>
        {children}
      </div>
    </div>
  );
};

export default PixelFrame;
