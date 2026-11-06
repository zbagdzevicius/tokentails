import { artOf, partyCardResolver, PARTY_ART_HOST, type PartyCatDoc } from './party-cards';

/* Party cards (MULTIPLAYER.md D8, §5.2): ownership, the art bucket, and a peer name that is never player text. */

const ART = `https://${PARTY_ART_HOST}/cats/a.gif`;
const ID = (n: number) => n.toString(16).padStart(24, '0');

function reader(cats: PartyCatDoc[]) {
    const byId = new Map(cats.map(c => [String(c._id), c]));
    return { byId: async (id: string) => byId.get(id) ?? null };
}

describe('party cards (D8)', () => {
    const base = { owner: 'acct-a', type: 'FIRE', tier: 'EPIC', catImg: ART };

    it('only the owner gets a card; a bad id or a foreign owner is null', async () => {
        const r = partyCardResolver(reader([{ _id: ID(1), name: 'Bella', ...base }]));
        expect(await r('acct-a', ID(1))).toEqual({
            catId: ID(1),
            image: ART,
            element: 'fire',
            tier: 'epic',
            catalog: 'Bella',
            ownName: 'Bella',
        });
        expect(await r('acct-b', ID(1))).toBeNull();
        expect(await r('acct-a', ID(2))).toBeNull();
        expect(await r('acct-a', 'not-an-id')).toBeNull();
        expect(await r('acct-a', '{"$ne":1}')).toBeNull();
    });

    it('art only from the NFT bucket over https', async () => {
        expect(artOf(ART)).toBe(ART);
        for (const bad of [
            'http://' + PARTY_ART_HOST + '/a.gif',
            'https://evil.com/a.gif',
            `https://u:p@${PARTY_ART_HOST}/a`,
            7,
            '',
        ])
            expect(artOf(bad)).toBeNull();
        const r = partyCardResolver(reader([{ _id: ID(1), name: 'Bella', ...base, catImg: 'https://evil.com/x.gif' }]));
        expect(await r('acct-a', ID(1))).toBeNull();
    });

    it('a starter shows its breed to peers, never its player-given name', async () => {
        const r = partyCardResolver(
            reader([{ _id: ID(1), name: 'Captain Fluff', isStarter: true, starterBreed: 'maine_coon', ...base }])
        );
        const card = await r('acct-a', ID(1));
        expect(card?.catalog).toBe('Maine Coon');
        expect(card?.ownName).toBe('Captain Fluff');
    });

    it('a renamed cat has no catalog name; a copy uses its catalogue cat', async () => {
        const r = partyCardResolver(
            reader([
                { _id: ID(1), name: 'Renamed', nameChangedAt: new Date(), ...base },
                { _id: ID(2), name: 'Copy', sourceCat: ID(3), ...base },
                { _id: ID(3), name: 'Lambo', ...base, owner: undefined },
            ])
        );
        expect((await r('acct-a', ID(1)))?.catalog).toBeUndefined();
        expect((await r('acct-a', ID(2)))?.catalog).toBe('Lambo');
    });

    it('an unknown element or tier falls back; a blocked own name is dropped', async () => {
        const r = partyCardResolver(
            reader([{ _id: ID(1), name: '<b>', type: 'LAVA', tier: 'MYTHIC', owner: 'acct-a', catImg: ART }])
        );
        const card = await r('acct-a', ID(1));
        expect(card).toMatchObject({ element: 'none', tier: 'common' });
        expect(card?.catalog).toBeUndefined();
        expect(card?.ownName).toBeUndefined();
    });
});
