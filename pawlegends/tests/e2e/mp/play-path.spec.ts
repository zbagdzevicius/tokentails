import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { closeAll, player, tap, title, type Kind, type Player } from './party.helpers';

test.afterEach(closeAll);

/*
 * The one play path against the relay harness (docs/plans/moba/HOME-MODES.md §5, Nov 12; the founder: "there should
 * be one path. PLAY -> SELECT MODE -> SELECT VARIANT"). A returning player at 844x390 (touch) and 1440x900:
 *   PLAY → Skirmish → Co-op → Find match: the queue card (co-op);
 *   PLAY → Skirmish → PvP → Find match: the PvP queue card;
 *   PLAY → Skirmish → With Friends → Open party: the party lobby with its code (not a match).
 * With the relay up every variant of Skirmish can start. PLAY_SHOTS=1 saves each step to
 * ~/Downloads/paw-legends/play-flow/ (the bots steps: tests/e2e/home-modes.spec.ts).
 */
const SHOTS = process.env.PLAY_SHOTS ? `${homedir()}/Downloads/paw-legends/play-flow` : '';
const shot = async (p: Player, step: string): Promise<void> => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const v = p.page.viewportSize()!;
  await p.page.screenshot({ path: `${SHOTS}/${step}-${v.width}x${v.height}.png`, timeout: 60_000 });
};

/** PLAY → Skirmish → the variant stage, every variant open (the relay answered the PvP check). */
async function toVariants(p: Player): Promise<void> {
  await expect(p.page.locator('.pl-home[data-variants="bots coop pvp friends"]')).toBeVisible({ timeout: 30_000 });
  await tap(p, p.page.locator('[data-testid="home-play"]'));
  await tap(p, p.page.locator('[data-testid="mode-skirmish"]'));
  await tap(p, p.page.locator('[data-testid="mode-next"]'));
  await expect(p.page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'variant');
  for (const v of ['bots', 'coop', 'pvp', 'friends']) await expect(p.page.locator(`[data-testid="variant-${v}"]`)).not.toHaveAttribute('aria-disabled', 'true');
}

for (const kind of ['phone', 'desktop'] as Kind[]) {
  test(`${kind}: Skirmish → Co-op, PvP and With Friends each reach their queue or the party lobby`, async ({ browser }) => {
    test.setTimeout(300_000);
    const p = await player(browser, kind);
    await title(p);
    await toVariants(p);
    await tap(p, p.page.locator('[data-testid="variant-coop"]'));
    await expect(p.page.locator('[data-testid="mode-go"]')).toHaveText('Find match');
    await shot(p, '3b-variant-coop');
    await tap(p, p.page.locator('[data-testid="mode-go"]'));
    const q = p.page.locator('[data-testid="mm-queue"]');
    await expect(q).toBeVisible({ timeout: 15_000 });
    await expect(q).not.toHaveAttribute('data-mode', 'pvp');
    await shot(p, '5-coop-queue');
    await tap(p, p.page.locator('[data-testid="mm-cancel"]'));
    await p.page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 15_000 });

    await toVariants(p);
    // PLAY reopens on the remembered variant (Co-op)
    await expect(p.page.locator('[data-testid="variant-coop"]')).toHaveAttribute('aria-checked', 'true');
    await tap(p, p.page.locator('[data-testid="variant-pvp"]'));
    await tap(p, p.page.locator('[data-testid="mode-go"]'));
    await expect(p.page.locator('[data-testid="mm-queue"][data-mode="pvp"], [data-testid="mm-accept-card"]').first()).toBeVisible({ timeout: 15_000 });
    await shot(p, '6-pvp-queue');
    await tap(p, p.page.locator('[data-testid="mm-cancel"]'));
    await p.page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 15_000 });

    await toVariants(p);
    await tap(p, p.page.locator('[data-testid="variant-friends"]'));
    await expect(p.page.locator('[data-testid="mode-go"]')).toHaveText('Open party');
    await tap(p, p.page.locator('[data-testid="mode-go"]'));
    await expect(p.page.locator('[data-testid="party-code"]')).toBeVisible({ timeout: 30_000 });
    // a party lobby, not a match
    await expect(p.page.locator('html')).not.toHaveAttribute('data-match', 'live');
    await shot(p, '7-friends-party-lobby');
    await tap(p, p.page.locator('[data-testid="party-leave"]'));
  });
}
