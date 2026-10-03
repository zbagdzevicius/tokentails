/**
 * Pure helpers of the reel capture driver (no Playwright import, so Jest can test them).
 */

/** The game's simulation rate: `__TT_CAPTURE__.step()` advances whole frames of 1000/60 ms. */
export const GAME_HZ = 60;

/**
 * Whole game frames to step for one video frame at `fps`, carrying the fraction forward:
 * at 24 fps that is 2, 3, 2, 3 ... (2.5 on average), so the clip plays at real speed. Flooring
 * 2.5 to 2 every time ran the game at 80% (task 6d review, finding 5).
 */
export function framesForVideoFrame(owed: number, fps: number): { step: number; owed: number } {
  const total = owed + GAME_HZ / fps;
  const step = Math.floor(total + 1e-9);
  return { step, owed: total - step };
}

/**
 * Hides every DOM overlay (touch D-pad, jump and ability buttons, CLOSE, GO BACK / SHELTER,
 * toasts, the dev badge) and keeps only the game canvas (or the Heist iframe) and its ancestors
 * (task 6d review, finding 3). Runs in the page: marks every element that neither is nor contains
 * the game surface, then one style rule hides the marked ones. Hiding `body *` and showing the
 * canvas again blanked the WebGL canvas in Chrome, so ancestors are left alone.
 */
export function hideAllButGame(selector: string): number {
  const keep = Array.from(document.querySelectorAll(selector));
  let hidden = 0;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (keep.some((k) => k === el || el.contains(k) || k.contains(el))) continue;
    el.setAttribute("data-capture-hide", "");
    hidden += 1;
  }
  const style = document.createElement("style");
  style.textContent = "[data-capture-hide]{visibility:hidden!important}nextjs-portal{display:none!important}";
  document.head.appendChild(style);
  return hidden;
}

/** The game surface of a clip: the Phaser canvas, or the Heist iframe. */
export const gameSelector = (clipId: string) => (clipId === "heist" ? "iframe[src*='/heist-game/']" : "canvas");

/** The capture profile's touch settings (playwright.capture.config.ts uses these). */
export const CAPTURE_VIEWPORT_NOTE = { isMobile: false, hasTouch: false } as const;
