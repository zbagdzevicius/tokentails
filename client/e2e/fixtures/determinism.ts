import type { Page } from "@playwright/test";

/** The instant every test starts at (UTC). Date-dependent UI (seasons, countdowns) reads this. */
export const FIXED_NOW = new Date("2026-09-30T12:00:00.000Z");

/** Default `Math.random` seed. Override per test with `test.use({ randomSeed })`. */
export const DEFAULT_RANDOM_SEED = 20260930;

/**
 * Replaces `Math.random` with a seeded mulberry32 before any page script runs, so shuffles, NPC
 * spawns and particle layouts repeat run to run. Runs in the page, so it must stay self-contained.
 */
export function seedMathRandom(seed: number): void {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pins the page clock at `FIXED_NOW` and seeds `Math.random`. Time keeps flowing from that instant
 * (timers and requestAnimationFrame still run); call `page.clock.pauseAt` in a test that needs a
 * frozen frame.
 */
export async function makeDeterministic(
  page: Page,
  { now = FIXED_NOW, seed = DEFAULT_RANDOM_SEED }: { now?: Date; seed?: number } = {},
): Promise<void> {
  await page.clock.install({ time: now });
  await page.addInitScript(seedMathRandom, seed);
}
