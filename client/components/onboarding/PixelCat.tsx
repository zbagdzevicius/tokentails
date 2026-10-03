import clsx from "clsx";
import { useEffect, useState, type CSSProperties } from "react";

/** The cat GIFs are drawn on a 48x48 frame (cat-assets pipeline). */
export const CAT_FRAME_PX = 48;

/**
 * An integer CSS scale for a pixel sprite (plan G3, F10: never fractional). `maxCss` is the space
 * available in CSS px; the scale is the largest whole number that fits, clamped to [min, max].
 */
export function integerScale(maxCss: number, frame = CAT_FRAME_PX, min = 1, max = 8): number {
  if (!Number.isFinite(maxCss) || maxCss <= 0) return min;
  return Math.max(min, Math.min(max, Math.floor(maxCss / frame)));
}

/**
 * The integer scale that fits the viewport, recomputed on resize: the space is the smallest of
 * `fraction` of the viewport's smaller side, `widthFraction` of its width, `heightFraction` of its
 * height and `cap` CSS px. Starts at `initial` so SSR and the first paint agree.
 */
export function useIntegerScale(
  {
    fraction = Infinity,
    widthFraction = Infinity,
    heightFraction = Infinity,
    cap = Infinity,
    min = 2,
    max = 6,
    initial = 3,
  }: {
    fraction?: number;
    widthFraction?: number;
    heightFraction?: number;
    cap?: number;
    min?: number;
    max?: number;
    initial?: number;
  } = {},
): number {
  const [scale, setScale] = useState(initial);
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const space = Math.min(
        Math.min(width, height) * fraction,
        width * widthFraction,
        height * heightFraction,
        cap,
      );
      setScale(integerScale(space, CAT_FRAME_PX, min, max));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [fraction, widthFraction, heightFraction, cap, min, max]);
  return scale;
}

interface PixelCatProps {
  src: string;
  /** Shown instead of `src` under reduced motion (a still frame). */
  still?: string;
  reducedMotion?: boolean;
  /** Whole-number scale of the 48 px frame. Fractions are floored. */
  scale: number;
  alt: string;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

/**
 * A pixel cat at an exact integer scale with `image-rendering: pixelated`, sized in CSS px through
 * inline style (not Tailwind classes, which the rem plugin would turn into fractional sizes).
 */
export const PixelCat = ({ src, still, reducedMotion, scale, alt, className, style, testId }: PixelCatProps) => {
  const whole = Math.max(1, Math.floor(scale));
  const size = CAT_FRAME_PX * whole;
  return (
    <img
      src={reducedMotion && still ? still : src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      data-testid={testId}
      data-scale={whole}
      className={clsx("pixelated select-none", className)}
      style={{ width: size, height: size, minWidth: size, imageRendering: "pixelated", ...style }}
    />
  );
};
