// @vitest-environment happy-dom
/** Player avatars (CHAT-AVATARS.md §7.4): every kind, the fallbacks, no Token Tails cat art, escaped titles, CSS rings. */
import { describe, expect, it } from 'vitest';
import { avatarEl, avatarHtml, avatarParts, frameRing, titleText } from '../../src/ui/avatar';

const ART = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/cats/a.png';

describe('avatar', () => {
  it('hero, icon and guest; a Token Tails cat (pixel art) shows the hero face', () => {
    expect(avatarParts({ i: 'h:sage' })).toMatchObject({ kind: 'hero', hero: 'sage', side: 'cat' });
    expect(avatarParts({ i: 'c:0123456789abcdef01234567', img: ART }, { fallbackHero: 'sage' })).toMatchObject({ kind: 'hero', hero: 'sage' });
    expect(avatarParts({ i: 'i:s1.paw' })).toMatchObject({ kind: 'icon' });
    expect(avatarParts({ i: 'h:sage' }, { guest: true }).kind).toBe('guest');
  });

  it('falls back to the default hero on bad data, unknown heroes and foreign art', () => {
    expect(avatarParts(undefined).hero).toBe('clem');
    expect(avatarParts({ i: 'h:godzilla' }).hero).toBe('clem');
    expect(avatarParts({ i: 'c:0123456789abcdef01234567', img: 'https://evil.example/a.png' }).kind).toBe('hero');
    expect(avatarParts({ i: 'x' }, { fallbackHero: 'sage' }).hero).toBe('sage');
    const html = avatarHtml({ i: 'c:0123456789abcdef01234567', img: 'javascript:alert(1)' }, 40);
    expect(html).not.toContain('javascript');
  });

  it('frames are CSS rings; titles read as words and are escaped', () => {
    expect(frameRing('frame.store.goldpaw')).toBe('#f5c542');
    expect(frameRing(undefined)).toBeNull();
    expect(titleText('title.s1.rookie')).toBe('Rookie');
    const el = avatarEl(document, { i: 'h:clem', f: 'frame.legend', t: 'title.s1.trailblazer' }, 56, { label: 'Mira <b>' });
    expect(el.dataset.ring).toBe('1');
    expect(el.getAttribute('title')).toBe('Trailblazer');
    expect(el.getAttribute('aria-label')).toBe('Mira <b>');
    expect(el.style.getPropertyValue('--av')).toBe('56px');
    const cat = avatarEl(document, { i: 'c:0123456789abcdef01234567', img: ART }, 40);
    expect(cat.dataset.kind).toBe('hero');
    expect(cat.outerHTML).not.toContain(ART);
  });
});
