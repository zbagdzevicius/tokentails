// @vitest-environment happy-dom
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PINK_PAW_CATS, PINK_PAW_DIR, pinkPawCatUrl, pinkPawCats, pinkPawLogoSrc } from '../pink-paw';
import { createPayoutsModal, type PayoutsModal } from '../shelter-payouts';

const PUBLIC_ASSETS = resolve(__dirname, '../../../public/assets/');

describe('Pink Paw assets', () => {
  it('ships the logo and both images of every cat in public/assets', () => {
    expect(existsSync(resolve(PUBLIC_ASSETS, PINK_PAW_DIR, 'logo.webp'))).toBe(true);
    for (const c of PINK_PAW_CATS) {
      expect(existsSync(resolve(PUBLIC_ASSETS, PINK_PAW_DIR, `${c.file}-card.webp`)), c.file).toBe(true);
      expect(existsSync(resolve(PUBLIC_ASSETS, PINK_PAW_DIR, `${c.file}-photo.webp`)), c.file).toBe(true);
      expect(c.id).toMatch(/^[0-9a-f]{24}$/);
    }
  });

  it('renders a card and a described photo per cat, under the asset base', () => {
    const el = pinkPawCats('/a/');
    const tiles = el.querySelectorAll('[data-testid=pink-paw-cat]');
    expect(tiles.length).toBe(PINK_PAW_CATS.length);
    const imgs = [...el.querySelectorAll('img')];
    expect(imgs.every((i) => i.getAttribute('src')!.startsWith('/a/images/pink-paw/'))).toBe(true);
    expect(imgs.every((i) => (i.getAttribute('alt') ?? '').length > 0)).toBe(true);
    expect(el.textContent).toContain('Judas');
    expect(pinkPawLogoSrc('/a/')).toBe('/a/images/pink-paw/logo.webp');
  });
});

describe('Pink Paw cat links', () => {
  it("links each cat to its page on the site, resolving a same-site payouts path", () => {
    expect(pinkPawCatUrl('/shelter-payouts', 'abc', 'https://tokentails.com/heist-game/')).toBe('https://tokentails.com/cats/abc');
    expect(pinkPawCatUrl('https://tokentails.com/shelter-payouts', 'abc')).toBe('https://tokentails.com/cats/abc');
    const el = pinkPawCats('/a/', PINK_PAW_CATS, 'https://tokentails.com/shelter-payouts');
    const links = [...el.querySelectorAll('a[data-testid=pink-paw-cat-link]')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(PINK_PAW_CATS.map((c) => `https://tokentails.com/cats/${c.id}`));
    expect(links.every((a) => a.target === '_blank' && a.rel.includes('noopener'))).toBe(true);
    expect(el.textContent).toContain('Meet Judas ›');
  });

  it('has no links in a standalone build (no site URL)', () => {
    expect(pinkPawCatUrl('', 'abc')).toBeNull();
    const el = pinkPawCats('/a/');
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelectorAll('.ch-pp-photo').length).toBe(PINK_PAW_CATS.length);
  });
});

describe('payouts modal with Pink Paw', () => {
  let modal: PayoutsModal | null = null;
  afterEach(() => {
    modal?.dispose();
    modal = null;
    document.body.innerHTML = '';
  });
  const empty = async () => ({ status: 'empty' as const, totals: new Map<string, bigint>(), chains: [], payouts: [] });

  it("shows the shelter's logo and its cats", async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', load: empty });
    await modal.show();
    const logo = modal.el.querySelector('[data-testid=pink-paw-logo]') as HTMLImageElement;
    expect(logo.getAttribute('src')).toBe('/a/images/pink-paw/logo.webp');
    expect(logo.getAttribute('alt')).toMatch(/Rožinė pėdutė/);
    // The display heading carries the English name only; the Lithuanian name is a body-font line.
    expect(modal.el.querySelector('.ch-pp-head h3')!.textContent).toBe('Pink Paw');
    expect(modal.el.querySelector('.ch-pp-local')!.textContent).toBe('Rožinė pėdutė');
    expect(modal.el.querySelectorAll('[data-testid=pink-paw-cat]').length).toBe(PINK_PAW_CATS.length);
  });

  it('can turn the Pink Paw block off', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', load: empty, pinkPaw: false });
    await modal.show();
    expect(modal.el.querySelector('[data-testid=pink-paw-logo]')).toBeNull();
    expect(modal.el.querySelector('[data-testid=pink-paw-cats]')).toBeNull();
  });
});
