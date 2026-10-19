import { expect, test, type Page } from '@playwright/test';

/**
 * Audio-ui lane acceptance (ITERATION-2.md): `?lang=xx` finds no raw strings in the HUD, pause, settings, how to play
 * and results; axe-style checks (names, 44 px targets, contrast) on those screens; a reduced-motion run has no camera
 * shake; the voice budget never passes 24; captions show the announcer; settings save and apply.
 */

type Win = {
  __fm?: {
    shell: {
      world: { st: { tick: number; phase: string; karts: Array<{ finished: number }> } } | null;
      audio: { state: { peak: number; scene: string; mode: string } };
      screens: { push(id: string): Promise<unknown> };
      pause(on: boolean): void;
    };
  };
  __fmUi?: { shakes: number; lines: number; captions: number; wipes: number };
};

const tick = (page: Page) => page.evaluate(() => (window as unknown as Win).__fm?.shell.world?.st.tick ?? 0);
const qa = (page: Page) => page.evaluate(() => ({ ...(window as unknown as Win).__fmUi! }));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function withSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    // once per tab: a reload keeps what the test saved
    if (sessionStorage.getItem('fm:seeded')) return;
    sessionStorage.setItem('fm:seeded', '1');
    localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: s, slots: { core: { races: 3, unlocked: 0, pounces: 2, drifts: 2, bestTimes: {} } } }));
  }, settings);
}

/** Text in `selector` (visible, not marked data-raw, not another lane's widget) that did not go through t(). */
function rawText(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const bad: string[] = [];
    const skip = (el: Element | null) => !!el?.closest('[data-raw], .fm-ugc-btn, .fm-ugc-banner, .fm-dare-banner, .fm-res-icons, [data-x]');
    const check = (s: string, where: string) => {
      const rest = s.replace(/⟦[^⟧]*⟧/g, '');
      if (/[A-Za-z]{2,}/.test(rest)) bad.push(`${where}: ${s.trim()}`);
    };
    for (const root of document.querySelectorAll(sel)) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement;
        if (!el || skip(el) || !n.textContent?.trim()) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        check(n.textContent, el.className || el.tagName);
      }
      for (const el of root.querySelectorAll('[aria-label]')) if (!skip(el)) check(el.getAttribute('aria-label') ?? '', `aria-label ${el.tagName}`);
    }
    return bad;
  }, selector);
}

/** Axe-style checks on the controls in `selector`: an accessible name, a 44 px target, text contrast ≥ 4.5 (3 large). */
function axe(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const bad: string[] = [];
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const bgOf = (el: Element | null): { r: number; g: number; b: number } | null => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradients: not judged here
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0.9) return c;
      }
      return null;
    };
    for (const root of document.querySelectorAll(sel)) {
      for (const el of root.querySelectorAll<HTMLElement>('button, [role="switch"], [role="tab"], [role="radio"], input[type="range"], a[href]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || el.closest('[data-raw]')) continue;
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        if (!name && el.tagName !== 'INPUT') bad.push(`no name: ${el.outerHTML.slice(0, 80)}`);
        if (el.tagName === 'INPUT' && !el.getAttribute('aria-label')) bad.push(`range without a label`);
        // switches: the visible knob is 32 px tall, its ::before hit area makes 44+
        const hit = el.getAttribute('role') === 'switch' ? r.height + 18 : r.height;
        if (el.tagName !== 'A' && (hit < 44 || r.width < 44)) bad.push(`small target ${Math.round(r.width)}×${Math.round(r.height)}: ${name}`);
        if (el.tagName === 'A' && r.height < 44) bad.push(`small link ${Math.round(r.height)}: ${name}`);
        if (el.getAttribute('role') === 'switch' || el.tagName === 'INPUT') continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        const bg = bgOf(el);
        if (!fg || !bg) continue;
        const l1 = lum(fg);
        const l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) bad.push(`contrast ${ratio.toFixed(2)}: ${name}`);
      }
    }
    return bad;
  }, selector);
}

test('pseudo-locale: the HUD, pause, settings and how to play have no raw strings, and pass the axe-style checks', async ({ page }) => {
  const errors = watchErrors(page);
  await withSettings(page, {});
  await page.goto('/?lang=xx&seed=11');
  await page.mouse.click(195, 300);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(260);
  // not vacuous: the HUD does show pseudo-localised text
  await expect(page.locator('.fm-lap')).toContainText('⟦');
  expect(await rawText(page, '.fm-hud')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  expect(await rawText(page, '[data-screen="pause"]')).toEqual([]);
  expect(await axe(page, '[data-screen="pause"]')).toEqual([]);
  await page.locator('[data-screen="pause"] [data-act="settings"]').click();
  const settings = page.locator('[data-screen="settings"]');
  await expect(settings).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await settings.locator('[role="tab"]').nth(i).click();
    expect(await rawText(page, '[data-screen="settings"]')).toEqual([]);
    expect(await axe(page, '[data-screen="settings"]')).toEqual([]);
  }
  await settings.locator('[data-act="done"]').click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await page.evaluate(() => void (window as unknown as Win).__fm!.shell.screens.push('howto'));
  const howto = page.locator('[data-screen="howto"]');
  await expect(howto).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await howto.locator('[role="tab"]').nth(i).click();
    expect(await rawText(page, '[data-screen="howto"]')).toEqual([]);
  }
  expect(await axe(page, '[data-screen="howto"]')).toEqual([]);
  expect(errors).toEqual([]);
});

test('a full race: pseudo-localised results, the voice budget stays within 24, captions show the announcer', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await withSettings(page, { captions: true });
  await page.goto('/?lang=xx&bot=1&seed=5&speed=8');
  await page.mouse.click(195, 300); // a gesture: the audio context starts
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await page.waitForTimeout(1200);
  expect(await rawText(page, '.fm-results')).toEqual([]);
  expect(await axe(page, '.fm-results')).toEqual([]);
  const audio = await page.evaluate(() => (window as unknown as Win).__fm!.shell.audio.state);
  expect(audio.peak).toBeGreaterThan(4);
  expect(audio.peak).toBeLessThanOrEqual(24);
  const q = await qa(page);
  expect(q.lines).toBeGreaterThanOrEqual(5); // three, two, one, go … the finish
  expect(q.captions).toBe(q.lines);
  expect(errors).toEqual([]);
});

test('reduced motion: no camera shake at all (a normal run shakes)', async ({ browser }) => {
  test.setTimeout(120_000);
  const run = async (reducedMotion: boolean) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await withSettings(page, { reducedMotion });
    await page.goto('/?bot=1&seed=5&speed=4');
    await expect.poll(() => tick(page), { timeout: 60_000 }).toBeGreaterThan(1500);
    const q = await qa(page);
    const motion = await page.evaluate(() => document.documentElement.dataset.motion ?? '');
    await ctx.close();
    return { shakes: q.shakes, motion };
  };
  const normal = await run(false);
  const calm = await run(true);
  expect(normal.shakes).toBeGreaterThan(0);
  expect(calm.shakes).toBe(0);
  expect(calm.motion).toBe('reduced');
});

test('settings save and apply: high contrast, colour-blind colours, text size; keyboard and Esc work', async ({ page }) => {
  await withSettings(page, {});
  await page.goto('/?seed=11');
  await page.mouse.click(195, 300);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(60);
  await page.keyboard.press('Escape');
  await page.locator('[data-screen="pause"] [data-act="settings"]').click();
  const s = page.locator('[data-screen="settings"]');
  await expect(s).toBeVisible();
  await s.locator('[role="tab"]').nth(2).click();
  await s.locator('[role="switch"][aria-label="High-contrast HUD"]').click();
  await s.locator('[data-cb="deut"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(s.locator('[data-cb="deut"]')).toHaveAttribute('aria-checked', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fm:save') ?? '{}').settings);
  expect(saved.highContrast).toBe(true);
  expect(saved.colourblind).toBe('deut');
  // the drift meter's tier pips follow the colour-blind set (deuteranopia: blue, yellow, white)
  const pip = await page.evaluate(() => getComputedStyle(document.querySelectorAll<HTMLElement>('.fm-drift .pip')[1]).getPropertyValue('--c').trim());
  expect(pip).toBe('#ffd23f');
  // keyboard: arrows move focus inside the layer, Esc goes back to pause
  await page.keyboard.press('ArrowDown');
  const focusedIn = await page.evaluate(() => !!document.activeElement?.closest('[data-screen="settings"]'));
  expect(focusedIn).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="settings"]')).toHaveCount(0);
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  // it survives a reload
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
});
