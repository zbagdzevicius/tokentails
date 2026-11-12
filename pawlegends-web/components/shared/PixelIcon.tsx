import clsx from "clsx";
import { CUSTOM_ICONS } from "./icons/custom";
import { PIXELARTICONS } from "./icons/pixelarticons";

// Replaces boxicons, whose stylesheet was never loaded, so every `bx` icon
// rendered empty (plan F3.6). Glyphs come from pixelarticons (MIT, decision
// #63) through scripts/codemods/sync-pixel-icons.mjs; missing ones are
// hand-drawn in icons/custom.ts.
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
  const paths = GLYPHS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      shapeRendering="crispEdges"
      focusable="false"
      data-icon={name}
      className={clsx("inline-block shrink-0 align-[-0.125em]", className)}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {label && <title>{label}</title>}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
};
