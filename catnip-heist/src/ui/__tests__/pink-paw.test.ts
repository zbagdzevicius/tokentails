// @vitest-environment happy-dom
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PINK_PAW_CATS, PINK_PAW_DIR, PINK_PAW_PAGE, bundledPinkPawCats, fetchPinkPawCats, needsBodyFont, pinkPawCatUrl, pinkPawCats, pinkPawLogoSrc, type PinkPawGalleryCat } from '../pink-paw';
import { PINK_PAW_SLUG, STOREFRONT_SHELTER_CAP } from '../../shared-contracts/pink-paw';
import { createPayoutsModal, goalDateLabel, type GoalCount, type PayoutsModal } from '../shelter-payouts';

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
    const el = pinkPawCats('/a/', bundledPinkPawCats('/a/'), 'https://tokentails.com/shelter-payouts');
    const links = [...el.querySelectorAll('a[data-testid=pink-paw-cat-link]')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(PINK_PAW_CATS.map((c) => `https://tokentails.com/cats/${c.id}`));
    expect(links.every((a) => a.target === '_blank' && a.rel.includes('noopener'))).toBe(true);
    expect(el.textContent).toContain('Meet Judas ›');
  });

  it('sets a Lithuanian name in the body face, so it matches the display captions', () => {
    const cats: PinkPawGalleryCat[] = [
      { ...bundledPinkPawCats('/a/')[0], name: 'Ankštė' },
      { ...bundledPinkPawCats('/a/')[1], name: 'Judas' },
    ];
    const el = pinkPawCats('/a/', cats);
    const caps = [...el.querySelectorAll('figcaption')];
    expect(caps[0].classList.contains('ch-pp-body')).toBe(true);
    expect(caps[1].classList.contains('ch-pp-body')).toBe(false);
    expect(needsBodyFont('Šarka')).toBe(false);
    expect(needsBodyFont('Anykštė')).toBe(true);
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

  it('says the goal once: in the meter, with the goal date under the bar', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', load: empty });
    await modal.show();
    const shelter = modal.el.querySelector('[data-testid=payouts-shelter]')!;
    expect(shelter.textContent!.match(/50,000 USDC/g)?.length).toBe(1);
    expect(shelter.querySelector('[data-testid=payouts-goal-date]')?.textContent).toBe('Goal date: 30 Sep 2027');
    expect(goalDateLabel('2027-09-30')).toBe('30 Sep 2027');
    expect(goalDateLabel('soon')).toBeNull();
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

// ---------- one cat list with the website (shared/pink-paw.ts) ----------

const hexId = (n: number) => n.toString(16).padStart(24, '0');
const saleCat = (n: number, name: string, status: string) => ({
  _id: hexId(n),
  name,
  blessing: { name, status, image: { url: `https://cdn.example/${n}-p.webp` }, catAvatar: { url: `https://cdn.example/${n}-a.webp` } },
});
const sale = (n: number) => ({
  [PINK_PAW_SLUG]: [
    ...Array.from({ length: n }, (_, i) => saleCat(i + 1, `cat${String(i + 1).padStart(2, '0')}`, i === 0 ? 'RECOVERING' : 'WAITING')),
    saleCat(900, 'gone', 'ADOPTED'),
    saleCat(901, 'angel', 'HEAVEN'),
  ],
});
const okJson = (body: unknown) => async () => ({ ok: true, json: async () => body });

describe('Pink Paw cats from the storefront', () => {
  it('reads GET {api}/cat/sale through the shared selection: every cat still at the shelter', async () => {
    const urls: string[] = [];
    const f = async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => sale(9) };
    };
    const list = await fetchPinkPawCats('http://api.test/', '/a/', f);
    // The uncapped gallery first; an older backend (no such body) gives the storefront.
    expect(urls).toEqual([`http://api.test/shelter/${PINK_PAW_SLUG}/gallery`, 'http://api.test/cat/sale']);
    expect(list.complete).toBe(true);
    expect(list.source).toBe('live');
    expect(list.cats.map((c) => c.name)).toEqual(Array.from({ length: 9 }, (_, i) => `Cat${String(i + 1).padStart(2, '0')}`));
    expect(list.cats[0]).toMatchObject({ status: 'RECOVERING', art: 'https://cdn.example/1-a.webp', photo: 'https://cdn.example/1-p.webp' });
    expect(list.cats.some((c) => c.name === 'Gone' || c.name === 'Angel')).toBe(false);
  });

  it('falls back to the bundled copies without an API, on an error or an empty list', async () => {
    expect((await fetchPinkPawCats('', '/a/', okJson(sale(3)))).source).toBe('bundled');
    expect((await fetchPinkPawCats('http://api.test', '/a/', async () => ({ ok: false, json: async () => ({}) }))).source).toBe('bundled');
    expect((await fetchPinkPawCats('http://api.test', '/a/', async () => { throw new Error('offline'); })).source).toBe('bundled');
    const empty = await fetchPinkPawCats('http://api.test', '/a/', okJson({ [PINK_PAW_SLUG]: [] }));
    expect(empty).toEqual({ source: 'bundled', cats: bundledPinkPawCats('/a/') });
  });

  it('shows a page of cats, then more on demand, with a count', async () => {
    const cats: PinkPawGalleryCat[] = (await fetchPinkPawCats('http://api.test', '/a/', okJson(sale(14)))).cats;
    const el = pinkPawCats('/a/', cats, 'https://tokentails.com/shelter-payouts');
    document.body.appendChild(el);
    const tiles = () => el.querySelectorAll('[data-testid=pink-paw-cat]').length;
    const more = el.querySelector('[data-testid=pink-paw-more]') as HTMLButtonElement;
    expect(tiles()).toBe(PINK_PAW_PAGE);
    expect(el.querySelector('[data-testid=pink-paw-count]')!.textContent).toBe(`Showing ${PINK_PAW_PAGE} of 14 cats at the shelter`);
    expect(more.hidden).toBe(false);
    more.click();
    expect(tiles()).toBe(12);
    // Focus moves to the first new cat, so a keyboard user carries on from there.
    expect(document.activeElement?.getAttribute('href')).toBe(`https://tokentails.com/cats/${cats[PINK_PAW_PAGE].id}`);
    more.click();
    expect(tiles()).toBe(14);
    expect(more.hidden).toBe(true);
    expect(el.textContent).toContain('Recovering');
    el.remove();
  });

  it('the bundled four need no "Show more"', () => {
    const el = pinkPawCats('/a/');
    expect((el.querySelector('[data-testid=pink-paw-more]') as HTMLButtonElement).hidden).toBe(true);
    expect(el.querySelector('[data-testid=pink-paw-count]')!.textContent).toBe('');
  });
});

describe('Pink Paw cats from the uncapped gallery', () => {
  const pub = (n: number, status: string) => ({ id: hexId(n), name: `Cat ${n}`, status, art: `https://cdn.example/${n}-a.webp`, photo: `https://cdn.example/${n}-p.webp` });

  it('reads GET {api}/shelter/rozine-pedute/gallery and never touches the storefront then', async () => {
    const urls: string[] = [];
    const body = { atShelter: Array.from({ length: 230 }, (_, i) => pub(i + 1, 'WAITING')), adopted: [pub(900, 'ADOPTED')], truncated: false };
    const list = await fetchPinkPawCats('http://api.test', '/a/', async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => body };
    });
    expect(urls).toEqual([`http://api.test/shelter/${PINK_PAW_SLUG}/gallery`]);
    expect(list).toMatchObject({ source: 'live', complete: true });
    expect(list.cats).toHaveLength(230);
    const el = pinkPawCats('/a/', list.cats, undefined, PINK_PAW_PAGE, list.complete);
    expect(el.querySelector('[data-testid=pink-paw-count]')!.textContent).toBe(`Showing ${PINK_PAW_PAGE} of 230 cats at the shelter`);
  });

  it('says "newest" when the storefront fallback reached its cap', async () => {
    const full = { [PINK_PAW_SLUG]: Array.from({ length: STOREFRONT_SHELTER_CAP }, (_, i) => saleCat(i + 1, `c${i}`, 'WAITING')) };
    const list = await fetchPinkPawCats('http://api.test', '/a/', async (url: string) =>
      url.endsWith('/gallery') ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => full },
    );
    expect(list).toMatchObject({ source: 'live', complete: false });
    const el = pinkPawCats('/a/', list.cats, undefined, PINK_PAW_PAGE, list.complete);
    expect(el.querySelector('[data-testid=pink-paw-count]')!.textContent).toBe(`Showing ${PINK_PAW_PAGE} of the ${STOREFRONT_SHELTER_CAP} newest cats at the shelter`);
  });
});

describe('payouts modal: live cats and the goal meter', () => {
  let modal: PayoutsModal | null = null;
  afterEach(() => {
    modal?.dispose();
    modal = null;
    document.body.innerHTML = '';
  });
  const empty = async () => ({ status: 'empty' as const, totals: new Map<string, bigint>(), chains: [], payouts: [] });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('renders the storefront cats from the same list as the website', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const cats = (await fetchPinkPawCats('http://api.test', '/a/', okJson(sale(8)))).cats;
    let asked = '';
    modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', base: '/a/', load: empty, catsApi: 'http://api.test',
      loadCats: async (api) => { asked = api; return { cats, source: 'live' }; },
    });
    await modal.show();
    await flush();
    expect(asked).toBe('http://api.test');
    const box = modal.el.querySelector('[data-testid=payouts-pink-paw]') as HTMLElement;
    expect(box.dataset.source).toBe('live');
    expect(box.querySelectorAll('[data-testid=pink-paw-cat]').length).toBe(PINK_PAW_PAGE);
    expect(box.querySelector('img.ch-pp-art')!.getAttribute('src')).toBe(cats[0].art);
  });

  it('retries a bundled cats fallback on the next open, and keeps a live list', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const lists = [
      { cats: [], source: 'bundled' as const },
      { cats: (await fetchPinkPawCats('http://api.test', '/a/', okJson(sale(3)))).cats, source: 'live' as const },
    ];
    let calls = 0;
    let online = false;
    modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', base: '/a/', load: empty, catsApi: 'http://api.test',
      loadCats: async () => (calls++, lists[online ? 1 : 0]),
    });
    await modal.show();
    await flush();
    const box = () => modal!.el.querySelector('[data-testid=payouts-pink-paw]') as HTMLElement;
    expect(box().dataset.source).toBe('bundled');
    modal.hide();
    online = true;
    const before = calls;
    await modal.show();
    await flush();
    expect(calls).toBeGreaterThan(before);
    expect(box().dataset.source).toBe('live');
    // A live list is kept: the next open reads nothing again.
    modal.hide();
    const kept = calls;
    await modal.show();
    await flush();
    expect(calls).toBe(kept);
    expect(box().dataset.source).toBe('live');
  });

  it('shows the goal from the count of what came in: amount, bar and share of 50,000', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const E18 = 10n ** 18n;
    modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', base: '/a/', load: empty,
      readGoal: async (): Promise<GoalCount> => ({ raised: 10n * E18 + 5n * 10n ** 17n, exact: true, sources: ['treats'] }),
    });
    await modal.show();
    await flush();
    const meter = modal.el.querySelector('[data-testid=payouts-goal]') as HTMLElement;
    expect(meter.dataset.state).toBe('ok');
    expect(meter.dataset.claim).toBe('C-001');
    expect(meter.querySelector('[data-testid=payouts-goal-value]')!.textContent).toBe('10.5 of the 50,000 USDC goal for Pink Paw');
    const bar = meter.querySelector('[role=progressbar]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('0.02');
    expect(bar.getAttribute('aria-valuetext')).toBe('0.02% of the goal');
    // Today only treats can reach the wallet Token Tails holds: the line never names the rest as counting.
    expect(meter.textContent).toContain('Counts what comes in to the wallet Token Tails holds for Pink Paw: today, sponsored treats.');
    expect(meter.textContent).toContain('Gifts, the match and x402 payments count once Pink Paw holds its own wallet.');
    expect(meter.textContent).not.toMatch(/shop shares/);
    // The goal is said once (the meter's value line); its date sits under the bar.
    expect(modal.el.querySelector('.ch-pay-goal')).toBeNull();
    expect(meter.querySelector('[data-testid=payouts-goal-date]')?.textContent).toBe('Goal date: 30 Sep 2027');
  });

  it('never shows 0 for a count it could not read, and says "at least" while the count catches up', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', load: empty, readGoal: async () => null });
    await modal.show();
    await flush();
    const meter = () => modal!.el.querySelector('[data-testid=payouts-goal]') as HTMLElement;
    expect(meter().dataset.state).toBe('error');
    expect(meter().querySelector('b')!.textContent).toBe('?');
    expect(meter().textContent).toContain("Can't read the count right now");
    modal.dispose();
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', load: empty, readGoal: async () => ({ raised: 3n * 10n ** 18n, exact: false, sources: ['treats'] }) });
    await modal.show();
    await flush();
    expect(meter().querySelector('b')!.textContent).toBe('at least 3');
    expect(meter().textContent).toContain('still counting older blocks');
  });

  it('repaints only the meter when the count lands, so focus stays on the give button', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let land: (c: GoalCount) => void = () => undefined;
    modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', base: '/a/', load: empty,
      giveCta: () => {
        const b = document.createElement('button');
        b.dataset.testid = 'give';
        return b;
      },
      readGoal: () => new Promise<GoalCount>((r) => (land = r)),
    });
    await modal.show();
    const give = modal.el.querySelector('[data-testid=give]') as HTMLButtonElement;
    give.focus();
    land({ raised: 10n ** 18n, exact: true, sources: ['treats'] });
    await flush();
    expect(modal.el.querySelector('[data-testid=payouts-goal]')!.getAttribute('data-state')).toBe('ok');
    expect(modal.el.querySelector('[data-testid=give]')).toBe(give);
    expect(document.activeElement).toBe(give);
  });
});
