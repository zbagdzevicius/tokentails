import { PartyService } from '../party/party.service';
import { MmBridge, type MmRelayApi, type MmSock } from './mm-bridge';
import { MemoryMmRoomStore } from './mm-room.schema';
import { MemoryRatingSource } from './rating.schema';
import { lockUntilOf, SanctionReader } from './sanction-reader';

/* Moderator sanctions at the queue (SOCIAL-RANKED.md §8.4): resolve writes a sanction that mm.join honours. */

const NOW = 1_700_000_000_000;

describe('sanctions at mm.join', () => {
    it('which locks stop which queue', () => {
        const rows = [
            { kind: 'ranked_lock', until: new Date(NOW + 1000) },
            { kind: 'pvp_ban', until: null },
        ];
        expect(lockUntilOf(rows, 'ranked', NOW)).toBe(Infinity);
        expect(lockUntilOf(rows, 'casual', NOW)).toBe(Infinity);
        expect(lockUntilOf(rows, 'coop', NOW)).toBe(0);
        expect(lockUntilOf([{ kind: 'queue_lock', until: new Date(NOW + 5000) }], 'coop', NOW)).toBe(NOW + 5000);
        expect(lockUntilOf([{ kind: 'queue_lock', until: new Date(NOW - 1) }], 'coop', NOW)).toBe(0);
        expect(lockUntilOf([{ kind: 'warn', until: null }], 'casual', NOW)).toBe(0);
    });

    it('the reader caches for 60 s and never throws', async () => {
        let calls = 0;
        let nowMs = NOW;
        const reader = new SanctionReader(
            {
                find: () => ({
                    lean: async () => {
                        calls++;
                        if (calls === 3) throw new Error('down');
                        return [{ kind: 'queue_lock', until: new Date(NOW + 600_000) }];
                    },
                }),
            },
            () => nowMs
        );
        expect(await reader.lockUntil('A', 'coop')).toBe(NOW + 600_000);
        expect(await reader.lockUntil('A', 'coop')).toBe(NOW + 600_000);
        expect(calls).toBe(1);
        nowMs += 61_000;
        await reader.lockUntil('A', 'coop');
        nowMs += 61_000;
        await expect(reader.lockUntil('A', 'coop')).resolves.toBe(NOW + 600_000);
    });

    it('a locked account is refused mm_locked with the time left', async () => {
        const sent: { to: string; msg: Record<string, any> }[] = [];
        const parties = new PartyService(
            {
                heroes: ['clem', 'sage', 'nugget'],
                tricks: ['pounce'],
                difficulties: ['rookie', 'easy', 'normal', 'hard'],
                sideOf: h => (h === 'nugget' ? 'dog' : 'cat'),
                newbieHero: 'clem',
            },
            { changed: () => undefined, send: () => undefined, startMatch: () => undefined },
            () => NOW
        );
        const s: MmSock = {
            member: 'm1',
            proto: 2,
            identity: { accountId: 'A', guestKeyHash: null, key: 'acct:A', ticketed: true, guest: false, ipKey: 'h1' },
            ip: '10.0.0.1',
            netKey: 'net1',
            sim: { version: 14, hash: 'abc' },
            conn: 'on',
        };
        const api: MmRelayApi = {
            parties,
            now: () => NOW,
            log: () => undefined,
            sock: m => (m === 'm1' ? s : null),
            send: (to, msg) => sent.push({ to, msg }),
            canSeat: () => true,
            room: () => null,
            leaveParty: m => parties.leave(m),
            backfill: () => false,
            evict: () => undefined,
            release: () => undefined,
            rejoin: () => false,
        };
        const bridge = new MmBridge(api, {
            rooms: new MemoryMmRoomStore(),
            ratings: new MemoryRatingSource(),
            sanctions: { lockUntil: async () => NOW + 3_600_000 },
        });
        bridge.onJson('m1', { t: 'mm.join', queue: 'coop', side: 'any' });
        for (let i = 0; i < 5; i++) await Promise.resolve();
        await new Promise(r => setImmediate(r));
        const err = sent.find(x => x.msg.t === 'error')?.msg;
        expect(err).toMatchObject({ code: 'mm_locked', retryMs: 3_600_000 });
        expect(sent.some(x => x.msg.t === 'mm.queued')).toBe(false);
        bridge.shutdown();
    });
});
