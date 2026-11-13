import { CURRENT_SEASON_ID, seasonDef } from '../pawlegends-catalog';
import type { StoredParty, StoredRoom } from '../party/room-store';
import { codeOf, clubHarness, type Account } from '../clubs/clubs.helper-spec';
import { KUDOS_CHEST_TIERS, KUDOS_PER_DAY, KUDOS_WINDOW_MS } from '../clubs/clubs.contracts';
import { premadeGroups } from './kudos.service';

/*
 * Good-teammate kudos (docs/plans/moba/CLUBS-KUDOS.md §5): checked against the stored room (ended, verified, PvP, not
 * voided, within 2 hours), once per teammate per match, teammates only, never a pre-made party mate, registered
 * accounts only, blocks either way refused; received kudos fill the monthly chest with free-row items in order.
 */

const SLOTS = ['a0', 'a1', 'a2', 'b0', 'b1', 'b2'];
const accounts: Account[] = [...SLOTS.map(id => ({ id, band: '18+' as const })), { id: 'guest', guest: true }];

function room(over: Partial<StoredRoom> = {}, ids: (string | null)[] = SLOTS): StoredRoom {
    const now = new Date(Date.UTC(2026, 10, 11, 12, 0, 0));
    return {
        _id: 'room1',
        party: 'party1',
        simVersion: 26,
        simHash: 'x',
        config: { seed: 1, picks: [], tricks: [], difficulty: 'normal', humans: [0, 1, 2, 3, 4, 5], mode: 'pvp' },
        occupants: ids.map((accountId, slot) => ({
            slot,
            accountId,
            guestKeyHash: null,
            name: `P${slot}`,
            ticketed: true,
        })),
        chunks: [],
        lastTurn: 1,
        lastSeq: [],
        pilotTicks: {},
        openUnclaimedAt1800: false,
        unscored: null,
        status: 'ended',
        verdict: { finalHash: 'x', outcome: 'won', ticks: 8000, winner: 0, verified: true },
        owner: 'boot',
        epoch: 0,
        handoff: false,
        resume: {},
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

const party = (premade: number[][] | null): StoredParty => ({
    _id: 'party1',
    code: 'ABCD',
    doc: premade ? { mm: { match: 'm1', casual: { premade } } } : { leader: 'x' },
    updatedAt: new Date(),
});

function setup(r: StoredRoom = room(), premade: number[][] | null = [[0, 1]]) {
    const h = clubHarness(accounts);
    h.rooms.rooms.set(r._id, r);
    void h.rooms.saveParty(party(premade));
    return h;
}

describe('kudos: who can thumb whom', () => {
    it('a teammate who is not a party mate: once per match (a repeat is a no-op)', async () => {
        const h = setup();
        expect(await h.kudos.give('a0', 'room1', 2)).toEqual({ ok: true });
        expect(await h.kudos.give('a0', 'room1', 2)).toEqual({ ok: true, already: true });
        expect(h.models.kudos.docs).toHaveLength(1);
        expect((await h.kudos.me('a2')).n).toBe(1);
    });

    it('a pre-made party mate is refused; a friends-only party room is all pre-made', async () => {
        expect(await codeOf(setup().kudos.give('a0', 'room1', 1))).toBe('PAWLEGENDS_KUDOS_PREMADE');
        expect(await codeOf(setup(room(), null).kudos.give('a0', 'room1', 2))).toBe('PAWLEGENDS_KUDOS_PREMADE');
        expect(premadeGroups(null)).toBeNull();
        expect(premadeGroups(party([[3, 4]]))).toEqual([[3, 4]]);
    });

    it('opponents, yourself, bots and seats you do not hold are refused', async () => {
        const h = setup(room({}, ['a0', 'a1', null, 'b0', 'b1', 'b2']));
        expect(await codeOf(h.kudos.give('a0', 'room1', 3))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('a0', 'room1', 0))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('a0', 'room1', 2))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('a2', 'room1', 0))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('a0', 'nope', 1))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('a0', 'bad room!', 1))).toBe('PAWLEGENDS_KUDOS_INVALID');
    });

    it('only an ended, verified, PvP room that was not voided, within 2 hours', async () => {
        expect(await codeOf(setup(room({ status: 'live' })).kudos.give('a0', 'room1', 2))).toBe(
            'PAWLEGENDS_KUDOS_UNAVAILABLE'
        );
        expect(
            await codeOf(
                setup(room({ verdict: { finalHash: 'x', outcome: 'won', ticks: 1, winner: 0 } })).kudos.give(
                    'a0',
                    'room1',
                    2
                )
            )
        ).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        const coop = room();
        delete coop.config.mode;
        expect(await codeOf(setup(coop).kudos.give('a0', 'room1', 2))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(setup(room({ void: 'remake' })).kudos.give('a0', 'room1', 2))).toBe(
            'PAWLEGENDS_KUDOS_UNAVAILABLE'
        );
        const late = setup();
        late.clock.advance(KUDOS_WINDOW_MS + 1);
        expect(await codeOf(late.kudos.give('a0', 'room1', 2))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
    });

    it('5v5: slots 0-4 are one team', async () => {
        const ids = Array.from({ length: 10 }, (_, i) => (i < 6 ? SLOTS[i] : null));
        const h = setup(room({ config: { ...room().config, map: 'hearthwood' } }, ids), []);
        expect(await codeOf(h.kudos.give('a0', 'room1', 3))).toBe('ok'); // b0 sits in slot 3: team 0 on Hearthwood
        expect(await codeOf(h.kudos.give('a0', 'room1', 5))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
    });

    it('guests neither give nor get', async () => {
        const h = setup(room({}, ['a0', 'guest', 'a2', 'b0', 'b1', 'b2']), []);
        expect(await codeOf(h.kudos.give('a0', 'room1', 1))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('guest', 'room1', 0))).toBe('PAWLEGENDS_NEED_ACCOUNT');
    });

    it('a block either way is refused', async () => {
        const h = setup();
        await h.models.blocks.create({ _id: 'a2:a0', blocker: 'a2', blocked: 'a0' });
        expect(await codeOf(h.kudos.give('a0', 'room1', 2))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
        expect(await codeOf(h.kudos.give('a2', 'room1', 0))).toBe('PAWLEGENDS_KUDOS_UNAVAILABLE');
    });

    it('at most 40 a day', async () => {
        const h = setup(room(), []);
        for (let i = 0; i < KUDOS_PER_DAY; i++)
            await h.models.kudos.create({ _id: `x${i}`, from: 'a0', to: 'zz', at: h.clock.now(), exp: h.clock.now() });
        expect(await codeOf(h.kudos.give('a0', 'room1', 2))).toBe('PAWLEGENDS_KUDOS_RATE');
    });
});

describe('kudos: the monthly good-teammate chest', () => {
    it('each tier pays once, the next free-row item the player does not own', async () => {
        const h = setup(room(), []);
        const free = seasonDef(CURRENT_SEASON_ID)!.free.map(r => r.item);
        await h.models.owned.create({ accountId: 'a2', item: free[0], source: 'pass' });
        let n = 0;
        for (let i = 0; i < KUDOS_CHEST_TIERS[1]; i++) {
            const r = room({ _id: `room${n}` });
            h.rooms.rooms.set(r._id, r);
            await h.kudos.give(SLOTS[i % 2 === 0 ? 0 : 1], `room${n++}`, 2);
        }
        const me = await h.kudos.me('a2');
        expect(me.n).toBe(KUDOS_CHEST_TIERS[1]);
        expect(me.paid).toEqual([0, 1]);
        expect(me.got.map(g => g.id)).toEqual([free[1], free[2]]);
        const owned = h.models.owned.docs.filter(d => d.accountId === 'a2').map(d => `${d.item}:${d.source}`);
        expect(owned).toEqual([`${free[0]}:pass`, `${free[1]}:kudos`, `${free[2]}:kudos`]);
        expect(me.next.id).toBe(free[3]);
    });

    it('a player who owns every free-row item gets Yarn', async () => {
        const h = setup(room(), []);
        for (const r of seasonDef(CURRENT_SEASON_ID)!.free)
            await h.models.owned.create({ accountId: 'a2', item: r.item, source: 'pass' });
        for (let i = 0; i < KUDOS_CHEST_TIERS[0]; i++) {
            const r = room({ _id: `room${i}` });
            h.rooms.rooms.set(r._id, r);
            await h.kudos.give('a0', `room${i}`, 2);
        }
        expect((await h.kudos.me('a2')).got.map(g => g.id)).toEqual(['yarn:100']);
        expect(h.models.yarn.docs[0]).toMatchObject({ _id: 'a2', balance: 100 });
    });
});
