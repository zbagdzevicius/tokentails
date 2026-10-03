/**
 * Token Tails design tokens (plan F3.1). The single source of truth.
 *
 * Pure data: no imports, no side effects, no Phaser. Three consumers read it:
 *
 * - `tailwind.config.ts` (loaded through Tailwind's bundled jiti) maps every colour under
 *   `colors.tt.*` as `rgb(var(--tt-x) / <alpha-value>)` and the layers under `zIndex`.
 * - `scripts/build-tokens.mjs` generates `styles/tokens.css`, which declares the `--tt-*`
 *   custom properties as space-separated RGB triplets (`--tt-night-900: 11 8 32;`). Run
 *   `npm run tokens:build` after editing this file; `npm run tokens:check` fails when the CSS is
 *   stale.
 * - Phaser scenes and 2D canvases that need a hex value import the constants directly.
 *
 * New tokens use the `tt-` namespace. The portrait feature's `gold`, `gold-muted`, `gold-light` and
 * `cream` (HSL variables in `globals.scss`) are separate and stay.
 *
 * Contrast notes are measured against the surface named in each comment (WCAG 2.x ratio).
 */

/** Night surfaces. `#0b0820` (900) is the page background of the landing and the game. */
export const NIGHT = {
  950: "#07051a", // scrims, deepest shadow
  900: "#0b0820", // page (landing, /game, theme-color, native splash)
  800: "#120d1f", // panel gradient foot, sheets
  700: "#1e1633", // panel
  600: "#2a1f45", // raised panel, input fill
  500: "#3a2d5c", // hairline on night, disabled fill
} as const;

export const GOLD = {
  400: "#ffcc55", // CTA fill, modal titles
  500: "#e2c05a", // hairlines, input borders
  ink: "#4a1d08", // text on gold-400 (9.53:1)
  shadow: "#713f12", // bevel only, never text
} as const;

export const INK = {
  cream: "#fcecbb", // body text on night
  lilac: "#f0c5fd", // secondary accent text
  muted: "#9a88c9", // tertiary text (6.11:1 on night-800)
} as const;

export const STATES = {
  rust: "#ee642a", // danger text
  pink: "#ff7aa2", // love / blessing accent
  ember: "#c1260f", // danger fills only, never text on night
  mint: "#7fd66b", // success
  sky: "#90c5e9", // info
} as const;

/** The lobby dusk grade (G6 CSS fallback for the G7 world). */
export const DUSK = {
  top: "#2a1f45",
  mid: "#7a3e6e",
  horizon: "#ee8a5c",
} as const;

/**
 * Parchment surfaces (quest scrolls, codex pages). Values are not fixed by the plan: they sit on
 * the cream ink ramp so the existing `yellow-300` (#fcecbb) scrolls keep their look.
 */
export const PARCHMENT = {
  from: "#f7e6b8",
  to: "#e9cf8f",
} as const;

/**
 * Every colour token, flat, keyed by its name without the `tt-` prefix. Each becomes the custom
 * property `--tt-<name>` in `styles/tokens.css` and the Tailwind colour `tt-<name>`
 * (`bg-tt-night-900`, `text-tt-gold-ink`, `text-tt-cream`, `from-tt-dusk-top`). Ink and state
 * colours are unprefixed (`tt-cream`, `tt-rust`), matching the names used across the plan.
 */
export const TT_COLORS: Readonly<Record<string, string>> = {
  ...prefixed("night", NIGHT),
  ...prefixed("gold", GOLD),
  ...INK,
  ...STATES,
  ...prefixed("dusk", DUSK),
  ...prefixed("parchment", PARCHMENT),
};

function prefixed(group: string, values: Record<string | number, string>) {
  const out: Record<string, string> = {};
  for (const [key, hex] of Object.entries(values)) out[`${group}-${key}`] = hex;
  return out;
}

/**
 * The z scale (plan F3.2). Tailwind exposes each as `z-<name>`, for example `z-modal`, `z-toast`.
 * Card-local stacking (EpicCardEffects' z-[120] and z-[250]) is not a layer and stays local.
 */
export const LAYERS = {
  hud: 40, // lobby HUD
  gate: 80, // RunGate inside a mode container
  modal: 100, // GameModal
  "modal-nested": 110, // a modal opened from a modal
  auth: 200, // AuthSheet
  intro: 300, // IntroCurtain
  reveal: 400, // RevealAnimation, OpeningAnimation, TailsCardPack
  celebration: 450, // Celebration
  toast: 500, // Toast, above every sheet
  system: 600, // root error fallback
} as const;

export type LayerName = keyof typeof LAYERS;

/**
 * Typography data (plan F4). Data only: the runtime (`sync-fonts.mjs`, `loadGameFonts`, the Phaser
 * font gate) is built by task 2d and reads these. Family names match the existing `@font-face`
 * declarations, so nothing changes until the self-hosted files land.
 */
export const FONT_FAMILIES = {
  display: "Passion One",
  hud: "Bebas Neue",
  body: "Nunito",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** Self-hosted faces, filled by `scripts/sync-fonts.mjs` (task 2d). Paths are under `/fonts/`. */
export const FONT_FILES: ReadonlyArray<{
  family: string;
  weight: number | string;
  style: "normal" | "italic";
  subset: "latin" | "latin-ext";
  file: string;
}> = [];

export const TYPE_ROLES = {
  title: { family: "Passion One", weight: 900, minPx: 18, case: "as-is" },
  hud: { family: "Bebas Neue", weight: 400, minPx: 12, case: "upper" },
  label: { family: "Bebas Neue", weight: 400, minPx: 12, case: "upper" },
  caption: { family: "Nunito", weight: 700, minPx: 12, case: "as-is" },
  hint: { family: "Nunito", weight: 800, minPx: 14, case: "sentence" },
  burst: { family: "Passion One", weight: 900, minPx: 18, case: "upper", stroke: "bark" },
  code: { family: "mono", weight: 400, minPx: 12, case: "as-is" },
} as const;

export type TypeRole = keyof typeof TYPE_ROLES;

/** The browser and native chrome colour (`theme-color`, Capacitor splash). */
export const THEME_COLOR = NIGHT[900];
