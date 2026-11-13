/**
 * Champion and skin ART (images) for every UI surface (founder, Nov 13: "we show too much of champs look rendered
 * rather than images in in-game UI"). Menus, cards and the HUD show painted pictures; the 3D models are for the match
 * (and the champion browser's skill clips) only.
 *
 * - Face (`assets/faces/<hero>-256.webp`, in the game bundle, ≈7 KB each): every small and medium picture of a hero
 *   (HUD, pick tiles and seats, cards, avatars, the minimap, the profile ring).
 * - Splash (`assets/splash/<hero>-360|720.webp`, in the bundle): the hero in its default look on a big surface (the
 *   Home, pick and results stage, the champion browser, the store).
 * - Skin art (`pawlegends-art/skins/<skin id>-256|360|720.webp`, the brand-book skins library): one face and one 4:5
 *   splash per coat id in `SKIN_ART_IDS`. 14 MB, so it is served by pawlegends.app beside the game, outside the 10 MB
 *   game budget (tools/import-skin-art.mjs), and loaded lazily. The native app (capacitor://localhost,
 *   https://localhost) and other hosts read it from https://pawlegends.app. Offline or before a deploy, a skin shows
 *   the hero's own face or splash: `faceFor` returns a skin face only once it has loaded (`warmLooks`), and big
 *   pictures stack the skin over the hero's splash (`artLayers`), or carry `data-fallback` (`artImg`).
 *
 * Every URL ends in `assetRev()` (`?v=<build sha>`, a CDN-cached 404 is refetched by the next build) and is absolute,
 * so it works inside a CSS custom property too (a relative url() there resolves against the CSS chunk).
 */
import type { HeroId } from '../sim/api';
import { assetRev } from './assetRev';
import { SKIN_ART_IDS } from './art/skinArt.gen';

/** A look as the art needs it: only the worn coat or skin item id matters (chromas and card skins have no art). */
type LookLike = { coat?: string | null } | null | undefined;

const BASE: string = String(import.meta.env.BASE_URL ?? './');

/** `p` made absolute against the page (unchanged outside a browser, e.g. unit tests). */
function abs(p: string): string {
  try {
    return typeof document !== 'undefined' && document.baseURI ? new URL(p, document.baseURI).href : p;
  } catch {
    return p;
  }
}

/** The hosts that serve pawlegends-web themselves (the art is same-origin there). */
const WEB_HOSTS: readonly string[] = ['pawlegends.app', 'www.pawlegends.app'];
export const ART_ORIGIN = 'https://pawlegends.app';

/** Where the skin art lives: `/pawlegends-art/` on pawlegends.app itself, else the absolute pawlegends.app folder. */
export function artRoot(host: string | null = typeof location !== 'undefined' ? location.hostname : null): string {
  return host && WEB_HOSTS.includes(host) ? abs('/pawlegends-art/') : `${ART_ORIGIN}/pawlegends-art/`;
}

/** The skin item id of a look when it has painted art, else null (default look, chroma only, card skins, legacy ids). */
export const skinArtId = (look: LookLike): string | null => {
  const c = look?.coat ?? null;
  return c && SKIN_ART_IDS.has(c) ? c : null;
};

/** The hero's face (bundle). */
export const heroFaceUrl = (hero: HeroId): string => abs(`${BASE}assets/faces/${hero}-256.webp${assetRev()}`);

/** The hero's default splash (bundle), 360 or 720 px wide. */
export const heroSplashUrl = (hero: HeroId, w: 360 | 720 = 720): string => abs(`${BASE}assets/splash/${hero}-${w}.webp${assetRev()}`);

/** A skin's face (256²) or splash (4:5, 360 or 720 wide) on pawlegends.app. */
export const skinArtUrl = (id: string, size: 256 | 360 | 720): string => `${artRoot()}skins/${encodeURIComponent(id)}-${size}.webp${assetRev()}`;

// ------------------------------------------------------------------------------------------------- real-cat photos
/**
 * The real Pink Paw shelter cats behind the four shelter champions (founder, Nov 13: "we must drop pixel art, if we
 * have real cat photo, we should use it"): one photo each, cropped on the face, served by pawlegends.app beside the
 * skin art (`pawlegends-web/public/pawlegends-art/real/<hero>-<size>.webp`, ≤ 34 KB each), outside the game bundle.
 * `alt` describes the real animal (screen readers hear the cat, not the champion drawing). The other heroes are
 * made-up characters (no dog is a shelter dog), so they have no photo.
 */
export const REAL_PHOTOS: Readonly<Partial<Record<HeroId, { alt: string }>>> = Object.freeze({
  lambo: { alt: 'Lambo, a real dark brown tabby cat, resting in his kennel at the Pink Paw shelter' }, // copy-lint-ignore R13 photo alt text naming the real cat's home, no donation or money claim
  aviete: { alt: 'Aviete, a real black-and-white tuxedo cat, lying on a grey blanket next to a pink toy at the Pink Paw shelter' }, // copy-lint-ignore R13 photo alt text naming the real cat's home, no donation or money claim
  bengas: { alt: 'Bengas, a real Bengal cat with a spotted golden coat, licking his nose in his crate at the Pink Paw shelter' }, // copy-lint-ignore R13 photo alt text naming the real cat's home, no donation or money claim
  gabe: { alt: 'Gabe, a real seal-point Siamese cat with blue eyes, peeking out of a cat house at the Pink Paw shelter' }, // copy-lint-ignore R13 photo alt text naming the real cat's home, no donation or money claim
});

/** Photo sizes on pawlegends.app: square (256, 512) and 4:5 portrait (`4x5-256` is 204×256, `4x5-512` is 409×512). */
export type RealPhotoSize = 256 | 512 | '4x5-256' | '4x5-512';

/** Whether `hero` is one of the real shelter cats that have a photo. */
export const hasRealPhoto = (hero: string): hero is HeroId => Object.prototype.hasOwnProperty.call(REAL_PHOTOS, hero);

/** The real cat's photo of `hero` on pawlegends.app, or null for a made-up hero (no photo exists). */
export function realPhotoUrl(hero: string, size: RealPhotoSize = '4x5-512'): string | null {
  return hasRealPhoto(hero) ? `${artRoot()}real/${hero}-${size}.webp${assetRev()}` : null;
}

export interface RealPhoto {
  src: string;
  srcset: string;
  alt: string;
  /** The champion's painted splash (bundle): shown when the photo cannot load (offline, before a deploy). */
  fallback: string;
}

/** A real cat's photo as `<img>` values (4:5 unless `square`), or null for a hero without one. */
export function realPhoto(hero: string, o: { square?: boolean } = {}): RealPhoto | null {
  if (!hasRealPhoto(hero)) return null;
  const small = realPhotoUrl(hero, o.square ? 256 : '4x5-256') as string;
  const big = realPhotoUrl(hero, o.square ? 512 : '4x5-512') as string;
  const [ws, wb] = o.square ? [256, 512] : [204, 409];
  return { src: big, srcset: `${small} ${ws}w, ${big} ${wb}w`, alt: REAL_PHOTOS[hero]?.alt ?? '', fallback: heroSplashUrl(hero, 360) };
}

/**
 * `<img>` attributes for a real cat's photo: lazy, the real-cat `alt`, and the champion's painted splash as
 * `data-fallback` (`installArtFallback` swaps it in on a load error). Null without a photo.
 */
export function realPhotoImgAttrs(hero: string, o: { square?: boolean; sizes?: string } = {}): string | null {
  const p = realPhoto(hero, o);
  if (!p) return null;
  return `src="${attr(p.src)}" srcset="${attr(p.srcset)}" sizes="${attr(o.sizes ?? '160px')}" alt="${attr(p.alt)}" loading="lazy" decoding="async" draggable="false" data-fallback="${attr(p.fallback)}"`;
}

// ------------------------------------------------------------------------------------------------- loading state
/** Skin faces known to have loaded / to have failed (missing on the server, offline). */
const loaded = new Set<string>();
const failed = new Set<string>();
const loading = new Map<string, Array<() => void>>();
const listeners = new Set<(id: string) => void>();

/** Runs `cb` whenever any skin face finishes loading (a screen redraws its faces). Returns the unsubscribe. */
export function onSkinArt(cb: (id: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Starts loading the skin faces of these looks (no-op for looks without art, loaded or failed ones); `onReady` runs
 * once for every face that arrives, so a screen can swap it in. Never throws; nothing happens outside a browser.
 */
export function warmLooks(looks: readonly LookLike[], onReady?: (id: string) => void): void {
  if (typeof Image === 'undefined') return;
  for (const l of looks) {
    const id = skinArtId(l);
    if (!id || loaded.has(id) || failed.has(id)) continue;
    const waiting = loading.get(id);
    if (waiting) {
      if (onReady) waiting.push(() => onReady(id));
      continue;
    }
    const cbs: Array<() => void> = onReady ? [() => onReady(id)] : [];
    loading.set(id, cbs);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loaded.add(id);
      loading.delete(id);
      for (const cb of cbs) cb();
      for (const cb of listeners) cb(id);
    };
    img.onerror = () => {
      failed.add(id);
      loading.delete(id);
    };
    img.src = skinArtUrl(id, 256);
  }
}

/** Whether a look's face is final: no skin art, or its art loaded (false while it loads or after it failed). */
export const faceReady = (look: LookLike): boolean => {
  const id = skinArtId(look);
  return !id || loaded.has(id);
};

/** The face to show for `hero` in `look`: its skin face once loaded, else the hero's own face. Always a URL. */
export function faceFor(hero: HeroId, look?: LookLike): string {
  const id = skinArtId(look);
  if (id && loaded.has(id)) return skinArtUrl(id, 256);
  if (id && !failed.has(id)) warmLooks([look]);
  return heroFaceUrl(hero);
}

/** The big picture of `hero` in `look`: the skin splash when the look has art, else the hero's splash. */
export function splashFor(hero: HeroId, look?: LookLike, w: 360 | 720 = 720): string {
  const id = skinArtId(look);
  return id && !failed.has(id) ? skinArtUrl(id, w) : heroSplashUrl(hero, w);
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** `url('…')` with nothing that could close it (single-quoted, so it also fits a double-quoted style attribute). */
const cssU = (u: string): string => `url('${u.replace(/['"()\\\s<>;]/g, '')}')`;

/**
 * A `background-image` value: the skin splash over the hero's splash (the hero's shows when the skin is missing).
 * Safe inside a double-quoted `style` attribute.
 */
export function artLayers(hero: HeroId, look?: LookLike, w: 360 | 720 = 720): string {
  const top = splashFor(hero, look, w);
  const under = heroSplashUrl(hero, w);
  return top === under ? cssU(under) : `${cssU(top)},${cssU(under)}`;
}

/**
 * `<img>` source attributes for the big picture: `src` (+ `srcset` 360/720 unless `low`), and `data-fallback` (the
 * hero's splash) when it is skin art from pawlegends.app (`installArtFallback` swaps it in on a load error).
 */
export function artImgAttrs(hero: HeroId, look: LookLike, o: { low?: boolean; sizes?: string } = {}): string {
  const s360 = splashFor(hero, look, 360);
  const s720 = splashFor(hero, look, 720);
  const fb = skinArtId(look) && !failed.has(skinArtId(look) as string) ? ` data-fallback="${attr(heroSplashUrl(hero, o.low ? 360 : 720))}"` : '';
  if (o.low) return `src="${attr(s360)}"${fb}`;
  return `src="${attr(s720)}" srcset="${attr(s360)} 360w, ${attr(s720)} 720w" sizes="${attr(o.sizes ?? '50vw')}"${fb}`;
}

/**
 * `<img>` source attributes for a face in a look: the skin's painted face (pawlegends.app) with the hero's face as its
 * `data-fallback`, or the hero's face when the look has no art.
 */
export function faceImgAttrs(hero: HeroId, look: LookLike): string {
  const id = skinArtId(look);
  if (!id || failed.has(id)) return `src="${attr(heroFaceUrl(hero))}"`;
  return `src="${attr(skinArtUrl(id, 256))}" data-fallback="${attr(heroFaceUrl(hero))}"`;
}

let fallbackOn = false;
/**
 * One document listener (capture: `error` does not bubble): an `<img data-fallback>` that fails to load takes its
 * fallback (once). Safe to call again.
 */
export function installArtFallback(doc: Document | null = typeof document !== 'undefined' ? document : null): void {
  if (!doc || fallbackOn) return;
  fallbackOn = true;
  doc.addEventListener(
    'error',
    (e) => {
      const img = e.target as HTMLImageElement | null;
      if (!img || img.tagName !== 'IMG') return;
      const fb = img.getAttribute('data-fallback');
      if (!fb) return;
      img.removeAttribute('data-fallback');
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = fb;
    },
    true,
  );
}

/** Tests only: forget what loaded. */
export function resetArtState(): void {
  loaded.clear();
  failed.clear();
  loading.clear();
  fallbackOn = false;
}
/** Tests only: mark a skin face as loaded (or failed). */
export function markArt(id: string, ok: boolean): void {
  (ok ? loaded : failed).add(id);
}
