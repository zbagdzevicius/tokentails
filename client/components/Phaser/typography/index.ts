/**
 * Typography runtime (plan F4), the Phaser half. Scenes import from here:
 *
 *   import { preloadTTFonts, ttText, ttFit } from "@/components/Phaser/typography";
 *
 * The Phaser-free half (roles, `loadGameFonts`, `ttCanvasFont`) is `components/typography/`.
 * Only `TTFontsFile.ts` imports Phaser at runtime; the other modules are structural.
 */
export {
  TTFontsFile,
  preloadTTFonts,
  TT_FONTS_FILE_KEY,
  TT_FONTS_FILE_TYPE,
  TT_FONTS_RESULT_KEY,
} from "./TTFontsFile";
export { ttText, keepLinearFilter } from "./ttText";
export type { TTText, TTTextOptions } from "./ttText";
export { ttStyle, ttResolution, roleMetrics, ROLE_COLORS, MAX_TEXT_RESOLUTION } from "./ttStyle";
export type { TTStyleOptions } from "./ttStyle";
export { ttFit, fitSpecOf, refitText } from "./ttFit";
export type { TTFitOptions, TTFitResult, TTFitSegment, TTFitTarget } from "./ttFit";
export {
  installFontHealing,
  healTexts,
  trackTTText,
  trackedTextCount,
  refreshTTResolution,
  isGameFontEvent,
  gameFontFamilies,
  TT_FONTS_HEALED,
  FILTER_LINEAR,
} from "./healing";
export type { FontHealingOptions, FontLoadEventLike, HealableText } from "./healing";
export { ttWorldText, cameraCssZoom, scaleTo } from "./worldText";
export type { TTWorldText } from "./worldText";
