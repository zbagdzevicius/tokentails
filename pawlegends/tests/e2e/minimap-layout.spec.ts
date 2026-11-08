import { expect, test, type Page } from '@playwright/test';

// MAP-GAPS A5 + feel pass B2/B3: the touch minimap is square (it turns with the diagonal camera), 104 px on a
// 667x375 phone and 112 px at 844x390 (M), top left at 80% opacity, and S / M / L scale it. At every size the
// minimap, the emote chip, the enemy portraits, the kill feed, the strip and the ability buttons never overlap (the
// paw sits on the minimap's corner by design).

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function boxes(page: Page, sel: string): Promise<Box[]> {
  return page.evaluate((s) => {
    return [...document.querySelectorAll<HTMLElement>(s)]
      .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  }, sel);
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch layout'));

for (const [width, height, mw, mh] of [
  [667, 375, 104, 104],
  [844, 390, 112, 112],
] as const) {
  for (const size of ['s', 'm', 'l'] as const) {
    test(`${width}x${height} minimap ${size.toUpperCase()}: sized, opaque, nothing overlaps`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(
        ([s]) => {
          localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', veteran: true, unlocks: ['emote.wave'] }));
          localStorage.setItem('pawlegends.minimap.size', s);
        },
        [size],
      );
      await page.goto('/?e2e=1');
      await page.waitForSelector('html[data-screen="title"]');
      await page.locator('.pl-btn.big').first().click();
      await page.waitForSelector('html[data-match="live"]');
      await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
      await expect(page.locator('.pl-touch.on')).toBeVisible();
      await page.evaluate(() => {
        document.querySelector('.pl-feed')!.innerHTML = [
          '<div class="pl-feed-row good"><b style="color:#ffd34d">You</b><span></span><b style="color:#ff4d5e">Sir Brutus</b></div>',
          '<div class="pl-feed-row bad"><b style="color:#ff4d5e">Cacklejaw</b><span></span><b style="color:#3fd0c9">Sage</b></div>',
        ].join('');
      });
      const mm = (await boxes(page, '.pl-minimap'))[0];
      const k = { s: 0.82, m: 1, l: 1.2 }[size];
      expect(Math.abs(mm.width - mw * k)).toBeLessThan(5);
      expect(Math.abs(mm.height - mh * k)).toBeLessThan(5);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.pl-minimap')!).opacity)).toBe('0.8');
      expect(mm.x).toBeLessThan(20);
      expect(mm.y).toBeLessThan(20);
      // every conditional piece up (the match toggles them per frame)
      await page.addStyleTag({ content: "html[data-touch='1'] .pl-match .pl-top .pl-strip.enemy .pp { display: block !important; } html[data-touch='1'] .pl-match .pl-tbtn.gone { display: grid !important; }" });
      const paw = await boxes(page, '.pl-pingbtn');
      const emote = await boxes(page, '.pl-emote');
      const enemy = await boxes(page, '.pl-top .pl-strip.enemy .pp');
      const feed = await boxes(page, '.pl-feed-row');
      const buttons = await boxes(page, '.pl-tbtn');
      const score = await boxes(page, '.pl-score');
      const all: [string, Box[]][] = [
        ['minimap', [mm]],
        ['paw', paw],
        ['emote', emote],
        ['enemy', enemy],
        ['feed', feed],
        ['buttons', buttons],
        ['score', score],
      ];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++)
          for (const a of all[i][1])
            for (const b of all[j][1]) {
              if (all[i][0] === 'minimap' && all[j][0] === 'paw') continue;
              expect(overlaps(a, b), `${all[i][0]} ${JSON.stringify(a)} vs ${all[j][0]} ${JSON.stringify(b)}`).toBe(false);
            }
      await page.screenshot({ path: `test-results/minimap-layout/${width}x${height}-${size}.png` });
    });
  }
}
