import clsx from "clsx";
import { CUSTOM_ICONS } from "./icons/custom";
import { PIXELARTICONS } from "./icons/pixelarticons";
import { SMOOTH_ICONS } from "./icons/smooth";

// Replaces boxicons, whose stylesheet was never loaded, so every `bx` icon
// rendered empty (plan F3.6). Glyphs come from pixelarticons (MIT, decision
// #63) through scripts/codemods/sync-pixel-icons.mjs; missing ones are
// hand-drawn in icons/custom.ts. Founder, Nov 13 ("we must drop pixel art"): a
// name with a smooth line icon (icons/smooth.ts, the v6 style) draws that one;
// the pixel glyph is only the fallback for a name smooth.ts lacks.
const GLYPHS: Record<string, readonly string[]> = {
  ...PIXELARTICONS,
  ...CUSTOM_ICONS,
};

export type PixelIconName =
  | keyof typeof PIXELARTICONS
  | keyof typeof CUSTOM_ICONS;

export const PIXEL_ICON_NAMES = Object.keys(GLYPHS) as PixelIconName[];

interface IProps {
  name: PixelIconName;
  /**
   * Accessible name for an icon that carries meaning on its own (an icon-only
   * button, for instance). Without it the icon is decorative and hidden from
   * assistive technology.
   */
  label?: string;
  /** Rendered width and height. Defaults to 1em so the icon follows font size. */
  size?: number | string;
  className?: string;
}

export const PixelIcon = ({ name, label, size = "1em", className }: IProps) => {
  const smooth = SMOOTH_ICONS[name];
  const paths = GLYPHS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      shapeRendering={smooth ? "geometricPrecision" : "crispEdges"}
      focusable="false"
      data-icon={name}
      data-smooth={smooth ? "" : undefined}
      className={clsx("inline-block shrink-0 align-[-0.125em]", className)}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {label && <title>{label}</title>}
      {smooth ? (
        <>
          {smooth.fill?.map((d, i) => (
            <path key={`f${i}`} d={d} />
          ))}
          {smooth.stroke?.map((d, i) => (
            <path
              key={`s${i}`}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </>
      ) : (
        paths.map((d, i) => <path key={i} d={d} />)
      )}
    </svg>
  );
};
