// Smooth line icons for the Paw Legends chrome (founder, Nov 13: "we must drop pixel art"). Same 24x24 grid as the
// pixel glyphs, drawn as round-capped 2 px strokes in currentColor (the v6 brand icon style the game uses). Shapes
// follow Lucide (ISC License, Copyright (c) Lucide Contributors). `fill` paths are solid shapes (the paw).
// PixelIcon draws one of these whenever the name has one; add a name here before using a new icon.

export interface SmoothGlyph {
  /** Stroked path data (2 px, round caps and joins). */
  stroke?: readonly string[];
  /** Filled path data. */
  fill?: readonly string[];
}

/** A circle as path data (stroked or filled like any path). */
const circle = (cx: number, cy: number, r: number): string => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
/** A rounded rectangle as path data. */
const rect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
/** An ellipse as path data (the paw's toes). */
const toe = (cx: number, cy: number, rx: number, ry: number): string => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

export const SMOOTH_ICONS: Readonly<Record<string, SmoothGlyph>> = {
  user: { stroke: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", circle(12, 7, 4)] },
  close: { stroke: ["M18 6 6 18", "M6 6l12 12"] },
  check: { stroke: ["M20 6 9 17l-5-5"] },
  mail: { stroke: [rect(2, 4, 20, 16, 2), "M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"] },
  loader: { stroke: ["M21 12a9 9 0 1 1-6.22-8.56"] },
  "warning-diamond": { stroke: ["M12 2.7 21.3 12 12 21.3 2.7 12Z", "M12 8v4", "M12 16h.01"] },
  "info-box": { stroke: [rect(3, 3, 18, 18, 3), "M12 16v-4", "M12 8h.01"] },
  trash: { stroke: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6"] },
  logout: { stroke: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"] },
  gamepad: { stroke: [rect(2, 6, 20, 12, 3), "M6 12h4", "M8 10v4", "M15 13h.01", "M18 11h.01"] },
  copy: { stroke: [rect(8, 8, 14, 14, 2), "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"] },
  coins: { stroke: [circle(8, 8, 6), "M18.09 10.37A6 6 0 1 1 10.34 18", "M7 6h1v4", "M16.71 13.88l.7.71-2.82 2.82"] },
  chart: { stroke: ["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"] },
  eye: { stroke: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z", circle(12, 12, 3)] },
  "eye-off": {
    stroke: [
      "M9.88 9.88a3 3 0 1 0 4.24 4.24",
      "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",
      "M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",
      "M2 2l20 20",
    ],
  },
  paw: {
    fill: [
      toe(4.6, 10.6, 2.1, 2.6),
      toe(9, 5.6, 2.2, 2.8),
      toe(15, 5.6, 2.2, 2.8),
      toe(19.4, 10.6, 2.1, 2.6),
      "M12 11.5c-3.2 0-6.3 3.4-6.3 6.3 0 1.9 1.5 2.9 3.2 2.9 1.3 0 2.1-.7 3.1-.7s1.8.7 3.1.7c1.7 0 3.2-1 3.2-2.9 0-2.9-3.1-6.3-6.3-6.3Z",
    ],
  },
  messenger: { stroke: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z", "M7 13l3-3 3 2 4-4"] },
  heart: { stroke: ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"] },
  star: { stroke: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"] },
  lock: { stroke: [rect(3, 11, 18, 11, 2), "M7 11V7a5 5 0 0 1 10 0v4"] },
  key: { stroke: [circle(7.5, 15.5, 5.5), "M21 2l-9.6 9.6", "M15.5 7.5l3 3L22 7l-3-3"] },
  "external-link": { stroke: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"] },
  "chevron-left": { stroke: ["M15 18l-6-6 6-6"] },
  "chevron-right": { stroke: ["M9 18l6-6-6-6"] },
  reload: { stroke: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"] },
  share: { stroke: [circle(18, 5, 3), circle(6, 12, 3), circle(18, 19, 3), "M8.59 13.51l6.83 3.98", "M15.41 6.51l-6.82 3.98"] },
  send: { stroke: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4 20-7Z"] },
  gift: { stroke: [rect(3, 8, 18, 4, 1), "M12 8v13", "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7", "M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"] },
  trophy: { stroke: ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16", "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22", "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22", "M18 2H6v7a6 6 0 0 0 12 0V2Z"] },
  sparkles: { stroke: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z", "M5 3v4", "M3 5h4", "M19 17v4", "M17 19h4"] },
  "settings-cog": { stroke: [circle(12, 12, 3), "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"] },
};
