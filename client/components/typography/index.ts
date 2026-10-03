/**
 * Typography runtime (plan F4), the Phaser-free half. Safe for the landing, SSR and 2D canvases.
 * The Phaser half (`TTFontsFile`, `preloadTTFonts`, `ttText`, `ttStyle`, `ttFit`,
 * `installFontHealing`) lives in `components/Phaser/typography/` and is imported only by scenes.
 */
export {
  TYPE_ROLES,
  TYPE_ROLE_NAMES,
  FONT_STACKS,
  BARK,
  applyRoleCase,
  familyStack,
  isTypeRole,
  roleFaces,
  roleSize,
} from "./roles";
export type { RoleCase, TypeRole, TypeRoleSpec } from "./roles";
export {
  GAME_FONT_TIMEOUT_MS,
  LATIN_EXT_SAMPLE,
  LATIN_SAMPLE,
  createGameFontLoader,
  faceDescriptor,
  gameFontsResult,
  loadGameFonts,
} from "./loadGameFonts";
export type {
  FontSetLike,
  GameFontLoadResult,
  GameFontLoader,
  GameFontLoaderOptions,
  GameFontStatus,
} from "./loadGameFonts";
export { ttCanvasFont } from "./canvasFont";
export type { CanvasFontOptions } from "./canvasFont";
export { FALLBACK_FAMILIES, FONT_FILES, PRELOAD_FONT_FILES } from "./fonts.generated";
export type { FontFileEntry } from "./fonts.generated";
