/**
 * Where the lobby's sound and settings buttons sit: a column on the right, under the ABOUT ME plate
 * (GameStatsSection, `fixed top-4 right-4`, about 88 px tall), mirroring PROGRESS on the left.
 * Settings comes first (GameOptionsModal), the mute toggle under it (GameSelect).
 */
export const HUD_AUDIO_COLUMN = "fixed z-30";
/** Centred under ABOUT ME (`right-4`, `w-20`): the 44 px buttons sit in the middle of its column. */
export const HUD_AUDIO_RIGHT = "calc(1rem + (5rem - 44px) / 2)";
/**
 * Anchored like ABOUT ME itself (`top-4`, no safe-area offset), so the column stays attached to it
 * on notched phones. If ABOUT ME gains a safe-area offset, add it to both values here.
 */
export const HUD_SETTINGS_TOP = "calc(1rem + 88px)";
/** 44 px button plus an 8 px gap below Settings. */
export const HUD_MUTE_TOP = "calc(1rem + 140px)";
