/**
 * Pink Paw (Rožinė pėdutė), the showcase shelter, in the "Sent to shelters" modal: its real logo and
 * its real cats, each as its Token Tails card art with the shelter's own photo of the cat.
 *
 * The cats come from the same place as the web gallery on /shelter-payouts and /impact: the
 * uncapped gallery (`GET {api}/shelter/rozine-pedute/gallery`), checked by the shared selection
 * (shared/pink-paw.ts), so the modal and the website always show the same cats. An older backend
 * without it gives the storefront (`GET {api}/cat/sale`, at most the newest 200 cats per shelter,
 * so its count is then "of the newest"). Every cat still at the shelter is listed, a page at a
 * time. When the API cannot be reached (standalone builds, offline), the modal falls back to
 * four local copies (public/assets/images/pink-paw/, resized from the CDN on 3 Oct 2026), which
 * `npm run check:pink-paw` keeps honest. No status ("waiting for a home") is shown on those copies:
 * a local copy cannot know when a cat is adopted.
 */
import { parsePinkPawGalleryBody, pinkPawGalleryPath, storefrontGalleryResult, type PinkPawGalleryCat } from '../shared-contracts/pink-paw';
import { h } from './dom';
import { HEIST_BODY_FONT } from './fonts.generated';

export type { PinkPawGalleryCat };

/** Folder under the asset base. */
export const PINK_PAW_DIR = 'images/pink-paw/';

export const PINK_PAW_LOGO_ALT = "Rožinė pėdutė (Pink Paw) shelter logo: a cat's paw holding a daisy";

export interface PinkPawCat {
  /** The cat's id in the Token Tails backend (its page is /cats/<id>). */
  id: string;
  name: string;
  /** File stem under PINK_PAW_DIR: `<file>-card.webp` and `<file>-photo.webp`. */
  file: string;
}

/** The offline fallback: four cats shipped as local copies. */
export const PINK_PAW_CATS: readonly PinkPawCat[] = [
  { id: '6a3055e21d6649b19b03688a', name: 'Judas', file: 'judas' },
  { id: '6a3050201d6649b19b0365ec', name: 'Raudvis', file: 'raudvis' },
  { id: '6a304f0e1d6649b19b036534', name: 'Zare', file: 'zare' },
  { id: '6a304e8f1d6649b19b036500', name: 'Simas', file: 'simas' },
];

/** Tiles shown at first, and added by each "Show more". */
export const PINK_PAW_PAGE = 6;

export const pinkPawLogoSrc = (base: string) => `${base}${PINK_PAW_DIR}logo.webp`;

/** The bundled cats as gallery cats, with their images under the asset base. */
export function bundledPinkPawCats(base: string): PinkPawGalleryCat[] {
  return PINK_PAW_CATS.map((c) => ({
    id: c.id,
    name: c.name,
    status: null,
    art: `${base}${PINK_PAW_DIR}${c.file}-card.webp`,
    photo: `${base}${PINK_PAW_DIR}${c.file}-photo.webp`,
  }));
}

/** Where the modal's cats came from: the live gallery (or storefront), or the bundled copies. */
export interface PinkPawCatList {
  cats: PinkPawGalleryCat[];
  source: 'live' | 'bundled';
  /** False when the list may be cut (the storefront fallback at its cap): the count then says "newest". */
  complete?: boolean;
}

type Fetch = (input: string, init?: { signal?: AbortSignal; credentials?: 'omit' }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * The shelter's cats still at the shelter: `GET {apiUrl}/shelter/rozine-pedute/gallery` (every
 * cat), else `GET {apiUrl}/cat/sale` (the newest 200), both through the shared selection. Never
 * rejects: no API, errors, a timeout or an empty list give the bundled copies.
 */
export async function fetchPinkPawCats(apiUrl: string, base: string, f: Fetch | undefined = globalThis.fetch as unknown as Fetch, timeoutMs = 6000): Promise<PinkPawCatList> {
  const bundled: PinkPawCatList = { cats: bundledPinkPawCats(base), source: 'bundled' };
  if (!apiUrl || !f) return bundled;
  const api = apiUrl.replace(/\/+$/, '');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  const get = async (path: string): Promise<unknown> => {
    try {
      const res = await f(`${api}${path}`, { signal: ctl?.signal, credentials: 'omit' });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  try {
    const body = await get(pinkPawGalleryPath());
    const gallery = parsePinkPawGalleryBody(body);
    if (gallery) {
      const complete = (body as { truncated?: unknown }).truncated !== true;
      return gallery.atShelter.length ? { cats: gallery.atShelter, source: 'live', complete } : bundled;
    }
    // An older backend: the storefront, which stops at the newest 200 cats per shelter.
    const sale = await get('/cat/sale');
    if (!sale) return bundled;
    const fallback = storefrontGalleryResult(sale);
    return fallback.atShelter.length ? { cats: fallback.atShelter, source: 'live', complete: fallback.complete } : bundled;
  } finally {
    clearTimeout(timer);
  }
}

let cachedCats: Promise<PinkPawCatList> | null = null;

/** The modal's cats, fetched once per page load (a bundled fallback is retried on the next open). */
export function loadPinkPawCats(apiUrl: string, base: string, f?: Fetch): Promise<PinkPawCatList> {
  const p = (cachedCats ??= fetchPinkPawCats(apiUrl, base, f));
  void p.then((r) => {
    if (r.source === 'bundled' && cachedCats === p) cachedCats = null;
  });
  return p;
}

/** Test hook: forget the cached cats. */
export function resetPinkPawCatsCache(): void {
  cachedCats = null;
}

/**
 * A cat's page on the Token Tails site, resolved against the payouts page URL (same site). Null when
 * the build has no site link (standalone builds set HEIST_PAYOUTS_URL to ''), so tiles do not link.
 */
export function pinkPawCatUrl(siteUrl: string | undefined, id: string, here?: string): string | null {
  if (!siteUrl) return null;
  try {
    // The client build passes a same-site path ('/shelter-payouts'): resolve it against the page.
    const page = here ?? (typeof location !== 'undefined' ? location.href : undefined);
    return new URL(`/cats/${id}`, new URL(siteUrl, page)).href;
  } catch {
    return null;
  }
}

/**
 * Passion One has no Lithuanian ogonek, caron-c or dot-above letters (client/lib/glyphs.ts). A name
 * with one is set whole in the body face, a size down so it matches the display captions beside it.
 */
const DISPLAY_MISSING_GLYPHS = /[ĄąČčĘęĖėĮįŲųŪū]/;
export const needsBodyFont = (text: string | null | undefined): boolean => !!text && DISPLAY_MISSING_GLYPHS.test(text);

/** One tile: the card art and the shelter's real photo side by side, at the same size. */
function catTile(cat: PinkPawGalleryCat, siteUrl?: string): HTMLElement {
  const href = pinkPawCatUrl(siteUrl, cat.id);
  const figure = h(
    'figure',
    null,
    h(
      'div.ch-pp-pair',
      null,
      h('img.ch-pp-art', { src: cat.art, alt: `${cat.name}'s Token Tails card`, loading: 'lazy', decoding: 'async', draggable: 'false' }),
      h('img.ch-pp-photo', { src: cat.photo, alt: `Photo of ${cat.name} at the Pink Paw shelter`, loading: 'lazy', decoding: 'async', draggable: 'false' }),
      cat.status === 'RECOVERING' ? h('span.ch-pp-chip', null, 'Recovering') : null,
    ),
    h(needsBodyFont(cat.name) ? 'figcaption.ch-pp-body' : 'figcaption', null, href ? `Meet ${cat.name} ›` : cat.name),
  );
  return h(
    'li.ch-pp-cat',
    { 'data-testid': 'pink-paw-cat' },
    href ? h('a.ch-pp-link', { href, target: '_blank', rel: 'noopener', 'data-testid': 'pink-paw-cat-link' }, figure) : figure,
  );
}

/**
 * The real Pink Paw cats for the modal: a page of tiles, then "Show more". `siteUrl` (the payouts
 * page) turns on the cat links. Pass the bundled copies (the default) or a live list.
 */
export function pinkPawCats(base: string, cats: readonly PinkPawGalleryCat[] = bundledPinkPawCats(base), siteUrl?: string, page = PINK_PAW_PAGE, complete = true): HTMLElement {
  const row = h('ul.ch-pp-row', { 'aria-label': 'Pink Paw cats' });
  const count = h('p.ch-pp-count', { 'aria-live': 'polite', 'data-testid': 'pink-paw-count' });
  const more = h('button.ch-btn.ch-ghost.ch-pp-more', { type: 'button', 'data-testid': 'pink-paw-more' }) as HTMLButtonElement;
  let shown = 0;
  const grow = () => {
    const next = cats.slice(shown, shown + page);
    row.append(...next.map((c) => catTile(c, siteUrl)));
    shown += next.length;
    const left = cats.length - shown;
    more.hidden = left <= 0;
    more.replaceChildren(h('span', null, `Show ${Math.min(page, left)} more cats`));
    count.textContent = cats.length > page ? (complete ? `Showing ${shown} of ${cats.length} cats at the shelter` : `Showing ${shown} of the ${cats.length} newest cats at the shelter`) : '';
  };
  more.addEventListener('click', () => {
    const before = shown;
    grow();
    // Keep keyboard users in place: focus the first new cat's link (or the button if none).
    const first = row.children[before]?.querySelector('a') as HTMLElement | null;
    first?.focus({ preventScroll: false });
  });
  grow();
  return h(
    'div.ch-pp',
    { 'data-testid': 'pink-paw-cats' },
    h('p.ch-pp-note', null, 'Real cats from the shelter: their Token Tails card, and the photo the shelter took.'),
    row,
    h('div.ch-pp-foot', null, more, count),
  );
}

/** Styles for the row and the logo badge (added to the modal's stylesheet). */
export const PINK_PAW_CSS = /* copy-lint-ignore R2 a stylesheet, not visible copy */ `
.ch-pay-shelter .ch-pp-head { display: flex; align-items: center; gap: 12px; margin: 2px 0 8px; }
.ch-pay-shelter .ch-pp-logo { flex: none; width: 76px; height: 76px; padding: 4px; box-sizing: border-box; border-radius: 50%; background: #fff; border: 3px solid var(--tt-cream); object-fit: contain;
  box-shadow: 0 0 16px rgba(255,204,85,.35), 0 3px 0 var(--tt-night-950); }
.ch-pay-shelter .ch-pp-head h3 { margin: 0; }
.ch-pp { margin-top: 2px; }
.ch-pp-note { margin: 0 0 10px; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 13px; line-height: 1.35; color: var(--tt-lilac); letter-spacing: 0; }
.ch-pp-row { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ch-pp-cat figure { margin: 0; }
.ch-pp-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ch-pp-art, .ch-pp-photo { display: block; width: 100%; aspect-ratio: 671 / 1000; object-fit: cover; border-radius: 10px; border: 2px solid var(--tt-cream); background: var(--tt-night-700);
  box-shadow: 0 3px 0 var(--tt-night-950); }
.ch-pp-photo { background: var(--tt-cream); }
.ch-pp-cat figcaption { margin-top: 6px; text-align: center; font-family: 'Passion One', 'Cat Paw', ui-rounded, system-ui, sans-serif; font-weight: 700; font-size: 15px; line-height: 1; letter-spacing: .03em; text-transform: uppercase; color: var(--tt-cream); }
.ch-pp-cat figcaption.ch-pp-body { font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 12.5px; letter-spacing: .01em; }
.ch-pp-link { display: block; color: inherit; text-decoration: none; border-radius: 12px; }
.ch-pp-link figcaption { color: var(--tt-gold); text-decoration: underline dotted; text-underline-offset: 4px; }
.ch-pp-link:hover figcaption { color: var(--tt-cream); }
.ch-pp-link:focus-visible { outline: 3px solid var(--tt-gold); outline-offset: 3px; }
.ch-pp-pair { position: relative; }
.ch-pp-chip { position: absolute; top: 4px; right: 4px; padding: 2px 6px; border-radius: 6px; border: 2px solid var(--tt-cream); background: rgba(11,8,32,.9);
  font-family: 'Passion One', 'Cat Paw', ui-rounded, system-ui, sans-serif; font-weight: 700; font-size: 11px; line-height: 1; letter-spacing: .04em; text-transform: uppercase; color: var(--tt-cream); }
.ch-pp-foot { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 12px; }
.ch-pp-more { min-height: 44px; padding: 8px 18px; font-size: 16px; }
.ch-pp-more[hidden] { display: none; }
.ch-pp-count { margin: 0; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 12px; color: var(--tt-muted); letter-spacing: 0; }
.ch-pp-count:empty { display: none; }
.ch-pay-shelter .ch-pp-local { margin: 4px 0 0; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 13px; line-height: 1.2; color: var(--tt-lilac); letter-spacing: 0; }
@media (prefers-reduced-motion: no-preference) {
  .ch-pp-pair img { transition: transform .2s ease; }
  .ch-pp-link:hover .ch-pp-pair img { transform: translateY(-2px); }
}
`;
