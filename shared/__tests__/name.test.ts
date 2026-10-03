import { ErrorCode } from '../errors';
import {
    CAT_NAME_MAX_LENGTH,
    CAT_NAME_MESSAGES,
    CAT_NAME_MIN_LENGTH,
    CAT_NAME_VECTORS,
    foldCatName,
    normalizeCatName,
    sameCatName,
} from '../name';

describe('shared cat names (G3)', () => {
    it('has at least 60 shared vectors', () => {
        expect(CAT_NAME_VECTORS.length).toBeGreaterThanOrEqual(60);
    });

    it.each(CAT_NAME_VECTORS.map(vector => [JSON.stringify(vector.input), vector]))('%s', (_label, vector) => {
        const result = normalizeCatName(vector.input, { reserved: vector.reserved });
        if (vector.expect === 'ok') {
            expect(result).toEqual({ ok: true, name: vector.name ?? vector.input });
        } else {
            expect(result).toEqual({ ok: false, code: vector.expect });
        }
    });

    it('accepts the plan examples and rejects the Cyrillic look-alike', () => {
        expect(normalizeCatName('O’Malley')).toEqual({ ok: true, name: "O'Malley" });
        expect(normalizeCatName('Žvaigždutė')).toEqual({ ok: true, name: 'Žvaigždutė' });
        expect(normalizeCatName('аdmin').ok).toBe(false);
    });

    it('blocks the slurs the 3c review found, without blocking the names next to them', () => {
        [
            'Pyderas',
            'Pyderastas',
            'Pederastas',
            'Bybys',
            'Nigeris',
            'Negras',
            'Kurwa',
            'Kurw1x',
            'Fck',
            'Kunt',
            'Hore',
            'Pedo',
            'Pedofilas',
            'Heil',
        ].forEach(name => expect(normalizeCatName(name)).toEqual({ ok: false, code: ErrorCode.NAME_BLOCKED }));
        ['Negroni', 'Pedro', 'Nigeria', 'Heidi', 'Horace'].forEach(name =>
            expect(normalizeCatName(name)).toEqual({ ok: true, name })
        );
    });

    it('never throws on odd input', () => {
        [undefined, null, 42, {}, [], '\uD800', '\u0000'].forEach(input =>
            expect(() => normalizeCatName(input as unknown)).not.toThrow()
        );
        expect(normalizeCatName(undefined)).toEqual({ ok: false, code: ErrorCode.NAME_TOO_SHORT });
    });

    it('keeps every stored name inside the length bounds', () => {
        CAT_NAME_VECTORS.forEach(vector => {
            const result = normalizeCatName(vector.input, { reserved: vector.reserved });
            if (result.ok) {
                expect(result.name.length).toBeGreaterThanOrEqual(CAT_NAME_MIN_LENGTH);
                expect(result.name.length).toBeLessThanOrEqual(CAT_NAME_MAX_LENGTH);
            }
        });
    });

    it('is idempotent: a stored name passes again unchanged', () => {
        CAT_NAME_VECTORS.forEach(vector => {
            const first = normalizeCatName(vector.input, { reserved: vector.reserved });
            if (first.ok) {
                expect(normalizeCatName(first.name, { reserved: vector.reserved })).toEqual(first);
            }
        });
    });

    it('folds case, accents and spacing for comparisons', () => {
        expect(foldCatName('Žvaigždutė')).toBe('zvaigzdute');
        expect(sameCatName('Pūpa', 'PUPA')).toBe(true);
        expect(sameCatName('Luna', 'Lunar')).toBe(false);
    });

    it('has a message for every error code', () => {
        [
            ErrorCode.NAME_TOO_SHORT,
            ErrorCode.NAME_TOO_LONG,
            ErrorCode.NAME_CHARS,
            ErrorCode.NAME_RESERVED,
            ErrorCode.NAME_BLOCKED,
        ].forEach(code => expect(CAT_NAME_MESSAGES[code]).toEqual(expect.any(String)));
    });
});
