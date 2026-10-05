import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLIENT_BASE, iconLinksFor, normalizeBase } from '../vite.config';

// Deploy path handling (plan F12): `npm run build:client` builds for /heist-game/, the Pages
// workflow for /<repo>/heist-game/, and a plain `npm run build` stays relative.
describe('normalizeBase', () => {
  it('stays relative by default', () => {
    expect(normalizeBase(undefined)).toBe('./');
    expect(normalizeBase('')).toBe('./');
    expect(normalizeBase('  ')).toBe('./');
    expect(normalizeBase('.')).toBe('./');
    expect(normalizeBase('./')).toBe('./');
  });

  it('gives any spelling of a sub-path one leading and one trailing slash', () => {
    expect(normalizeBase('/heist-game/')).toBe('/heist-game/');
    expect(normalizeBase('/heist-game')).toBe('/heist-game/');
    expect(normalizeBase('heist-game')).toBe('/heist-game/');
    expect(normalizeBase('//heist-game//')).toBe('/heist-game/');
    expect(normalizeBase('/tokentails/heist-game')).toBe('/tokentails/heist-game/');
    expect(normalizeBase('/')).toBe('/');
  });

  it('keeps a full URL and adds the trailing slash', () => {
    expect(normalizeBase('https://cdn.example.com/heist-game')).toBe('https://cdn.example.com/heist-game/');
    expect(normalizeBase('https://cdn.example.com/heist-game/')).toBe('https://cdn.example.com/heist-game/');
  });
});

describe('build:client', () => {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };

  it('builds for /heist-game/ into the client app', () => {
    const script = pkg.scripts['build:client'];
    expect(script).toContain('HEIST_BASE=/heist-game/');
    expect(script).toContain('--outDir ../client/public/heist-game');
    expect(script).not.toMatch(/public\/heist(\s|$)/);
  });
});

// Icons (plan G14, review 6b): the shared set only exists on tokentails.com; standalone exports
// would 404 on /favicon.ico and /icons/*, so they get the game's own paw icon back.
describe('iconLinksFor', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

  it('keeps the shared icon links for the tokentails.com build', () => {
    expect(iconLinksFor(html, CLIENT_BASE)).toBe(html);
    expect(html).toContain('href="/favicon.ico"');
  });

  it.each(['./', '/', '/tokentails/heist-game/', 'https://example.itch.zone/game/'])(
    'swaps them for the paw icon on standalone base %s',
    (deployBase) => {
      const out = iconLinksFor(html, deployBase);
      expect(out).not.toContain('/favicon.ico');
      expect(out).not.toContain('/icons/');
      expect(out.match(/<link rel="icon" href="\/assets\/images\/paw\.png" \/>/g)).toHaveLength(1);
      expect(out).toContain('<link rel="preload" href="/assets/manifest.json"');
    },
  );
});

// HOME (shared/home-yard.ts): the tokentails.com build adds the Cat Yard module as a second entry
// and records its hashed path for the client.
describe('home entry', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('writes a generated module the client can import', async () => {
    const { homeEntrySource } = await import('../vite.config');
    const src = homeEntrySource('/heist-game/build/home-abc123.js');
    expect(src).toContain('export const HOME_YARD_ENTRY = "/heist-game/build/home-abc123.js";');
    expect(src).toMatch(/^\/\/ GENERATED/);
  });

  it('the committed client entry points at a built file', async () => {
    const { existsSync } = await import('node:fs');
    const generated = readFileSync(join(root, '..', 'client', 'components', 'home', 'yardEntry.generated.ts'), 'utf8');
    const path = /HOME_YARD_ENTRY = "([^"]+)"/.exec(generated)?.[1];
    expect(path).toMatch(/^\/heist-game\/build\/home-[\w-]+\.js$/);
    expect(existsSync(join(root, '..', 'client', 'public', path!))).toBe(true);
  });
});
