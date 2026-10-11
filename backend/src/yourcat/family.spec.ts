import { CatOriginType } from 'src/cat/cat.schema';
import { FAMILY_LABELS, familyOptions, familySprites, normaliseFamily, PLAYABLE_FAMILIES } from './family';

describe('yourcat families', () => {
    it('has the 21 families with art (every CatOriginType except PEACHES), each labelled', () => {
        expect(PLAYABLE_FAMILIES).toHaveLength(21);
        expect(PLAYABLE_FAMILIES).not.toContain(CatOriginType.PEACHES);
        expect(Object.keys(FAMILY_LABELS).sort()).toEqual([...PLAYABLE_FAMILIES].sort());
        expect(FAMILY_LABELS.YELLOW).toBe('Ginger');
        expect(FAMILY_LABELS.SAVANHAN).toBe('Savannah');
    });

    it('maps all 21 families to themselves and PEACHES to RASCAL', () => {
        for (const family of PLAYABLE_FAMILIES) {
            expect(normaliseFamily(family)).toBe(family);
        }
        expect(normaliseFamily('PEACHES')).toBe('RASCAL');
    });

    it("normalises 'Black.' and 'yellow cat'; NONE and unknown words give null", () => {
        expect(normaliseFamily('Black.')).toBe('BLACK');
        expect(normaliseFamily('yellow cat')).toBe('YELLOW');
        expect(normaliseFamily('**OREO**')).toBe('OREO');
        expect(normaliseFamily('NONE')).toBeNull();
        expect(normaliseFamily('tabby')).toBeNull();
        expect(normaliseFamily(undefined)).toBeNull();
    });

    it('uses the base sheet and the GROOMING emote', () => {
        expect(familySprites('MAINE')).toEqual({
            spriteImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MAINE/base.png',
            catImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MAINE/base/GROOMING.gif',
        });
    });

    it('offers 21 manual options', () => {
        const options = familyOptions();
        expect(options).toHaveLength(21);
        expect(options[0]).toEqual({
            family: 'BLACK',
            label: 'Black',
            spriteImg: familySprites('BLACK').spriteImg,
        });
    });
});
