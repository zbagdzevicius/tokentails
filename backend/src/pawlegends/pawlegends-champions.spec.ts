import {
    championCards,
    PAWLEGENDS_CHAMPIONS,
    PAWLEGENDS_CHAMPIONS_TTL_MS,
    resetChampionsCache,
} from './pawlegends-champions';

/*
 * Sim v9 shelter champions: GET /pawlegends/champions gives the four champions' cards (storefront fields) and
 * whether each is for sale on its own; a gone catalog cat is listed with `cat: null`, never for sale. Cached 5 min.
 */

const LAMBO = '6a30473c1d6649b19b03622b';
const GABE = '6992227d890a12f52a317e22';

function source(rows: Record<string, unknown>[]) {
    const find = jest.fn(() => ({ populate: () => ({ lean: () => ({ exec: async () => rows }) }) }));
    return { model: { find }, find };
}

describe('Pawlegends champions route', () => {
    beforeEach(() => resetChampionsCache());

    it('lists the four champions in a fixed order, for sale only when the server sells the card', async () => {
        const src = source([
            {
                _id: LAMBO,
                name: 'Lambo',
                type: 'STELLAR',
                catImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png',
            },
            { _id: GABE, name: 'Gabė', type: 'WIND' },
        ]);
        const check = jest.fn(async (id: string) => ({ ok: id === LAMBO }));
        const out = await championCards(src as any, { check }, 1000);
        expect(out.cats.map(c => c.hero)).toEqual(['lambo', 'aviete', 'bengas', 'gabe']);
        expect(out.cats.map(c => c.catalogId)).toEqual(PAWLEGENDS_CHAMPIONS.map(c => c.catalogId));
        expect(out.cats[0]).toMatchObject({ forSale: true, cat: { name: 'Lambo' } });
        expect(out.cats[3]).toMatchObject({ forSale: false, cat: { name: 'Gabė' } });
        // A catalog cat that is gone: listed, never for sale, and the sale check is not even asked.
        expect(out.cats[1]).toEqual({
            hero: 'aviete',
            catalogId: '6965203d0a2c7b325b78f7e2',
            forSale: false,
            cat: null,
        });
        expect(check).not.toHaveBeenCalledWith('6965203d0a2c7b325b78f7e2');
        // The projection is the storefront whitelist (never owner or codes).
        const projection = (src.find.mock.calls[0] as unknown[])[1] as Record<string, number>;
        expect(projection.owner).toBeUndefined();
        expect(projection.catImg).toBe(1);
    });

    it('caches for 5 minutes, and nothing is for sale without the sale service', async () => {
        const src = source([{ _id: LAMBO, name: 'Lambo', type: 'STELLAR' }]);
        const first = await championCards(src as any, undefined, 0);
        expect(first.cats[0].forSale).toBe(false);
        await championCards(src as any, undefined, PAWLEGENDS_CHAMPIONS_TTL_MS - 1);
        expect(src.find).toHaveBeenCalledTimes(1);
        await championCards(src as any, undefined, PAWLEGENDS_CHAMPIONS_TTL_MS + 1);
        expect(src.find).toHaveBeenCalledTimes(2);
    });
});
