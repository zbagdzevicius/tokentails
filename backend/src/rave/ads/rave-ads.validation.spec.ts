import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { normalizeXHandle } from '../rave-names';
import { RAVE_AD_KIND_SIZE, RAVE_AD_SLOTS } from './rave-ads.slots';
import { normalizeAdName, normalizeAdUrl } from './rave-ads.validation';

describe('ad destination URL', () => {
    it('accepts public https links and normalises them', () => {
        expect(normalizeAdUrl('https://example.com')).toEqual({ ok: true, url: 'https://example.com/' });
        expect(normalizeAdUrl(' https://Shop.Example.co.uk/a?b=1#c ')).toEqual({
            ok: true,
            url: 'https://shop.example.co.uk/a?b=1#c',
        });
    });

    it.each([
        ['http://example.com', 'URL_NOT_HTTPS'],
        ['javascript:alert(1)', 'URL_NOT_HTTPS'],
        ['data:text/html,hi', 'URL_NOT_HTTPS'],
        ['ftp://example.com', 'URL_NOT_HTTPS'],
        ['example.com', 'URL_INVALID'],
        ['https://user:pw@example.com', 'URL_INVALID'],
        ['https://127.0.0.1/', 'URL_INVALID'],
        ['https://[::1]/', 'URL_INVALID'],
        ['https://localhost/', 'URL_INVALID'],
        ['https://intranet/', 'URL_INVALID'],
        ['https://example.com:8443/', 'URL_INVALID'],
        ['https://exa mple.com/', 'URL_INVALID'],
        ['https://example.com/"><script>', 'URL_INVALID'],
        [`https://example.com/${'a'.repeat(300)}`, 'URL_INVALID'],
        ['', 'URL_INVALID'],
    ])('refuses %s', (input, code) => {
        expect(normalizeAdUrl(input)).toEqual({ ok: false, code });
    });

    it('refuses non-strings', () => {
        expect(normalizeAdUrl(42)).toEqual({ ok: false, code: 'URL_INVALID' });
        expect(normalizeAdUrl(null)).toEqual({ ok: false, code: 'URL_INVALID' });
    });
});

describe('ad sponsor name', () => {
    it('accepts brand-like names and collapses spaces', () => {
        expect(normalizeAdName('  Purrfect   Coffee & Co.  ')).toEqual({ ok: true, name: 'Purrfect Coffee & Co.' });
        expect(normalizeAdName('Café Ünïcode 24-7')).toEqual({ ok: true, name: 'Café Ünïcode 24-7' });
        expect(normalizeAdName('www dot shop').ok).toBe(true); // a phrase is fine; link-shaped text is not
    });

    it.each([
        ['a', 'NAME_LENGTH'],
        ['x'.repeat(33), 'NAME_LENGTH'],
        ['<b>Bold</b>', 'NAME_CHARS'],
        ['Visit evil.com', 'NAME_CHARS'],
        ['shop at www.cats', 'NAME_CHARS'],
        ['@@@@', 'NAME_CHARS'],
    ])('refuses %s', (input, code) => {
        expect(normalizeAdName(input)).toEqual({ ok: false, code });
    });
});

describe('ad X handle (shared with the rave checkout)', () => {
    it('accepts @handle, handle and profile links; stores the bare handle', () => {
        expect(normalizeXHandle('@Moon_Rave')).toEqual({ ok: true, handle: 'Moon_Rave' });
        expect(normalizeXHandle('https://twitter.com/moonrave')).toEqual({ ok: true, handle: 'moonrave' });
        expect(normalizeXHandle('')).toEqual({ ok: true, handle: null });
        expect(normalizeXHandle('https://x.com/a/status/1').ok).toBe(false);
        expect(normalizeXHandle('way_too_long_handle_123').ok).toBe(false);
    });
});

describe('ad slots', () => {
    it('are 20: 2 screens, 6 banners, 6 tower wraps, 4 blimps, 2 moon-ring banners', () => {
        expect(RAVE_AD_SLOTS).toHaveLength(20);
        expect(new Set(RAVE_AD_SLOTS.map(s => s.id)).size).toBe(20);
        const count = (k: string) => RAVE_AD_SLOTS.filter(s => s.kind === k).length;
        expect([count('screen'), count('banner'), count('tower'), count('blimp'), count('moon')]).toEqual([
            2, 6, 6, 4, 2,
        ]);
    });

    it('match the page copy in cat-rave/src/ads/slots.ts (ids and aspects)', () => {
        const file = join(__dirname, '../../../../cat-rave/src/ads/slots.ts');
        if (!existsSync(file)) return; // backend-only checkout
        const text = readFileSync(file, 'utf8');
        for (const [kind, size] of Object.entries(RAVE_AD_KIND_SIZE)) {
            const re = new RegExp(
                `${kind}:\\s*\\{[^}]*count:\\s*${size.count}[^}]*px:\\s*\\[${size.width},\\s*${size.height}\\]`
            );
            expect(text).toMatch(re);
        }
    });
});
