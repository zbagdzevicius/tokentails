/**
 * Pink Paw (Rožinė pėdutė), the showcase shelter, in the "Sent to shelters" modal: its real logo and
 * four of its real cats, each as its Token Tails card art with the shelter's own photo of the cat.
 *
 * The images are local copies (public/assets/images/pink-paw/), resized from the Token Tails CDN
 * (the shelter's `rozine-pedute` cats in GET /cat/sale, 3 Oct 2026), so standalone builds that
 * cannot load the CDN still show them. The client pages read the same cats live from the
 * storefront. No status ("waiting for a home") is shown here: a local copy cannot know when a cat
 * is adopted.
 */
import { h } from './dom';
import { HEIST_BODY_FONT } from './fonts.generated';

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

export const PINK_PAW_CATS: readonly PinkPawCat[] = [
  { id: '6a3055e21d6649b19b03688a', name: 'Judas', file: 'judas' },
  { id: '6a3050201d6649b19b0365ec', name: 'Raudvis', file: 'raudvis' },
  { id: '6a304f0e1d6649b19b036534', name: 'Zare', file: 'zare' },
  { id: '6a304e8f1d6649b19b036500', name: 'Simas', file: 'simas' },
];

export const pinkPawLogoSrc = (base: string) => `${base}${PINK_PAW_DIR}logo.webp`;

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

/** One tile: the card art and the shelter's real photo side by side, at the same size. */
function catTile(base: string, cat: PinkPawCat, siteUrl?: string): HTMLElement {
  const href = pinkPawCatUrl(siteUrl, cat.id);
  const figure = h(
    'figure',
    null,
    h(
      'div.ch-pp-pair',
      null,
      h('img.ch-pp-art', { src: `${base}${PINK_PAW_DIR}${cat.file}-card.webp`, alt: `${cat.name}'s Token Tails card`, loading: 'lazy', draggable: 'false' }),
      h('img.ch-pp-photo', { src: `${base}${PINK_PAW_DIR}${cat.file}-photo.webp`, alt: `Photo of ${cat.name} at the Pink Paw shelter`, loading: 'lazy', draggable: 'false' }),
    ),
    h('figcaption', null, href ? `Meet ${cat.name} ›` : cat.name),
  );
  return h(
    'li.ch-pp-cat',
    { 'data-testid': 'pink-paw-cat' },
    href ? h('a.ch-pp-link', { href, target: '_blank', rel: 'noopener', 'data-testid': 'pink-paw-cat-link' }, figure) : figure,
  );
}

/** The row of real Pink Paw cats for the shelter card. `siteUrl` (the payouts page) turns on the cat links. */
export function pinkPawCats(base: string, cats: readonly PinkPawCat[] = PINK_PAW_CATS, siteUrl?: string): HTMLElement {
  return h(
    'div.ch-pp',
    { 'data-testid': 'pink-paw-cats' },
    h('p.ch-pp-note', null, 'Real cats from the shelter: their Token Tails card, and the photo the shelter took.'),
    h('ul.ch-pp-row', { 'aria-label': 'Pink Paw cats' }, ...cats.map((c) => catTile(base, c, siteUrl))),
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
.ch-pp-link { display: block; color: inherit; text-decoration: none; border-radius: 12px; }
.ch-pp-link figcaption { color: var(--tt-gold); text-decoration: underline dotted; text-underline-offset: 4px; }
.ch-pp-link:hover figcaption { color: var(--tt-cream); }
.ch-pp-link:focus-visible { outline: 3px solid var(--tt-gold); outline-offset: 3px; }
.ch-pay-shelter .ch-pp-local { margin: 4px 0 0; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 13px; line-height: 1.2; color: var(--tt-lilac); letter-spacing: 0; }
@media (prefers-reduced-motion: no-preference) {
  .ch-pp-pair img { transition: transform .2s ease; }
  .ch-pp-link:hover .ch-pp-pair img { transform: translateY(-2px); }
}
`;
