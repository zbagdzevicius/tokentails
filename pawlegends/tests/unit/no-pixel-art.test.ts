// @vitest-environment happy-dom
/**
 * No pixel art in Paw Legends (founder, Nov 13: "we must drop pixel art, if we have real cat photo, we should use it
 * in places like this instead of pixel art version of a cat"). Guards:
 * 1. no game source (or the pawlegends.app chrome) sets `image-rendering: pixelated | crisp-edges` or references a pixel
 *    sprite: Token Tails cat sprites and GIFs, the pixel-paw tier foil, the pixel-rescue art;
 * 2. no pixel asset ships in the game build (`public/assets`: no GIF, no `cards/tier/`);
 * 3. the "About <champion>" panel and the "Meet the real cat" postcards show the REAL cat's photo (pawlegends.app),
 *    with alt text that describes the real animal, and never the host's Token Tails card sprite.
 * The element icons are the brand-kit badges (public/assets/elements/), so nothing is allowed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { championInfo } from '../../src/ui/cards';
import { collectionPanel } from '../../src/ui/collection';
import { freshTreats } from '../../src/meta/treats';
import { REAL_PHOTOS, hasRealPhoto, realPhoto, realPhotoUrl } from '../../src/ui/art';
import { CHAMPION_IDS, SHELTER_CHAMPIONS } from '../../src/data/heroes/shelter';
import { HEROES } from '../../src/data/heroes';

const ROOT = resolve(__dirname, '../..');
const WEB = resolve(ROOT, '../pawlegends-web');

/** `image-rendering` values that draw pixel art, and pixel sprite sources. */
const PIXELATED = /image-rendering\s*:\s*(pixelated|crisp-edges|-moz-crisp-edges|optimizeSpeed)|imageRendering\s*[:=]\s*['"]?(pixelated|crisp-edges)/i;
const SPRITE = /assets\/sprites\/cats|\/cats\/[a-z]+\.png|catnip-heist\/promo|pixel-rescue|cards\/tier\/|\.gif\b/i;

function files(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n.startsWith('.')) return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p, ext);
    return ext.test(n) ? [p] : [];
  });
}

/** Whole comment lines say where art came from; they are not code. */
const isComment = (line: string): boolean => /^\s*(\/\/|\*|\/\*|\{\/\*|<!--)/.test(line);

function scan(paths: string[], re: RegExp, allow: RegExp | null = null): string[] {
  const hits: string[] = [];
  for (const f of paths)
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (isComment(line) || !re.test(line) || (allow && allow.test(line))) return;
        hits.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
  return hits;
}

const GAME_SRC = [...files(join(ROOT, 'src'), /\.(ts|js|css|html)$/), join(ROOT, 'index.html')];
const WEB_SRC = ['components/pawlegends', 'components/ui', 'components/shared', 'pages', 'styles'].flatMap((d) => files(join(WEB, d), /\.(tsx?|s?css)$/));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('no pixel art in Paw Legends', () => {
  it('no game or pawlegends.app source draws pixelated images', () => {
    expect(scan(GAME_SRC, PIXELATED)).toEqual([]);
    expect(scan(WEB_SRC, PIXELATED)).toEqual([]);
  });

  it('no source references a pixel sprite (Token Tails cat sprites, GIFs, the pixel-paw foil, pixel-rescue art)', () => {
    expect(scan(GAME_SRC, SPRITE)).toEqual([]);
    expect(scan(WEB_SRC, SPRITE)).toEqual([]);
  });

  it('the game build ships no pixel asset (no GIF, no tier foil tiles)', () => {
    const assets = files(join(ROOT, 'public'), /./).map((f) => relative(ROOT, f));
    expect(assets.filter((f) => /\.gif$/i.test(f) || /cards\/(tier|icons)\//.test(f) || /sprites\/cats\//.test(f))).toEqual([]);
  });
});

describe('real cat photos', () => {
  it('every shelter champion has a photo on pawlegends.app (and the files exist in pawlegends-web); made-up heroes have none', () => {
    expect(Object.keys(REAL_PHOTOS).sort()).toEqual([...CHAMPION_IDS].sort());
    for (const id of CHAMPION_IDS) {
      for (const size of ['256', '512', '4x5-256', '4x5-512'] as const) {
        const u = realPhotoUrl(id, size === '256' || size === '512' ? (Number(size) as 256 | 512) : size)!;
        expect(u).toMatch(new RegExp(`/pawlegends-art/real/${id}-${size}\\.webp`));
        const file = join(WEB, 'public/pawlegends-art/real', `${id}-${size}.webp`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeLessThanOrEqual(40 * 1024);
      }
    }
    for (const h of Object.keys(HEROES)) if (!CHAMPION_IDS.includes(h as never)) expect(hasRealPhoto(h)).toBe(false);
    expect(realPhotoUrl('brutus')).toBeNull();
  });

  it('the About panel shows the real photo with a real-cat alt and a "Pink Paw shelter" caption, never the TT sprite', () => {
    for (const c of SHELTER_CHAMPIONS) {
      const el = championInfo({ name: c.name, realName: c.cardName, pronoun: c.pronoun, type: HEROES[c.hero].element, hero: c.hero });
      document.body.appendChild(el);
      const img = el.querySelector<HTMLImageElement>('.plc-card.photo .plc-art img');
      expect(img, c.hero).not.toBeNull();
      expect(img!.getAttribute('src')).toContain(`/pawlegends-art/real/${c.hero}-4x5-512.webp`);
      expect(img!.alt).toMatch(new RegExp(`^${c.cardName}, a real .* cat`));
      expect(img!.getAttribute('srcset')).toContain(`${c.hero}-4x5-256.webp`);
      expect(el.querySelector('.plc-card.photo .plc-name')!.textContent).toBe(c.cardName);
      expect(el.querySelector('.plc-card.photo .plc-el')!.textContent).toBe('Pink Paw shelter');
      expect(el.innerHTML).not.toMatch(/tokentails-nfts|\.gif/);
      // offline or before a deploy: the painted splash, once
      img!.dispatchEvent(new Event('error'));
      expect(img!.getAttribute('src')).toBe(realPhoto(c.hero)!.fallback);
      expect(img!.getAttribute('src')).toMatch(new RegExp(`assets/splash/${c.hero}-360\\.webp`));
      el.remove();
    }
  });

  it('the "Meet the real cat" postcards show the real photos (splash as the fallback)', () => {
    const owned = new Set<string>(CHAMPION_IDS.map((h) => `postcard.${h}`));
    const el = collectionPanel(document.body, {
      treats: freshTreats(),
      owned,
      art: {},
      portrait: () => null,
      wornTitle: null,
      wornFrame: null,
      onTarget: () => {},
      onWear: () => {},
      onClose: () => {},
    });
    for (const h of CHAMPION_IDS) {
      const img = el.querySelector<HTMLImageElement>(`.postcard[data-postcard="${h}"] img`);
      expect(img, h).not.toBeNull();
      expect(img!.getAttribute('src')).toContain(`/pawlegends-art/real/${h}-512.webp`);
      expect(img!.getAttribute('data-fallback')).toMatch(new RegExp(`assets/splash/${h}-360\\.webp`));
      expect(img!.alt).toBe(REAL_PHOTOS[h]!.alt);
    }
  });
});
