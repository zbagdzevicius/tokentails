import clsx from "clsx";

/**
 * The botanical catnip sprig (plan G8, decision #56) for every DOM use of the catnip currency.
 *
 * - Exact device-pixel srcSet: each density gets a file drawn at exactly `size x density` pixels
 *   (`/catnip/catnip-v2-{px}.png`, integer nearest upscales of the 16/24/32 masters), so the
 *   browser never resamples the sprig and no `.pixelated` class is needed.
 * - Served from `client/public/catnip/` (task 3e exports the files), not the CDN, so the legacy
 *   leaf can never come back from a stale CDN cache.
 * - `alt` defaults to "Catnip". Pass `alt=""` when a visible label already says "catnip": the
 *   image is then decorative and hidden from assistive tech.
 */
export const CATNIP_ICON_SIZES = [16, 24, 32, 48, 64, 96] as const;
export type CatnipIconSize = (typeof CATNIP_ICON_SIZES)[number];

const DENSITIES = [1, 2, 3] as const;

export const catnipIconSrc = (px: number) => `/catnip/catnip-v2-${px}.png`;

/** `"/catnip/catnip-v2-16.png 1x, /catnip/catnip-v2-32.png 2x, /catnip/catnip-v2-48.png 3x"` */
export const catnipIconSrcSet = (size: CatnipIconSize) =>
  DENSITIES.map((d) => `${catnipIconSrc(size * d)} ${d}x`).join(", ");

/** Every file the component can request; task 3e's exporter must produce all of them. */
export const CATNIP_ICON_FILES: readonly string[] = Array.from(
  new Set(CATNIP_ICON_SIZES.flatMap((s) => DENSITIES.map((d) => s * d))),
)
  .sort((a, b) => a - b)
  .map(catnipIconSrc);

export interface CatnipIconProps {
  size: CatnipIconSize;
  className?: string;
  /** Defaults to "Catnip"; "" marks the icon decorative. */
  alt?: string;
}

export function CatnipIcon({ size, className, alt = "Catnip" }: CatnipIconProps) {
  const decorative = alt === "";
  return (
    <img
      src={catnipIconSrc(size)}
      srcSet={catnipIconSrcSet(size)}
      width={size}
      height={size}
      // Fixed CSS px (not rem): the srcSet files match these pixels exactly at 1x, 2x and 3x.
      style={{ width: size, height: size }}
      alt={alt}
      aria-hidden={decorative || undefined}
      draggable={false}
      decoding="async"
      className={clsx("inline-block shrink-0 select-none", className)}
    />
  );
}

export default CatnipIcon;
