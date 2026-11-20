import { expect, type Frame, type Page } from '@playwright/test';

/**
 * Settings from Home (founder Nov 20): Home has no Settings button any more; the profile chip opens the Profile screen,
 * whose Settings button (beside Edit profile) opens the panel. `tap`: touch taps instead of clicks.
 */
export async function openSettingsFromHome(scope: Page | Frame, tap = false): Promise<void> {
  const chip = scope.locator('.pl-home [data-testid="home-profile"]').first();
  if (tap) await chip.tap();
  else await chip.click();
  const btn = scope.locator('[data-testid="profile-settings"]');
  if (tap) await btn.tap();
  else await btn.click();
  await expect(scope.locator('.pl-settings')).toBeVisible();
}
