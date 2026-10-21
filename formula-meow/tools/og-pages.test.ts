import { describe, expect, it } from 'vitest';
import { PAGES, pageHtml } from './og-pages.mjs';

/** Paths client/next.config.js rewrites to a Formula Meow page (the bare /meow-race/d is not one of them). */
const REWRITTEN = [/^\/meow-race$/, /^\/meow-race\/r$/, /^\/meow-race\/d\/\d{1,4}$/, /^\/meow-race\/make$/, /^\/meow-race\/t$/];

describe('OG link shells', () => {
  const template = '<html><head><meta name="format-detection" content="telephone=no" /><title>x</title></head></html>';

  it('every og:url is an address the site serves', () => {
    for (const p of PAGES) {
      const html = pageHtml(template, p);
      const m = /property="og:url" content="([^"]+)"/.exec(html);
      if (!m) continue;
      const path = new URL(m[1]).pathname;
      expect(REWRITTEN.some((r) => r.test(path)), `${p.file}: ${path}`).toBe(true);
    }
  });

  it('the Daily Cup shell has no og:url (its day is only in the address)', () => {
    const d = PAGES.find((p) => p.file === 'd.html')!;
    expect(pageHtml(template, d)).not.toContain('og:url');
    expect(pageHtml(template, d)).toContain('og:title');
  });
});
