import { expect, test, type Frame } from '@playwright/test';
import { mockHost, openHost } from './host';

// Sign-in: the account chip joins the lobby's top-right corner (ui/account.ts). At the no-scroll phone sizes
// (no-scroll.spec.ts) the corner, chip included, stays inside the viewport, keeps 40 px touch targets and never
// covers the left column; the page still never scrolls. Signed out ("Sign in") and signed in with a long name, in
// the web host (Games button) and the app (no Games button, isApp).

const SIZES = [
  { name: '667x375', width: 667, height: 375 },
  { name: '844x390', width: 844, height: 390 },
  { name: '667x300', width: 667, height: 300 },
];

async function cornerProblems(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const items = [...document.querySelectorAll<HTMLElement>('.lb-corner > *')].filter((e) => e.offsetParent !== null);
    for (const e of items) {
      const r = e.getBoundingClientRect();
      const label = e.getAttribute('aria-label') ?? e.className;
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`${label} off screen`);
      if (r.height + 0.5 < 40) out.push(`${label} ${Math.round(r.height)} px tall`);
      // Home's other controls (the profile, the nameplate, the promo, the left stack) must not sit under the corner
      for (const c of document.querySelectorAll<HTMLElement>('.hm-profile, .hm-cur, .hm-plate, .hm-promo, .hm-left .hm-round')) {
        if (c.offsetParent === null) continue;
        const b = c.getBoundingClientRect();
        if (b.right > r.left + 1 && b.left < r.right - 1 && b.bottom > r.top + 1 && b.top < r.bottom - 1)
          out.push(`${label} covers ${c.getAttribute('aria-label') ?? c.textContent?.trim().slice(0, 16)}`);
      }
    }
    if ((document.scrollingElement?.scrollHeight ?? 0) > innerHeight) out.push('page scrolls');
    if ((document.scrollingElement?.scrollWidth ?? 0) > innerWidth) out.push('page scrolls sideways');
    return out;
  });
}

for (const size of SIZES) {
  test.describe(`account chip at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'the sizes are set per test'));

    for (const variant of [
      { name: 'web, signed out', app: { isApp: false, store: true }, signedIn: false },
      { name: 'web, signed in', app: { isApp: false, store: true }, signedIn: true },
      { name: 'app, signed in', app: { isApp: true, store: false }, signedIn: true },
    ]) {
      test(variant.name, async ({ context, page, baseURL }) => {
        test.setTimeout(90_000);
        await mockHost(context, baseURL!, { app: variant.app, signedIn: variant.signedIn, name: 'Bartholomew Whiskerton' });
        const game = await openHost(page);
        await game.waitForSelector('html[data-screen="title"] .pl-home');
        await expect(game.locator('[data-testid="account-chip"]')).toBeVisible();
        await game.waitForTimeout(500);
        expect(await cornerProblems(game)).toEqual([]);
      });
    }
  });
}
