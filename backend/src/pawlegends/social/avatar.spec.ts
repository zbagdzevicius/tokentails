import { checkAvatarChoice, defaultHero, liveHeroIds, resolveAvatars } from './avatar';
import { SocialMemoryModel } from './social-model.helper-spec';

/*
 * Avatars (CHAT-AVATARS.md §7.2, §7.3): the write check refuses someone else's cat, a cat without bucket art, an unowned
 * frame, title or icon and an unknown hero; the read falls back to the default when a worn item is lost.
 */

const ART = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/cats/a.png';
const CAT_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CAT_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CAT_X = 'cccccccccccccccccccccccc';

function deps() {
    const cats = new SocialMemoryModel(
        [
            { _id: CAT_A, owner: 'A', catImg: ART },
            { _id: CAT_B, owner: 'B', catImg: ART },
            { _id: CAT_X, owner: 'A', catImg: 'https://evil.example/x.png' },
        ],
        [{ fields: ['_id'] }]
    );
    const owned = new SocialMemoryModel(
        [
            { accountId: 'A', item: 'frame.store.goldpaw' },
            { accountId: 'A', item: 'title.s1.rookie' },
            { accountId: 'A', item: 'icon.s1.paw' },
            { accountId: 'A', item: 'frame.store.bone', revokedAt: new Date() },
        ],
        []
    );
    const social = new SocialMemoryModel([], [{ fields: ['_id'] }]);
    return {
        social,
        owned,
        cats,
        heroes: ['clem', 'sage', 'brutus'],
        catById: async (id: string) => cats.findOne({ _id: id }).lean(),
    };
}

describe('avatar write check', () => {
    it('accepts a hero, an own cat with bucket art, owned icon/frame/title, and null clears', async () => {
        const d = deps();
        expect(await checkAvatarChoice(d, 'A', { avatar: { kind: 'hero', hero: 'sage' } })).toEqual({
            set: { avatar: { kind: 'hero', hero: 'sage' } },
        });
        expect(await checkAvatarChoice(d, 'A', { avatar: { kind: 'cat', catId: CAT_A } })).toEqual({
            set: { avatar: { kind: 'cat', catId: CAT_A } },
        });
        expect(
            await checkAvatarChoice(d, 'A', {
                avatar: { kind: 'icon', icon: 's1.paw' },
                frame: 'frame.store.goldpaw',
                title: 'title.s1.rookie',
            })
        ).toEqual({ set: { avatar: { kind: 'icon', icon: 's1.paw' }, frame: 'frame.store.goldpaw', title: 'title.s1.rookie' } });
        expect(await checkAvatarChoice(d, 'A', { frame: null, title: null })).toEqual({ set: { frame: null, title: null } });
    });

    it.each([
        [{ avatar: { kind: 'cat', catId: CAT_B } }, 'avatar'], // someone else's cat
        [{ avatar: { kind: 'cat', catId: CAT_X } }, 'avatar'], // art outside the bucket
        [{ avatar: { kind: 'hero', hero: 'godzilla' } }, 'avatar'],
        [{ avatar: { kind: 'photo', url: 'https://x' } }, 'avatar'], // no uploads, ever
        [{ avatar: { kind: 'hero', hero: 'clem', extra: 1 } }, 'avatar'],
        [{ avatar: { kind: 'icon', icon: 'not.owned' } }, 'avatar'],
        [{ frame: 'frame.store.moonlit' }, 'frame'], // not owned
        [{ frame: 'frame.store.bone' }, 'frame'], // refunded
        [{ frame: 'title.s1.rookie' }, 'frame'], // a title is not a frame
        [{ title: 'title.free text' }, 'title'],
    ])('refuses %j', async (body, bad) => {
        expect(await checkAvatarChoice(deps(), 'A', body as never)).toEqual({ bad });
    });
});

describe('avatar read', () => {
    it('resolves worn items and falls back when an item or a cat is lost, without a write', async () => {
        const d = deps();
        await d.social.create({ _id: 'A', avatar: { kind: 'cat', catId: CAT_A }, frame: 'frame.store.goldpaw', title: 'title.s1.rookie' });
        await d.social.create({ _id: 'B', avatar: { kind: 'cat', catId: CAT_A }, frame: 'frame.store.goldpaw' });
        const out = await resolveAvatars(d, ['A', 'B', 'C']);
        expect(out.get('A')).toEqual({ i: `c:${CAT_A}`, img: ART, f: 'frame.store.goldpaw', t: 'title.s1.rookie' });
        // B wears A's cat and A's frame: both fall back
        expect(out.get('B')).toEqual({ i: `h:${defaultHero('B', d.heroes)}` });
        expect(out.get('C')!.i).toMatch(/^h:(clem|sage|brutus)$/);
        await d.cats.updateOne({ _id: CAT_A }, { $set: { owner: 'Z' } });
        expect((await resolveAvatars(d, ['A'])).get('A')!.i).toBe(`h:${defaultHero('A', d.heroes)}`);
    });

    it('the default hero is stable per account and from the live sim', () => {
        expect(defaultHero('acct-1', ['a', 'b', 'c'])).toBe(defaultHero('acct-1', ['a', 'b', 'c']));
        expect(liveHeroIds().length).toBeGreaterThan(5);
    });
});
