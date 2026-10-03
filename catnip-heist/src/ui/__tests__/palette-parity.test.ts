import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Plan G6 "Heist parity" (decision #48) and G14 Heist meta: the Heist night and coin colours are
// the Token Tails tokens, in the source page, the built page served at /heist-game/ and the UI
// stylesheet, and both pages carry the description and the canonical to the URL that answers 200
// (/heist-game/index.html; /heist is a temporary redirect until task 4b's host page).
const here = dirname(fileURLToPath(import.meta.url));
const heist = resolve(here, '..', '..', '..');
const repo = resolve(heist, '..');
const read = (p: string) => readFileSync(p, 'utf8');

const tokens = read(resolve(repo, 'client', 'design', 'tokens.ts'));
const token = (group: string, key: string) => {
  const block = new RegExp(`export const ${group} = \\{([\\s\\S]*?)\\} as const`).exec(tokens)?.[1] ?? '';
  return new RegExp(`(?:^|\\s)${key}:\\s*"(#[0-9a-f]{6})"`, 'i').exec(block)?.[1]?.toLowerCase();
};
const NIGHT_900 = token('NIGHT', '900');
const GOLD_400 = token('GOLD', '400');

const pages = [
  ['catnip-heist/index.html', resolve(heist, 'index.html')],
  ['client/public/heist-game/index.html (built)', resolve(repo, 'client', 'public', 'heist-game', 'index.html')],
] as const;

/** A CSS colour as #rrggbb (the minifier writes #ffcc55 as #fc5). */
const expand = (hex: string | undefined) => {
  if (!hex) return hex;
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};
const cssVar = (html: string, name: string) => expand(new RegExp(`--${name}:\\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\\b`, 'i').exec(html)?.[1]);

describe('Heist palette parity with the Token Tails tokens', () => {
  it('reads the tokens', () => {
    expect(NIGHT_900).toBe('#0b0820');
    expect(GOLD_400).toBe('#ffcc55');
  });

  for (const [label, file] of pages) {
    describe(label, () => {
      it('exists', () => expect(existsSync(file)).toBe(true));
      it('--night is night-900 and --coin is gold-400; the outline is kept', () => {
        const html = read(file);
        expect(cssVar(html, 'night')).toBe(NIGHT_900);
        expect(cssVar(html, 'coin')).toBe(GOLD_400);
        expect(cssVar(html, 'outline')).toBe('#2a0f1f');
      });
      it('theme-color is night-900', () => {
        expect(/<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(read(file))?.[1]?.toLowerCase()).toBe(NIGHT_900);
      });
      it('has a description and a canonical that is not a redirect', () => {
        const html = read(file);
        expect(html).toMatch(/<meta name="description" content="[^"]{40,}"/);
        const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
        expect(canonical).toBe('https://tokentails.com/heist');
        // The canonical path must not be a redirect source in client/next.config.js.
        const nextConfig = read(resolve(repo, 'client', 'next.config.js'));
        const path = new URL(canonical!).pathname;
        const sources = [...nextConfig.matchAll(/source:\s*"([^"]+)"/g)].map((m) => m[1]);
        expect(sources).not.toContain(path);
        expect(html).not.toMatch(/%VITE_|@undefined|https:\/[^/]/);
      });
    });
  }

  it('the UI stylesheet uses the same night and coin', () => {
    const css = read(resolve(heist, 'src', 'ui', 'styles.ts'));
    expect(/--ch-night:\s*(#[0-9a-f]{6})/i.exec(css)?.[1]?.toLowerCase()).toBe(NIGHT_900);
    expect(/--ch-coin:\s*(#[0-9a-f]{6})/i.exec(css)?.[1]?.toLowerCase()).toBe(GOLD_400);
    // No stray copy of the old values in the UI styles.
    expect(css).not.toMatch(/#ffc93c|#0d0616|255,\s*201,\s*60|13,\s*6,\s*22/i);
    expect(read(resolve(heist, 'src', 'ui', 'levels', 'styles.ts'))).not.toMatch(/#ffc93c|#0d0616/i);
  });

  it('secondary text is Nunito (decision #85), with the self-hosted face injected', () => {
    const css = read(resolve(heist, 'src', 'ui', 'styles.ts'));
    expect(css).not.toMatch(/font-family:\s*system-ui/);
    expect(css).toMatch(/heistFontFaceCss\(/);
    expect(existsSync(resolve(heist, 'public', 'fonts', 'nunito-latin-wght-normal.woff2'))).toBe(true);
  });

  it('the rail footer keeps a 16 px side gutter and the Opens soon chip is at least 12 px', () => {
    const css = read(resolve(heist, 'src', 'ui', 'styles.ts'));
    expect(/\.ch-foot \{[^\n]*padding: 0 16px/.exec(css)).not.toBeNull();
    expect(/\.ch-rail-chip \{[^\n]*font-size: max\(12px,/.exec(css)).not.toBeNull();
  });
});
