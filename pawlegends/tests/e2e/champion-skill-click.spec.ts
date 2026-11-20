import { expect, test } from '@playwright/test';
import { ALL_CHAMPS, mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

// Founder, Nov 20: "if I click on skills here it results in screen rerendering". A tap on an ability chip (P Q W E R)
// on the champion screen ran the store's whole render: `root.innerHTML` rebuilt the screen, so the splash <img> was a
// new element (decoded again: a flash), the info column's scroll and the focus reset. Now a chip only moves the
// chosen state and swaps the line under the chips: the splash, the screen and every other node stay the same, and
// the "Abilities & lore" row does not move between a short and a long line.

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', side: 'cat', firstPlaySession: 1 };
const LOCKED = { ...ALL_CHAMPS, owned: ALL_CHAMPS.owned.filter((o) => o.hero !== 'meatball' && o.hero !== 'pixel'), founders: false, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null } };

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'one viewport is enough'));

for (const size of [{ width: 1440, height: 900 }, { width: 844, height: 390 }])
  test(`${size.width}x${size.height}: an ability chip changes only the chosen state and its line`, async ({ context, page, baseURL }) => {
    test.setTimeout(limit(120_000));
    await page.setViewportSize(size);
    await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED, champState: LOCKED, store: { items: [], season: null } });
    const game = await openHost(page);
    await game.addStyleTag({ content: '.pl-rotate{display:none!important}' });
    await game.locator('.hm-nav [data-a="store"]').click();
    const shop = game.locator('.pl-shop');
    await shop.locator('.cst-card[data-hero="meatball"]').click();
    const hd = shop.locator('.cst-hd');
    await expect(hd).toHaveAttribute('data-hero', 'meatball');
    await expect(hd.locator('.cst-skill')).toHaveCount(5);
    // watch the screen: every node the store adds or removes from here on, and every splash request
    await game.evaluate(() => {
      const w = window as unknown as { __mut: number; __img: Element | null; __panel: Element | null; __obs: MutationObserver };
      w.__img = document.querySelector('.cst-hd-art img');
      w.__panel = document.querySelector('.cst-hd');
      w.__mut = 0;
      w.__obs = new MutationObserver((recs) => {
        for (const r of recs) for (const n of [...r.addedNodes, ...r.removedNodes]) if (n.nodeType === 1 && !(n as Element).closest?.('.cst-skill-line')) w.__mut++;
      });
      w.__obs.observe(document.querySelector('.pl-shop')!, { childList: true, subtree: true });
    });
    const splash: string[] = [];
    page.on('request', (r) => {
      if (/assets\/splash\//.test(r.url()) && !/yarn\.svg/.test(r.url())) splash.push(r.url());
    });
    const links = hd.locator('.cst-hd-links');
    const y0 = (await links.boundingBox())!.y;
    const ys: number[] = [];
    const keys = ['P', 'Q', 'W', 'E', 'R'];
    for (const i of [2, 4, 0, 1, 3, 2]) {
      await hd.locator(`.cst-skill[data-skill="${i}"]`).click();
      await expect(hd.locator('.cst-skill-line .on .k')).toHaveText(keys[i]);
      await expect(hd.locator(`.cst-skill[data-skill="${i}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(hd.locator('.cst-skill[aria-pressed="true"]')).toHaveCount(1);
      ys.push((await links.boundingBox())!.y);
    }
    // the keyboard walks the kit too: the arrows from the focused chip, the letters anywhere on the screen
    await hd.locator('.cst-skill[data-skill="2"]').focus();
    await game.locator('body').press('ArrowRight');
    await expect(hd.locator('.cst-skill[data-skill="3"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(hd.locator('.cst-skill[data-skill="3"]')).toBeFocused();
    await game.locator('body').press('ArrowLeft');
    await expect(hd.locator('.cst-skill[data-skill="2"]')).toHaveAttribute('aria-pressed', 'true');
    await game.locator('body').press('r');
    await expect(hd.locator('.cst-skill[data-skill="4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(hd.locator('.cst-skill-line .on .k')).toHaveText('R');
    const r = await game.evaluate(() => {
      const w = window as unknown as { __mut: number; __img: Element | null; __panel: Element | null; __obs: MutationObserver };
      w.__obs.disconnect();
      return { sameImg: w.__img === document.querySelector('.cst-hd-art img'), samePanel: w.__panel === document.querySelector('.cst-hd'), mut: w.__mut };
    });
    expect(r.sameImg, 'the splash <img> is the same element').toBe(true);
    expect(r.samePanel, 'the screen is the same element').toBe(true);
    expect(r.mut, 'no node outside the ability line is added or removed').toBe(0);
    expect(splash, 'no splash request after the first draw').toEqual([]);
    for (const y of ys) expect(Math.abs(y - y0), 'the Abilities & lore row stays put').toBeLessThanOrEqual(1);
    // Escape still closes the screen, then the store
    await game.locator('body').press('Escape');
    await expect(hd).toHaveCount(0);
  });
