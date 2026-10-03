/**
 * Look presets per scene (plan G7 "Look presets"; decisions #49, #50).
 *
 *   home       plates hub-night     Home: moonlit night (#49)
 *   shelter    plates hub-dusk      Shelter: dusk (#49)
 *   cupid      plates cupid-night   Cupid Cat
 *   purrsuit/<family>  plates purrsuit-<family>   one per tile family incl. ENDLESS
 *              (`combined`, #50)
 *
 * Ids and plate-set names are the look manifest's (task 6d); the manifest's own preset entry
 * wins where it names a different skin or plate set.
 *
 * A preset names its night tile skin and plate set (resolved through the look manifest), and
 * carries the palette the runtime uses for the procedural fallback plates, lights, halos and
 * fireflies. Colours come from client/design/tokens.ts (night, gold, ink, states, dusk); the
 * Purrsuit accents are the families' own hero colours.
 *
 * Only v1 uses presets; v0 is the look as it shipped before G7 (CSS backdrop, day tiles).
 *
 * Pure module: no Phaser import (Jest, SSR).
 */
import { DUSK, GOLD, INK, NIGHT, STATES } from "@/design/tokens";
import type { ZoomPreset } from "./pickZoom";
import { nightSkinName, sheetFamily } from "./manifest";

export type SceneKind = "home" | "shelter" | "purrsuit" | "cupid";

export interface LookPreset {
  /** Scene id in the look manifest (`home`, `purrsuit/construct`). */
  id: string;
  /** Default plate-set name. */
  name: string;
  kind: SceneKind;
  zoom: ZoomPreset;
  /** Night tile skin name in the manifest, or null to keep the v0 sheet. */
  tileSkin: string | null;
  /** Sky ramp, top to horizon. */
  sky: [string, string, string];
  /** Far, mid and near silhouette colours. */
  hills: [string, string, string];
  fog: string;
  moon: boolean;
  /** Stars per 10 000 art pixels of sky. */
  stars: number;
  /** Warm light at emissive tiles. */
  light: string;
  /** Rim colour of the halo under each cat. */
  halo: string;
  fireflies: [string, string];
  /**
   * Multiplicative tint for the v0 tiles while no night skin is in the manifest (the art pass,
   * task 6d, replaces it with real night tiles at the same indices). Per tile layer, not a
   * screen grade.
   */
  tileWash: string;
  /**
   * Multiplicative tint over the night tile skin itself, per tile layer (not a screen grade).
   * A fallback for a skin that still reads as day under the night sky (task 6e review, finding
   * 2: the spring-night sheet keeps salmon dirt and cyan water); the art pass (task 6d) darkens
   * the sheet and this can go back to unset.
   */
  nightTint?: string;
  /** Multiplicative tint over the manifest's far and mid plates (the Shelter's dusk warmth). */
  plateTint?: string;
  /** Colour of a glow from mid-view to the horizon, behind the mid plates (dusk, #49). */
  horizonGlow?: string;
  /** Peak alpha of that glow (default 0.45). */
  horizonGlowAlpha?: number;
  /** Default emissive tile gids (lamps, candles) when the manifest lists none. */
  emissive: number[];
}

/** Lamps and candles of the shared 30-column sheets: hanging lamp 21, candles 213 and 243. */
export const DEFAULT_EMISSIVE = [21, 213, 243];

const HOME: LookPreset = {
  id: "home",
  name: "hub-night",
  kind: "home",
  zoom: "hub",
  tileSkin: "spring-night",
  sky: [NIGHT[950], NIGHT[700], NIGHT[500]],
  hills: [NIGHT[600], NIGHT[700], NIGHT[800]],
  fog: INK.muted,
  moon: true,
  stars: 9,
  light: GOLD[400],
  halo: INK.lilac,
  fireflies: [GOLD[400], STATES.mint],
  tileWash: "#b9b2e6",
  // Moonlit: cools and dims the salmon dirt and cyan water of spring-night-v1 (#49).
  nightTint: "#9590d2",
  emissive: DEFAULT_EMISSIVE,
};

const SHELTER: LookPreset = {
  id: "shelter",
  name: "hub-dusk",
  kind: "shelter",
  zoom: "hub",
  tileSkin: "spring-night",
  sky: [DUSK.top, DUSK.mid, DUSK.horizon],
  hills: ["#5a3360", NIGHT[500], NIGHT[700]],
  fog: DUSK.horizon,
  moon: false,
  stars: 3,
  light: GOLD[400],
  halo: GOLD[500],
  fireflies: [GOLD[400], STATES.pink],
  tileWash: "#e6c2cf",
  // Dusk (#49): the same skin, warmer and a little lighter than Home's moonlight, with a warm
  // cast on the far and mid plates and an orange glow at the horizon.
  nightTint: "#c9a3bd",
  plateTint: "#ffd0c4",
  horizonGlow: DUSK.horizon,
  horizonGlowAlpha: 0.5,
  emissive: DEFAULT_EMISSIVE,
};

const CUPID: LookPreset = {
  id: "cupid",
  name: "cupid-night",
  kind: "cupid",
  zoom: "platformer",
  tileSkin: "valentine-night",
  sky: [NIGHT[950], "#3b1a46", "#7a3e6e"],
  hills: ["#4a2150", "#33173f", NIGHT[800]],
  fog: STATES.pink,
  moon: true,
  stars: 7,
  light: STATES.pink,
  halo: STATES.pink,
  fireflies: [STATES.pink, INK.lilac],
  tileWash: "#d9b3d9",
  emissive: DEFAULT_EMISSIVE,
};

/** Accent per Purrsuit family (fog, lights and firefly tint); the night ramp is shared. */
const FAMILY_ACCENT: Record<string, string> = {
  construct: DUSK.horizon,
  spring: STATES.mint,
  summer: GOLD[400],
  autumn: DUSK.horizon,
  winter: STATES.sky,
  candy: STATES.pink,
  camp: STATES.mint,
  summit: STATES.sky,
  stocks: "#9fdfba",
  sei: INK.lilac,
  daemons: STATES.rust,
  "cat-winter": STATES.sky,
  combined: INK.lilac,
};

export function purrsuitPreset(sheetPath: string): LookPreset {
  const family = sheetFamily(sheetPath);
  const accent = FAMILY_ACCENT[family] ?? INK.lilac;
  return {
    id: `purrsuit/${family}`,
    name: `purrsuit-${family}`,
    kind: "purrsuit",
    zoom: "platformer",
    tileSkin: nightSkinName(sheetPath),
    sky: [NIGHT[950], NIGHT[700], NIGHT[500]],
    hills: [NIGHT[600], NIGHT[700], NIGHT[800]],
    fog: accent,
    moon: true,
    stars: 8,
    light: GOLD[400],
    halo: accent,
    fireflies: [GOLD[400], accent],
    tileWash: "#c2bbea",
    emissive: DEFAULT_EMISSIVE,
  };
}

export function lookPreset(kind: SceneKind, sheetPath?: string): LookPreset {
  if (kind === "home") return HOME;
  if (kind === "shelter") return SHELTER;
  if (kind === "cupid") return CUPID;
  return purrsuitPreset(sheetPath ?? "base/combined.png");
}

/** `#rrggbb` -> 0xrrggbb (Phaser colours). */
export function hexToInt(hex: string): number {
  const value = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(value) ? value : 0xffffff;
}
