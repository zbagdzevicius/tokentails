import { normalizeCatName } from 'src/shared-contracts/name';
import {
    normalizeXHandle,
    RAVE_DEFAULT_NAMES,
    raveCatName,
    raveDefaultNames,
    resolveRaveNames,
    X_RESERVED_PATHS,
} from './rave-names';

const ORDER = 'rv_3f9a0c1b7e2d4a65';

describe('rave default names', () => {
    it('has ~40 defaults and every one passes normalizeCatName unchanged', () => {
        expect(RAVE_DEFAULT_NAMES.length).toBe(40);
        for (const name of RAVE_DEFAULT_NAMES) {
            expect({ name, result: normalizeCatName(name) }).toEqual({ name, result: { ok: true, name } });
        }
        expect(new Set(RAVE_DEFAULT_NAMES.map(n => n.toLowerCase())).size).toBe(RAVE_DEFAULT_NAMES.length);
    });

    it('is deterministic per order and never repeats within the list size', () => {
        expect(raveDefaultNames(ORDER, 11)).toEqual(raveDefaultNames(ORDER, 11));
        expect(raveDefaultNames(ORDER, 11)).not.toEqual(raveDefaultNames('rv_0000000000000001', 11));
        const forty = raveDefaultNames(ORDER, 40);
        expect(new Set(forty).size).toBe(40);
        expect(raveDefaultNames(ORDER, 41)).toHaveLength(41);
    });
});

describe('resolveRaveNames', () => {
    it('fills empty fields with defaults and keeps typed names, normalised', () => {
        const r = resolveRaveNames({ cats: 5, names: ['  Mochi ', '', null, 'Disco   Paws'] }, ORDER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const defaults = raveDefaultNames(ORDER, 5);
        expect(r.value.names).toEqual(['Mochi', defaults[1], defaults[2], 'Disco Paws', defaults[4]]);
        expect(r.value.restName).toBeUndefined();
        expect(r.value.defaultNames).toEqual(defaults);
    });

    it('uses one rest name above 10 cats and expands it as "Name 11, 12..."', () => {
        const r = resolveRaveNames({ cats: 12, names: [], restName: 'Disco' }, ORDER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.names).toHaveLength(10);
        expect(r.value.restName).toBe('Disco');
        expect(r.value.defaultNames).toHaveLength(11);
        expect(raveCatName(r.value, 0)).toBe(r.value.names[0]);
        expect(raveCatName(r.value, 10)).toBe('Disco 11');
        expect(raveCatName(r.value, 11)).toBe('Disco 12');
        const noRest = resolveRaveNames({ cats: 12 }, ORDER);
        expect(noRest.ok && noRest.value.restName).toBe(raveDefaultNames(ORDER, 11)[10]);
    });

    it('refuses profanity, URLs, emoji, script and over-long names, field by field', () => {
        const r = resolveRaveNames(
            {
                cats: 12,
                names: ['Fuck', 'https://evil.com', '\u{1F431}\u{1F431}\u{1F431}', '<script>', 'A'.repeat(17), 'Luna'],
                restName: 'B1tch',
            },
            ORDER
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.fields).toEqual([
            { index: 0, code: 'NAME_BLOCKED' },
            { index: 1, code: 'NAME_CHARS' },
            { index: 2, code: 'NAME_CHARS' },
            { index: 3, code: 'NAME_CHARS' },
            { index: 4, code: 'NAME_TOO_LONG' },
            { index: 'rest', code: 'NAME_BLOCKED' },
        ]);
    });

    it('refuses more than 3 identical typed names (spam)', () => {
        const ok = resolveRaveNames({ cats: 5, names: ['Luna', 'luna', 'LUNA'] }, ORDER);
        expect(ok.ok).toBe(true);
        const spam = resolveRaveNames({ cats: 5, names: ['Luna', 'luna', 'LUNA', 'Luna', 'Luna'] }, ORDER);
        expect(spam).toEqual({
            ok: false,
            fields: [
                { index: 3, code: 'NAME_REPEAT' },
                { index: 4, code: 'NAME_REPEAT' },
            ],
        });
    });
});

describe('normalizeXHandle', () => {
    const ok = (input: unknown, handle: string | null) => expect(normalizeXHandle(input)).toEqual({ ok: true, handle });
    const bad = (input: unknown, code = 'X_HANDLE_INVALID') =>
        expect(normalizeXHandle(input)).toEqual({ ok: false, code });

    it('accepts @handle, handle and x.com / twitter.com profile links, keeping the case typed', () => {
        ok('@someone', 'someone');
        ok('someone', 'someone');
        ok('  @Some_One_42  ', 'Some_One_42');
        ok('https://x.com/someone', 'someone');
        ok('https://x.com/someone/', 'someone');
        ok('http://twitter.com/SomeOne?ref=abc', 'SomeOne');
        ok('https://www.x.com/someone#top', 'someone');
        ok('mobile.twitter.com/someone', 'someone');
        ok('x.com/someone', 'someone');
        ok('HTTPS://X.COM/someone', 'someone');
        ok('some​one', 'someone');
        ok('＠someone', 'someone');
        ok('a', 'a');
        ok('A'.repeat(15), 'A'.repeat(15));
    });

    it('treats an empty field as no handle', () => {
        ok(undefined, null);
        ok(null, null);
        ok('', null);
        ok('   ', null);
    });

    it('refuses other domains, deeper paths, script, junk and over-long handles', () => {
        bad('https://evil.com/someone');
        bad('https://x.com.evil.com/someone');
        bad('https://evil.com/x.com/someone');
        bad('https://x.com@evil.com/someone');
        bad('https://xx.com/someone');
        bad('https://x.com/someone/status/1');
        bad('https://x.com/');
        bad('ftp://x.com/someone');
        bad('javascript:alert(1)');
        bad('<script>alert(1)</script>');
        bad('"><img src=x onerror=alert(1)>');
        bad('@@someone');
        bad('some one');
        bad('some.one');
        bad('some-one');
        bad('A'.repeat(16));
        bad('@' + 'a'.repeat(16));
        bad('x'.repeat(101));
        bad(42);
        bad({ handle: 'someone' });
    });

    it("refuses X's own pages", () => {
        for (const path of X_RESERVED_PATHS) {
            bad(`https://x.com/${path}`);
            bad(path.toUpperCase());
        }
    });

    it('refuses handles the cat-name word lists block', () => {
        bad('fuck', 'X_HANDLE_BLOCKED');
        bad('@B1tch', 'X_HANDLE_BLOCKED');
        bad('https://x.com/big_ass', 'X_HANDLE_BLOCKED');
    });
});
