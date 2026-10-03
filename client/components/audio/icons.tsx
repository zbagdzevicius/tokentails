import clsx from "clsx";

/**
 * Pixel glyphs for the sound and settings controls, on the PixelIcon 24 px grid (one rectangle
 * per run of pixels, filled with currentColor). Decorative: the buttons carry the names.
 */
const SPEAKER = "M2 9h4v6H2zM6 7h2v10H6zM8 5h2v14H8zM10 3h2v18h-2z";
const GLYPHS = {
  "sound-on": [SPEAKER, "M14 9h2v6h-2zM17 6h2v2h-2zM19 8h2v8h-2zM17 16h2v2h-2z"],
  "sound-off": [SPEAKER, "M14 8h2v2h-2zm6 0h2v2h-2zM16 10h2v2h-2zm2 0h2v2h-2zM16 12h2v2h-2zm2 0h2v2h-2zM14 14h2v2h-2zm6 0h2v2h-2z"],
  gear: [
    "M10 1h4v4h-4zM10 19h4v4h-4zM1 10h4v4H1zM19 10h4v4h-4z",
    "M4 4h3v3H4zM17 4h3v3h-3zM4 17h3v3H4zM17 17h3v3h-3z",
    "M7 5h10v2H7zM5 7h2v10H5zM17 7h2v10h-2zM7 17h10v2H7z",
    "M7 7h3v10H7zM14 7h3v10h-3zM10 7h4v3h-4zM10 14h4v3h-4z",
  ],
} as const;

export type AudioGlyph = keyof typeof GLYPHS;

export const AudioIcon = ({ name, size = 24, className }: { name: AudioGlyph; size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    shapeRendering="crispEdges"
    focusable="false"
    aria-hidden="true"
    data-icon={name}
    className={clsx("inline-block shrink-0", className)}
  >
    {GLYPHS[name].map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);
