import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMIC_LAYOUTS, COMIC_PANELS, COMIC_REV, COMIC_SLOTS, comicProgress, comicRoot, comicSize, comicSlots, comicUrl, pickComic } from '../../src/boot/comicBoot.js';
import { HEROES } from '../../src/data/heroes';

const ART = join(__dirname, '../../../pawlegends-web/public/pawlegends-art/loading');

/** A seeded generator (mulberry32), so every case is repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('boot comic loading screen (src/boot/comicBoot.js)', () => {
  it('every panel is a real champion on its own side, with both picture sizes on pawlegends.app, small', () => {
    const heroes = HEROES as unknown as Record<string, { side: string }>;
    expect(COMIC_PANELS.filter((p) => p[1] === 'cat').length).toBeGreaterThanOrEqual(5);
    expect(COMIC_PANELS.filter((p) => p[1] === 'dog').length).toBeGreaterThanOrEqual(5);
    for (const [id, side] of COMIC_PANELS) {
      expect(heroes[id]?.side, id).toBe(side);
      for (const size of [640, 1280]) {
        const f = join(ART, `${id}-${size}.webp`);
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size, f).toBeLessThanOrEqual(size === 640 ? 60 * 1024 : 125 * 1024);
      }
    }
  });

  it('every layout has 9 panels, each a 4-point polygon inside the screen', () => {
    for (const [name, layout] of Object.entries(COMIC_LAYOUTS)) {
      const slots = comicSlots(layout);
      expect(slots.length, name).toBe(COMIC_SLOTS);
      expect(layout.rows.map((r) => r.pattern).join('').length, name).toBe(COMIC_SLOTS);
      for (const s of slots) {
        expect(s.clip.startsWith('polygon(')).toBe(true);
        expect(s.clip.split(',').length).toBe(4);
        expect(s.box.left).toBeGreaterThanOrEqual(0);
        expect(s.box.top).toBeGreaterThanOrEqual(0);
        expect(s.box.left + s.box.width).toBeLessThanOrEqual(100.001);
        expect(s.box.top + s.box.height).toBeLessThanOrEqual(100.001);
        expect(s.box.width).toBeGreaterThan(10);
        expect(s.box.height).toBeGreaterThan(20);
      }
      // the panels tile the screen: their areas (shoelace, no gutter) add up to 100 % x 100 %
      const area = slots.reduce((sum, s) => {
        const pts = [...s.clip.matchAll(/(-?[\d.]+)%/g)].map((m) => Number(m[1]));
        let a = 0;
        for (let i = 0; i < 4; i++) {
          const [x1, y1, x2, y2] = [pts[i * 2], pts[i * 2 + 1], pts[((i + 1) % 4) * 2], pts[((i + 1) % 4) * 2 + 1]];
          a += x1 * y2 - x2 * y1;
        }
        return sum + Math.abs(a) / 2;
      }, 0);
      expect(area, name).toBeCloseTo(10_000, 0);
    }
  });

  it('a load shows 9 different panels, cats and dogs alternating along every row, both sides present', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const layout of Object.values(COMIC_LAYOUTS)) {
        const picks = pickComic(seeded(seed), layout);
        expect(picks.length).toBe(COMIC_SLOTS);
        expect(new Set(picks.map((p) => p.id)).size).toBe(COMIC_SLOTS);
        const cats = picks.filter((p) => p.side === 'cat').length;
        expect([4, 5]).toContain(cats);
        let i = 0;
        for (const row of layout.rows) {
          const sides = picks.slice(i, i + row.pattern.length).map((p) => p.side);
          for (let k = 1; k < sides.length; k++) expect(sides[k]).not.toBe(sides[k - 1]);
          i += row.pattern.length;
        }
      }
    }
  });

  it('loads differ: over many loads every panel shows up and both sides lead', () => {
    const seen = new Set<string>();
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const picks = pickComic(seeded(seed), COMIC_LAYOUTS.wide);
      picks.forEach((p) => seen.add(p.id));
      firsts.add(picks[0].side);
    }
    expect(seen.size).toBe(COMIC_PANELS.length);
    expect(firsts).toEqual(new Set(['cat', 'dog']));
  });

  it('the picture URL: pawlegends.app same-origin there, absolute elsewhere, with the revision', () => {
    expect(comicRoot('pawlegends.app')).toBe('/pawlegends-art/loading/');
    expect(comicRoot('www.pawlegends.app')).toBe('/pawlegends-art/loading/');
    for (const host of ['localhost', '127.0.0.1', '', 'preview.vercel.app']) expect(comicRoot(host)).toBe('https://pawlegends.app/pawlegends-art/loading/');
    expect(comicUrl(comicRoot('localhost'), 'clem', 640)).toBe(`https://pawlegends.app/pawlegends-art/loading/clem-640.webp?r=${COMIC_REV}`);
    expect(Number.isInteger(COMIC_REV) && COMIC_REV >= 1).toBe(true);
  });

  it('phones take the 640 px pictures, big and retina screens the 1280 ones', () => {
    expect(comicSize(844, 390, 1)).toBe(640);
    expect(comicSize(844, 390, 3)).toBe(640);
    expect(comicSize(667, 375, 2)).toBe(640);
    expect(comicSize(390, 844, 3)).toBe(640);
    expect(comicSize(1440, 900, 1)).toBe(640);
    expect(comicSize(1440, 900, 2)).toBe(1280);
    expect(comicSize(3440, 1440, 1)).toBe(1280);
    // a slow connection or data saving: the small set everywhere
    expect(comicSize(1440, 900, 2, true)).toBe(640);
    expect(comicSize(3440, 1440, 1, true)).toBe(640);
  });

  it('progress eases up, stays below 92 % until the game is ready, never below what the game reported', () => {
    expect(comicProgress(0, 0)).toBe(0);
    expect(comicProgress(1000, 0)).toBeGreaterThan(20);
    expect(comicProgress(60_000, 0)).toBeLessThanOrEqual(92);
    expect(comicProgress(100, 70)).toBe(70);
    expect(comicProgress(1000, 0)).toBeLessThan(comicProgress(2000, 0));
  });

  it('index.html carries the hook the build inlines the script into, and no other loader text', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('<!--pl-comic-boot-->');
    // the pictures start before any stylesheet, preload or script (an inline script after a stylesheet waits for it)
    const head = html.indexOf('<!--pl-comic-head-->');
    expect(head).toBeGreaterThan(0);
    // (the game's own stylesheet is added by the build, at the end of <body>: vite.config.ts lateStylesheetPlugin)
    for (const tag of ['<style', '<script', 'rel="icon"', 'rel="preconnect"']) {
      expect(html.indexOf(tag)).toBeGreaterThan(0);
      expect(head).toBeLessThan(html.indexOf(tag));
    }
    // only the logo comes before them (high priority): on a slow phone it arrived ~8 s late behind the panels
    const logo = html.indexOf('assets/brand/logo-720.webp');
    expect(logo).toBeGreaterThan(0);
    expect(logo).toBeLessThan(head);
    expect(html).toContain('class="cm-logo"');
    // retina: a 1024 px logo in the srcset (preload and img), small enough to keep the first load light
    expect(html.match(/logo-1024\.webp 1024w/g)?.length).toBe(2);
    const big = readFileSync(join(__dirname, '../../public/assets/brand/logo-1024.webp'));
    expect(big.length).toBeLessThan(110_000);
    expect(big.readUInt32LE(24) & 0xffffff).toBe(1023);
    expect(readFileSync(join(__dirname, '../../src/boot/comicBoot.js'), 'utf8')).not.toContain('</script');
  });
});
