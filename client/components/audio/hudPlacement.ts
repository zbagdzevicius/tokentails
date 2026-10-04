/**
 * Where the lobby's sound and settings buttons sit: a row on the right, under the ABOUT ME plate
 * (GameStatsSection, at `HUD_TOP` / `HUD_RIGHT`, about 4.95rem tall), so the right column ends
 * level with the left one's stats panel. Settings comes first (GameOptionsModal), then the mute
 * toggle (GameSelect).
 *
 * All offsets include the safe-area insets, like the corner panels themselves, so the column stays
 * attached to ABOUT ME on notched phones. components/game/lobbyLayout.ts mirrors these numbers.
 */
export const HUD_AUDIO_COLUMN = "fixed z-30";
/** The corner panels' top edge: 1rem, or below the status bar / notch. */
export const HUD_TOP = "max(1rem, env(safe-area-inset-top))";
/** The corner panels' side insets: 1rem, or clear of a landscape camera cutout. */
export const HUD_LEFT = "max(1rem, env(safe-area-inset-left))";
export const HUD_RIGHT = "max(1rem, env(safe-area-inset-right))";
/** The 44 px buttons (at least 44 px, growing with the root size on large screens). */
const HUD_BUTTON = "max(44px, 2.75rem)";
/** Settings and sound sit in one row under ABOUT ME, right-aligned with it: sound outermost. */
export const HUD_MUTE_RIGHT = HUD_RIGHT;
/** Settings: left of the sound button, with a 0.5rem gap. */
export const HUD_SETTINGS_RIGHT = `calc(${HUD_RIGHT} + ${HUD_BUTTON} + 0.5rem)`;
/** ABOUT ME (about 4.95rem) plus a 0.55rem gap. */
export const HUD_SETTINGS_TOP = `calc(${HUD_TOP} + 5.5rem)`;
/** The same row. */
export const HUD_MUTE_TOP = HUD_SETTINGS_TOP;
