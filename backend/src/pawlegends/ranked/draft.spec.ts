import { PARTY_TIMING, PartyService, type MemberIdentity, type StartPlan } from '../party/party.service';
import { BOT_BAN_ORDER, botBan, draftSeed, RANKED_DRAFT, teamBan } from './draft';

/* Ranked draft (SOCIAL-RANKED.md §7.13): the ban phase before the ranked pick, bots' bans, the seed re-roll. */

const CATS = ['clem', 'sage', 'mochi', 'aviete', 'stilts', 'pixel', 'gabe'];
const DOGS = ['nugget', 'bravo', 'chili', 'frankie', 'brutus', 'howler', 'rocket'];
const sideOf = (h: string) => (DOGS.includes(h) ? 'dog' : CATS.includes(h) ? 'cat' : null);

const id = (k: string): MemberIdentity => ({
    accountId: k,
    guestKeyHash: null,
    key: `acct:${k}`,
    ticketed: true,
    guest: false,
});

function make(free: (h: string) => boolean = () => true) {
    const clock = { now: 1_000_000 };
    const starts: StartPlan[] = [];
    const ps = new PartyService(
        {
            heroes: [...CATS, ...DOGS],
            tricks: ['pounce'],
            difficulties: ['rookie', 'easy', 'normal', 'hard'],
            sideOf,
            newbieHero: 'clem',
            free: (_p, h) => free(h),
        },
        { changed: () => undefined, send: () => undefined, startMatch: plan => void starts.push(plan) },
        () => clock.now
    );
    const tick = (ms: number) => {
        clock.now += ms;
        ps.tick();
    };
    return { ps, clock, starts, tick };
}

/** A ranked 3v3: cats (m1, m2 + a bot at slot 2) vs dogs (m3 + bots at 4 and 5). */
function rankedPvp(ps: PartyService, draft = true) {
    return ps.createMatched(
        [
            { id: 'm1', identity: id('a') },
            { id: 'm2', identity: id('b') },
            { id: 'm3', identity: id('c') },
        ],
        {
            match: 'x',
            side: 'cat',
            difficulty: 'hard',
            ranked: true,
            draft,
            casual: {
                slots: { m1: 0, m2: 1, m3: 3 },
                species: ['cat', 'dog'],
                fillDifficulty: ['hard', 'hard'],
                humans: [0, 1, 3],
            },
        }
    );
}

describe('draft helpers', () => {
    it('teamBan: the most votes; a tie goes to the lowest seat; no votes: none', () => {
        expect(teamBan([])).toBeNull();
        expect(teamBan([{ slot: 1, hero: 'chili' }])).toBe('chili');
        expect(
            teamBan([
                { slot: 2, hero: 'bravo' },
                { slot: 0, hero: 'chili' },
                { slot: 1, hero: 'bravo' },
            ])
        ).toBe('bravo');
        expect(
            teamBan([
                { slot: 2, hero: 'bravo' },
                { slot: 1, hero: 'chili' },
            ])
        ).toBe('chili');
    });

    it('botBan: the highest win rate of the species, free this week first, never one already banned', () => {
        const heroes = [...CATS, ...DOGS];
        expect(botBan('cat', heroes, sideOf, [])).toBe(BOT_BAN_ORDER.cat[0]);
        expect(botBan('cat', heroes, sideOf, ['aviete'])).toBe('clem');
        // only starters free: the best free one
        expect(botBan('dog', heroes, sideOf, [], h => ['brutus', 'nugget'].includes(h))).toBe('brutus');
        // nothing free: the best at all
        expect(botBan('dog', heroes, sideOf, [], () => false)).toBe('frankie');
        expect(botBan('dog', ['clem'], sideOf, [])).toBeNull();
    });

    it('draftSeed: the first seed whose bot seats field no banned hero; null after the tries', () => {
        const picks = (s: number) =>
            s === 7
                ? ['clem', 'sage', 'mochi', 'chili', 'bravo', 'nugget']
                : ['clem', 'sage', 'mochi', 'chili', 'frankie', 'nugget'];
        let n = 0;
        const next = () => [5, 6, 7][n++];
        expect(draftSeed(1, ['frankie'], [4, 5], picks, next)).toBe(7);
        // a banned hero on a human seat (3) is not the seed's business
        expect(draftSeed(1, ['chili'], [4, 5], picks, () => 2)).toBe(1);
        expect(draftSeed(1, ['frankie'], [4], picks, () => 2, 5)).toBeNull();
        expect(draftSeed(1, [], [4], picks, () => 2)).toBe(1);
    });
});

describe('ranked draft in the party (§7.13)', () => {
    it('the pick opens on the ban phase: no hover or lock until it ends; each team bans the other species', () => {
        const { ps } = make();
        const p = rankedPvp(ps);
        expect(p.phase).toBe('pick');
        expect(p.draft?.stage).toBe('ban');
        expect(ps.view(p, 'm1').draft).toEqual({
            stage: 'ban',
            target: 'dog',
            bans: [
                { team: 0, by: 'open' },
                { team: 1, by: 'open' },
            ],
            votes: [],
        });
        expect(ps.view(p, 'm1').deadlineMs).toBe(RANKED_DRAFT.banMs);
        ps.hover('m1', 'clem');
        ps.lock('m1', 'clem', 'pounce');
        expect(p.members[0].locked).toBe(false);
        expect(p.members[0].hero).toBeUndefined();
        // a cat cannot be banned by the cat team
        ps.ban('m1', 'sage');
        expect(ps.view(p, 'm1').draft?.votes).toEqual([]);
        ps.ban('m1', 'chili');
        ps.ban('m2', 'bravo');
        ps.ban('m2', 'chili');
        // own team's votes only; the dogs see none of the cats' votes
        expect(ps.view(p, 'm1').draft?.votes).toEqual([
            { member: 'm1', hero: 'chili' },
            { member: 'm2', hero: 'chili' },
        ]);
        expect(ps.view(p, 'm3').draft).toMatchObject({ target: 'cat', votes: [] });
        ps.ban('m3', 'aviete');
        // every player voted: the pick starts at once with both bans shown
        expect(p.draft?.stage).toBe('pick');
        expect(ps.view(p, 'm3').draft).toEqual({
            stage: 'pick',
            target: 'cat',
            bans: [
                { team: 0, by: 'team', hero: 'chili' },
                { team: 1, by: 'team', hero: 'aviete' },
            ],
        });
        expect(ps.view(p, 'm1').deadlineMs).toBe(PARTY_TIMING.pickMs);
    });

    it('a banned champion cannot be hovered, locked or auto-locked, and the plan carries the bans', () => {
        const { ps, starts, tick } = make();
        const p = rankedPvp(ps);
        ps.ban('m3', 'clem');
        tick(RANKED_DRAFT.banMs);
        expect(p.draft?.bans).toEqual([
            { hero: null, by: 'none' },
            { hero: 'clem', by: 'team' },
        ]);
        ps.lock('m1', 'clem', 'pounce');
        expect(p.members[0].locked).toBe(false);
        ps.hover('m2', 'clem');
        expect(p.members[1].hero).toBeUndefined();
        ps.lock('m3', 'chili', 'pounce');
        // the newbie hero is clem: banned, so the auto-lock takes the next free cat
        tick(PARTY_TIMING.pickMs);
        expect(p.members.map(m => m.hero)).not.toContain('clem');
        expect(p.members.every(m => m.locked)).toBe(true);
        for (const m of p.members) ps.loaded(m.id);
        expect(starts).toHaveLength(1);
        expect(starts[0].bans).toEqual(['clem']);
        expect(starts[0].seats.map(x => x.hero)).not.toContain('clem');
    });

    it('a non-draft ranked match keeps the blind pick (no ban phase, no bans in the plan)', () => {
        const { ps } = make();
        const p = rankedPvp(ps, false);
        expect(p.draft).toBeUndefined();
        expect(ps.view(p, 'm1').draft).toBeUndefined();
        ps.lock('m1', 'clem', 'pounce');
        expect(p.members[0].locked).toBe(true);
    });

    it('Ranked vs AI: the bot team bans one of the players species (free this week first), labelled bot', () => {
        const { ps, starts, tick } = make(h => ['clem', 'sage', 'gabe'].includes(h));
        const p = ps.createMatched([{ id: 'm1', identity: id('a') }], {
            match: 'y',
            side: 'cat',
            difficulty: 'normal',
            ranked: true,
            draft: true,
        });
        expect(ps.view(p, 'm1').draft?.target).toBe('dog');
        ps.ban('m1', 'frankie');
        expect(p.draft?.stage).toBe('pick');
        expect(ps.view(p, 'm1').draft?.bans).toEqual([
            { team: 0, by: 'team', hero: 'frankie' },
            { team: 1, by: 'bot', hero: 'clem' },
        ]);
        tick(PARTY_TIMING.pickMs);
        ps.loaded('m1');
        expect(starts[0].bans).toEqual(['frankie', 'clem']);
        expect(starts[0].seats[0].hero).not.toBe('clem');
    });

    it("a mirror never bans one hero twice: the second team's same vote bans nothing", () => {
        const { ps, tick } = make();
        const p = ps.createMatched(
            [
                { id: 'm1', identity: id('a') },
                { id: 'm3', identity: id('c') },
            ],
            {
                match: 'z',
                side: 'cat',
                difficulty: 'hard',
                ranked: true,
                draft: true,
                casual: {
                    slots: { m1: 0, m3: 3 },
                    species: ['cat', 'cat'],
                    fillDifficulty: ['hard', 'hard'],
                    humans: [0, 3],
                },
            }
        );
        ps.ban('m1', 'aviete');
        ps.ban('m3', 'aviete');
        tick(RANKED_DRAFT.banMs);
        expect(p.draft?.bans).toEqual([
            { hero: 'aviete', by: 'team' },
            { hero: null, by: 'none' },
        ]);
    });
});
