import { expect, test, type Page } from '@playwright/test';

// MATCH-CHAT.md §4.1, §8: the in-match chat ticker on phones. Two lines in it (and two kill feed rows) at 667x375 and
// 844x390, minimap S / M / L, with and without the emote chip: the ticker never touches the minimap, the feed, the
// ability cluster and its buttons, the enemy portraits, the paw button or the emote chip. The open drawer never covers
// the ability cluster or the left joystick half.

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function boxes(page: Page, sel: string): Promise<Box[]> {
  return page.evaluate((s) => {
    return [...document.querySelectorAll<HTMLElement>(s)]
      .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .filter((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  }, sel);
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch layout'));

async function startMatch(page: Page, width: number, height: number, size: 's' | 'm' | 'l', emote: boolean): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.addInitScript(
    ([s, e]) => {
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', veteran: true, unlocks: e ? ['emote.wave'] : [] }));
      localStorage.setItem('pawlegends.minimap.size', s);
    },
    [size, emote] as const,
  );
  await page.goto('/?e2e=1', { timeout: 120_000 });
  await page.waitForSelector('html[data-screen="title"]', { timeout: 120_000 });
  await page.locator('.pl-btn.big').first().click({ timeout: 120_000 });
  await page.waitForSelector('html[data-match="live"]', { timeout: 240_000 });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), undefined, { timeout: 120_000 });
  await expect(page.locator('.pl-touch.on')).toBeVisible();
}

for (const [width, height] of [
  [667, 375],
  [844, 390],
] as const) {
  for (const size of ['s', 'm', 'l'] as const) {
    for (const emote of [true, false]) {
      test(`${width}x${height} minimap ${size.toUpperCase()}${emote ? ' + emote' : ''}: the chat ticker overlaps nothing`, async ({ page }) => {
        test.setTimeout(480_000);
        await startMatch(page, width, height, size, emote);
        if (emote) await expect(page.locator('.pl-emote')).toBeVisible();
        await page.evaluate(() => {
          document.querySelector('.pl-feed')!.innerHTML = [
            '<div class="pl-feed-row good"><b style="color:#ffd34d">You</b><span></span><b style="color:#ff4d5e">Sir Brutus</b></div>',
            '<div class="pl-feed-row bad"><b style="color:#ff4d5e">Cacklejaw</b><span></span><b style="color:#3fd0c9">Sage</b></div>',
          ].join('');
          const chat = (window as unknown as { __plChat: { debugLine(slot: number, text: string, ch?: string): void; layout(): void } }).__plChat;
          chat.layout();
          chat.debugLine(1, 'nice push mid, keep going team');
          chat.debugLine(4, 'gl hf', 'all');
        });
        await page.waitForTimeout(700);
        // every conditional piece up (the match toggles them per frame)
        await page.addStyleTag({ content: "html[data-touch='1'] .pl-match .pl-top .pl-strip.enemy .pp { display: block !important; } html[data-touch='1'] .pl-match .pl-tbtn.gone { display: grid !important; }" });
        await page.evaluate(() => (window as unknown as { __plChat: { layout(): void } }).__plChat.layout());
        const rows = await boxes(page, '.pl-chatline .cl-row');
        expect(rows.length).toBeGreaterThanOrEqual(1);
        const others: [string, Box[]][] = [
          ['minimap', await boxes(page, '.pl-minimap')],
          ['paw', await boxes(page, '.pl-pingbtn')],
          ['emote', await boxes(page, '.pl-emote')],
          ['enemy', await boxes(page, '.pl-top .pl-strip.enemy .pp')],
          ['feed', await boxes(page, '.pl-feed-row')],
          ['buttons', await boxes(page, '.pl-tbtn')],
          ['cluster', await boxes(page, '.pl-tcluster')],
          ['score', await boxes(page, '.pl-score')],
        ];
        for (const r of rows)
          for (const [name, list] of others)
            for (const b of list) expect(overlaps(r, b), `chat row ${JSON.stringify(r)} vs ${name} ${JSON.stringify(b)}`).toBe(false);
        // the rows stay on screen and right-aligned with the feed
        for (const r of rows) expect(r.x + r.width).toBeLessThanOrEqual(width);

        // the drawer (a tap on the ticker) stays clear of the ability cluster and the joystick half
        // a fresh line, then a tap on it (rows fade after 8 s, and a loaded machine is slow)
        await page.evaluate(() => {
          (window as unknown as { __plChat: { debugLine(slot: number, text: string): void } }).__plChat.debugLine(1, 'open me');
          document.querySelector('.pl-chatline .cl-row:last-child')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        });
        await expect(page.locator('[data-testid="chat-drawer"]')).toBeVisible();
        const drawer = (await boxes(page, '[data-testid="chat-drawer"]'))[0];
        expect(drawer.x).toBeGreaterThanOrEqual(width / 2 - 1);
        for (const b of [...(await boxes(page, '.pl-tcluster')), ...(await boxes(page, '.pl-tbtn'))]) expect(overlaps(drawer, b), `drawer vs cluster ${JSON.stringify(b)}`).toBe(false);
        // its chips are 44 px tap targets, and the page never scrolls
        const chip = (await boxes(page, '[data-testid="chat-drawer"] .cd-chip'))[0];
        expect(chip.height).toBeGreaterThanOrEqual(43.5);
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      });
    }
  }
}
