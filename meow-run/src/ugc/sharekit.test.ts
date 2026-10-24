// Share links point at the site route (https://tokentails.com/meow-run) wherever the game is served on tokentails.com,
// including the raw build path /meowrun-game/index.html; elsewhere (dev, previews) at the page itself.
import { afterEach, describe, expect, it } from 'vitest';
import { linkWith, readParams, shareBase } from './sharekit';

const g = globalThis as unknown as { location?: unknown };
function at(href: string): void {
  const u = new URL(href);
  g.location = { href: u.href, hostname: u.hostname, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash };
}
afterEach(() => {
  delete g.location;
});

describe('sharekit links', () => {
  it('uses the canonical site route without a location (node)', () => {
    expect(shareBase()).toBe('https://tokentails.com/meow-run');
  });
  it('uses the canonical site route on tokentails.com, whatever the path', () => {
    for (const h of ['https://tokentails.com/meow-run?from=picker', 'https://www.tokentails.com/meowrun-game/index.html', 'https://tokentails.com/meow-run/']) {
      at(h);
      expect(shareBase()).toBe('https://tokentails.com/meow-run');
    }
  });
  it('does not treat look-alike hosts as tokentails.com', () => {
    at('https://eviltokentails.com/meow-run');
    expect(shareBase()).toBe('https://eviltokentails.com/meow-run');
  });
  it('uses the page itself in dev and previews', () => {
    at('http://127.0.0.1:5178/?c=abc');
    expect(shareBase()).toBe('http://127.0.0.1:5178/');
    expect(linkWith({ t: 'a b' })).toBe('http://127.0.0.1:5178/?t=a+b');
  });
  it('builds ?c= and ?t= links and reads them back from location.search only', () => {
    at('https://tokentails.com/meow-run?from=home_hub_meowrun');
    const c = linkWith({ c: 'eJx_abc-123' });
    expect(c).toBe('https://tokentails.com/meow-run?c=eJx_abc-123');
    at(c);
    expect(readParams().get('c')).toBe('eJx_abc-123');
    at('https://tokentails.com/meow-run?from=picker&t=0a4.1-5');
    expect(readParams().get('t')).toBe('0a4.1-5');
    expect(readParams().get('c')).toBeNull();
  });
});
