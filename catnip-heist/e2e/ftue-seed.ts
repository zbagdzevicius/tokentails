import type { Page } from '@playwright/test';

/** localStorage key of the first-run memory (src/onboarding/ftue-store.ts). */
export const FTUE_KEY = 'catnip-heist.ftue.v1';
export const ALL_LEVELS = ['heist-01', 'heist-02', 'heist-03', 'heist-04', 'heist-05', 'heist-06', 'heist-07', 'heist-08'];

/**
 * Marks every level brief as seen before the page loads, so specs that are not about the first run
 * start playing at once (the brief card holds the sim clock until it is closed). Runs in every frame.
 */
export async function seedFtueSeen(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, levels]) => {
      try {
        if (!localStorage.getItem(key as string)) localStorage.setItem(key as string, JSON.stringify({ v: 1, briefs: levels, routeTaps: 0, rewinds: 0 }));
      } catch {
        /* storage blocked: the brief shows, specs that care close it */
      }
    },
    [FTUE_KEY, ALL_LEVELS] as const,
  );
}
