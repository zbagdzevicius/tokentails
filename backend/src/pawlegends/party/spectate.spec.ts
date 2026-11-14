import { SPECTATE_DELAY_MS, SPECTATE_LIMITS } from './net';
import {
    FEATURED_MIN_TURNS,
    delayTurns,
    featuredCount,
    pickFeatured,
    releasedTo,
    watchRefusal,
    type WatchableRoom,
} from './spectate';

/* The pure spectate rules (SPECTATE.md §2–§4): delays, the release of turns, refusals, the featured pick. */

const SIM = { version: 26, hash: 'abcdefabcdefabcd' };
const room = (o: Partial<WatchableRoom> = {}): WatchableRoom => ({
    id: 'aaaaaaaaaaaa',
    kind: 'party',
    humans: [0, 1],
    sim: SIM,
    nextTurn: 1000,
    closed: false,
    viewers: 0,
    classic: false,
    keys: new Set(['guest:player']),
    ...o,
});
const viewer = { sim: SIM, key: 'guest:viewer' };

describe('spectate rules', () => {
    it('delays: co-op and party are short, PvP longer, ranked longest (anti-ghosting)', () => {
        expect(SPECTATE_DELAY_MS.party).toBeLessThan(SPECTATE_DELAY_MS.casual);
        expect(SPECTATE_DELAY_MS.casual).toBeLessThan(SPECTATE_DELAY_MS.ranked);
        expect(delayTurns('party')).toBe(Math.ceil(SPECTATE_DELAY_MS.party / (1000 / 15)));
        expect(delayTurns('ranked', () => 1000)).toBe(15);
    });

    it('releases live minus the delay, then plays the tail out at match pace after the end', () => {
        expect(releasedTo({ nextTurn: 100 }, 15, null, 0)).toBe(85);
        expect(releasedTo({ nextTurn: 5 }, 15, null, 0)).toBe(0);
        const end = { atMs: 10_000, turn: 100 };
        expect(releasedTo({ nextTurn: 100 }, 15, end, 10_000)).toBe(85);
        expect(releasedTo({ nextTurn: 100 }, 15, end, 10_000 + 500)).toBe(92);
        expect(releasedTo({ nextTurn: 100 }, 15, end, 10_000 + 60_000)).toBe(100);
    });

    it('refuses closed, own, other-sim and full rooms', () => {
        expect(watchRefusal(undefined, viewer, 0)).toBe('watch_none');
        expect(watchRefusal(room({ closed: true }), viewer, 0)).toBe('watch_none');
        expect(watchRefusal(room({ keys: new Set([viewer.key]) }), viewer, 0)).toBe('watch_none');
        expect(watchRefusal(room({ sim: { version: 25, hash: SIM.hash } }), viewer, 0)).toBe('watch_update');
        expect(watchRefusal(room(), { ...viewer, sim: null }, 0)).toBe('watch_update');
        expect(watchRefusal(room({ viewers: SPECTATE_LIMITS.perRoom }), viewer, 0)).toBe('watch_full');
        expect(watchRefusal(room(), viewer, SPECTATE_LIMITS.perRelay)).toBe('watch_full');
        expect(watchRefusal(room(), viewer, 0)).toBeNull();
    });

    it('featured: PvP first, then more humans, 5v5, then the longer match; never a fresh, closed or full one', () => {
        const coop = room({ id: 'coop00000000', kind: 'coop', humans: [0, 1, 2] });
        const pvp = room({ id: 'pvp000000000', kind: 'casual', humans: [0, 3] });
        const ranked5 = room({ id: 'rank00000000', kind: 'ranked', humans: [0, 5], classic: true });
        expect(pickFeatured([coop, pvp], viewer)?.id).toBe('pvp000000000');
        expect(pickFeatured([coop, pvp, ranked5], viewer)?.id).toBe('rank00000000');
        expect(pickFeatured([room({ nextTurn: FEATURED_MIN_TURNS - 1 })], viewer)).toBeNull();
        expect(pickFeatured([room({ closed: true })], viewer)).toBeNull();
        expect(pickFeatured([room({ viewers: SPECTATE_LIMITS.perRoom })], viewer)).toBeNull();
        expect(pickFeatured([room({ keys: new Set([viewer.key]) })], viewer)).toBeNull();
        expect(featuredCount([coop, pvp, room({ nextTurn: 10 }), room({ closed: true })])).toBe(2);
    });
});
