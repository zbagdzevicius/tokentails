import { normalizeCatName } from '../../shared-contracts/name';
import { SIM_VERSION, simFor } from '../../vendor/pawlegends-sim';
import { checkNick, looksGenerated, NICK_RESERVED } from '../social/nickname';
import { makePersonas, personaHero, personaView, PERSONA_REGION_FLAGS } from './bot-persona';
import { PARTY_TIMING, PartyService, type MemberIdentity, type PartyCasual, type StartPlan } from './party.service';

/*
 * Casual bot seats as players (founder, 2026-11-19): the generator (names, flags, avatars, champions) and the party
 * service's persona lifecycle (made at the pick, locking like a player, seated at the start, never for ranked).
 */

/** A seeded uniform draw (mulberry32). */
function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const HEROES = ['clem', 'mochi', 'nova', 'rex', 'biscuit', 'duke'];
const SIDE: Record<string, string> = {
    clem: 'cat',
    mochi: 'cat',
    nova: 'cat',
    rex: 'dog',
    biscuit: 'dog',
    duke: 'dog',
};

describe('bot personas: the generator', () => {
    it('names every bot seat in the generated player shape, never a real nickname, never "Bot", unique in the match', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const ps = makePersonas({
                slots: [1, 2, 3, 4, 5],
                playerFlags: ['LT'],
                taken: ['Sunny Tabby'],
                heroes: HEROES,
                rand: seeded(seed),
            });
            expect(ps.map(p => p.slot)).toEqual([1, 2, 3, 4, 5]);
            const names = ps.map(p => p.name);
            expect(new Set(names.map(n => n.toLowerCase())).size).toBe(5);
            expect(names).not.toContain('Sunny Tabby');
            for (const n of names) {
                expect(n).not.toMatch(/\bbot\b/i);
                // the shape every unnamed player shows, which a chosen nickname may never take (no collision)
                expect(looksGenerated(n)).toBe(true);
                expect(checkNick(n).ok).toBe(false);
                // and it passes the profanity and reserved lists of a real name
                expect(normalizeCatName(n, { reserved: NICK_RESERVED }).ok).toBe(true);
            }
            for (const p of ps) {
                expect(p.av.i).toMatch(/^h:(clem|mochi|nova|rex|biscuit|duke)$/);
                if (p.cc !== null) expect(p.cc).toMatch(/^[A-Z]{2}$/);
            }
        }
    });

    it("draws flags towards the match's players: about half their flags, some hidden, the rest the region's", () => {
        const rand = seeded(7);
        let mine = 0;
        let hidden = 0;
        let region = 0;
        const N = 4000;
        for (let i = 0; i < N / 5; i++) {
            for (const p of makePersonas({
                slots: [1, 2, 3, 4, 5],
                playerFlags: ['BR', null],
                taken: [],
                heroes: HEROES,
                rand,
            })) {
                if (p.cc === 'BR') mine++;
                else if (p.cc === null) hidden++;
                else if (PERSONA_REGION_FLAGS.includes(p.cc)) region++;
            }
        }
        expect(mine / N).toBeGreaterThan(0.5);
        expect(mine / N).toBeLessThan(0.6);
        expect(hidden / N).toBeGreaterThan(0.12);
        expect(hidden / N).toBeLessThan(0.18);
        expect(mine + hidden + region).toBe(N);
        // nobody in the match shows a flag: the region's list (or hidden)
        for (const p of makePersonas({ slots: [1, 2, 3], playerFlags: [null], taken: [], heroes: HEROES, rand }))
            expect(p.cc === null || PERSONA_REGION_FLAGS.includes(p.cc)).toBe(true);
    });

    it('the view never carries the lock moment; the other team keeps its champion hidden in the pick', () => {
        const p = {
            slot: 4,
            name: 'Fancy Calico',
            cc: 'LT',
            av: { i: 'h:rex' },
            hero: 'duke',
            trick: 'dash',
            lockAtMs: 9,
        };
        expect(personaView(p)).toEqual({
            slot: 4,
            name: 'Fancy Calico',
            cc: 'LT',
            av: { i: 'h:rex' },
            hero: 'duke',
            locked: true,
        });
        expect(personaView(p, true)).toEqual({ slot: 4, name: 'Fancy Calico', cc: 'LT', av: { i: 'h:rex' } });
        expect(personaView({ ...p, cc: null, hero: undefined })).toEqual({
            slot: 4,
            name: 'Fancy Calico',
            av: { i: 'h:rex' },
        });
    });

    it('a persona picks its team species, a champion no teammate holds or hovers, never a banned one', () => {
        const sideOf = (h: string) => SIDE[h] ?? null;
        for (let seed = 1; seed <= 50; seed++) {
            const h = personaHero({
                heroes: HEROES,
                sideOf,
                species: 'dog',
                taken: ['rex'],
                locked: ['rex'],
                banned: ['duke'],
                rand: seeded(seed),
            });
            expect(h).toBe('biscuit');
        }
        // every dog held: a repeat of one nobody locked (the sim's rule), else none
        expect(
            personaHero({
                heroes: HEROES,
                sideOf,
                species: 'dog',
                taken: ['rex', 'biscuit', 'duke'],
                locked: ['rex', 'biscuit'],
                rand: seeded(1),
            })
        ).toBe('duke');
        expect(
            personaHero({
                heroes: HEROES,
                sideOf,
                species: 'dog',
                taken: ['rex', 'biscuit', 'duke'],
                locked: ['rex', 'biscuit', 'duke'],
            })
        ).toBeUndefined();
    });
});

const ident = (n: string): MemberIdentity => ({
    accountId: `acct-${n}`,
    guestKeyHash: null,
    key: `acct:${n}`,
    ticketed: true,
    guest: false,
});

/** The live sim's party API: the personas' champions come from its own seeded fill (`fillPicksParty`). */
const ps = simFor(SIM_VERSION)!.party!;
const LIVE_HEROES = ps.HERO_IDS as readonly string[];
const sideOf = (h: string): string | null => ps.heroSideOf(h);

function setup() {
    let now = 1_000_000;
    const starts: StartPlan[] = [];
    const svc = new PartyService(
        {
            heroes: LIVE_HEROES,
            tricks: ps.TRICK_IDS as readonly string[],
            difficulties: ['rookie', 'easy', 'normal', 'hard'],
            sideOf,
            newbieHero: 'clem',
            // the relay's rule (party-relay.ts botPicksOf): the room's fill on the map the seed draws
            botPicks: (_p, seed, lead) => {
                const drawn = ps.pickMap3v3 ? ps.pickMap3v3(seed) : undefined;
                const map = drawn && drawn !== 'crossing' ? drawn : undefined;
                return (map ? ps.fillPicksParty(seed, [lead] as never, map) : ps.fillPicksParty(seed, [lead] as never))
                    .picks as string[];
            },
        },
        {
            changed: () => undefined,
            send: () => undefined,
            startMatch: plan => void starts.push(plan),
            flagOf: id => (id === 'a' ? 'LT' : null),
        },
        () => now
    );
    return {
        svc,
        starts,
        advance: (ms: number) => {
            now += ms;
            svc.tick();
        },
    };
}

/** The relay's room picks for a start plan (party-relay.ts startMatch, without bans). */
function roomPicks(plan: StartPlan): string[] {
    const drawn = ps.pickMap3v3 ? ps.pickMap3v3(plan.seed) : undefined;
    const map = drawn && drawn !== 'crossing' ? drawn : undefined;
    return (
        map ? ps.fillPicksParty(plan.seed, plan.seats as never, map) : ps.fillPicksParty(plan.seed, plan.seats as never)
    ).picks as string[];
}

const casualOf = (slots: Record<string, number>): PartyCasual => ({
    slots,
    species: ['cat', 'dog'],
    fillDifficulty: ['normal', 'normal'],
    humans: Object.values(slots).sort((a, b) => a - b),
});
/** A lone search seated against a team of bots: the human on team 1 (slot 3), as the matchmaker may flip it. */
const loneCasual = (): PartyCasual => casualOf({ a: 3 });
const dogOf = (taken: string[] = []) => LIVE_HEROES.find(h => sideOf(h) === 'dog' && !taken.includes(h))!;
const catOf = (taken: string[] = []) => LIVE_HEROES.find(h => sideOf(h) === 'cat' && !taken.includes(h))!;

describe('bot personas: the party lifecycle', () => {
    it('a casual pick shows every bot seat as a player; each locks the champion the room then plays', () => {
        for (let round = 0; round < 12; round++) {
            const t = setup();
            const p = t.svc.createMatched([{ id: 'a', identity: ident('a') }], {
                match: `m${round}`,
                side: 'dog',
                difficulty: 'hard',
                casual: loneCasual(),
            });
            const v0 = t.svc.view(p, 'a');
            const fill = v0.mm!.fill!;
            expect(fill.map(x => x.slot)).toEqual([0, 1, 2, 4, 5]);
            // nothing locked at the open; the other team's choice is hidden in the pick anyway
            expect(fill.every(x => !x.hero && !x.locked)).toBe(true);
            expect(JSON.stringify(v0)).not.toMatch(/"Bot"|lockAtMs|seed/);
            // by the end of the window every persona locked; the own team's locks show, the other team's stay hidden
            t.advance(PARTY_TIMING.personaLockMs[1] + 500);
            const v1 = t.svc.view(p, 'a');
            const mine = v1.mm!.fill!.filter(x => x.slot >= 3);
            const theirs = v1.mm!.fill!.filter(x => x.slot < 3);
            expect(mine.every(x => x.locked && sideOf(x.hero!) === 'dog')).toBe(true);
            expect(theirs.every(x => !x.hero)).toBe(true);
            t.svc.lock('a', dogOf(), ps.TRICK_IDS[0]);
            t.svc.loaded('a');
            expect(t.starts).toHaveLength(1);
            const plan = t.starts[0];
            // the pick's seed is the room's; the lead seat 0 is piloted with the persona's champion
            expect(plan.seed).toBe(p.mm!.casual!.seed);
            expect(plan.humans).toEqual([0, 3]);
            // every persona plays exactly the champion it showed (the replay re-sims these picks)
            const picks = roomPicks(plan);
            for (const x of p.mm!.casual!.personas!) {
                expect(picks[x.slot]).toBe(x.hero);
                expect(sideOf(x.hero!)).toBe(x.slot < 3 ? 'cat' : 'dog');
            }
            expect(t.svc.view(p, 'a').mm!.fill!.every(x => x.locked)).toBe(true);
        }
    });

    it("team 0's personas follow slot 0's champion: they lock once the player there locked", () => {
        const t = setup();
        const p = t.svc.createMatched([{ id: 'a', identity: ident('a') }], {
            match: 'm-lead',
            side: 'cat',
            difficulty: 'hard',
            casual: casualOf({ a: 0, b: 3 }),
        });
        t.advance(PARTY_TIMING.personaLockMs[1] + 500);
        const c = p.mm!.casual!;
        expect(c.personas!.filter(x => x.slot < 3).every(x => !x.hero)).toBe(true);
        expect(c.personas!.filter(x => x.slot >= 3).every(x => !!x.hero)).toBe(true);
        t.svc.lock('a', catOf(), ps.TRICK_IDS[0]);
        t.advance(500);
        expect(c.personas!.every(x => !!x.hero)).toBe(true);
    });

    it('a pick the players finish early locks every persona at once (never a persona left choosing)', () => {
        const t = setup();
        const p = t.svc.createMatched([{ id: 'a', identity: ident('a') }], {
            match: 'm2',
            side: 'dog',
            difficulty: 'hard',
            casual: loneCasual(),
        });
        t.svc.lock('a', dogOf(), ps.TRICK_IDS[0]);
        expect(p.phase).toBe('loading');
        expect(p.mm!.casual!.personas!.every(x => !!x.hero)).toBe(true);
    });

    it('ranked never gets personas: its bot seats stay labelled', () => {
        const t = setup();
        const p = t.svc.createMatched([{ id: 'a', identity: ident('a') }], {
            match: 'm3',
            side: 'dog',
            difficulty: 'hard',
            casual: loneCasual(),
            ranked: true,
        });
        expect(p.mm!.casual!.personas).toBeUndefined();
        expect(p.mm!.casual!.seed).toBeUndefined();
        expect(t.svc.view(p, 'a').mm!.fill).toBeUndefined();
    });
});
