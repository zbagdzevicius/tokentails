import { PRESENCE_REFRESH_MS, PresenceSink, type PresenceEntry } from './presence-sink';

/* The relay side of presence (SOCIAL-RANKED.md §4.3): batched, diffed, refreshed, never thrown. */

function sink(entries: () => PresenceEntry[], fail = false) {
    let nowMs = 1_000_000;
    const calls: any[][] = [];
    const writer = {
        bulkWrite: async (ops: any[]) => {
            if (fail) throw new Error('mongo down');
            calls.push(ops);
        },
    };
    const logs: string[] = [];
    const s = new PresenceSink(
        entries,
        writer,
        () => nowMs,
        e => void logs.push(e)
    );
    return { s, calls, logs, advance: (ms: number) => (nowMs += ms) };
}

describe('presence sink (SOCIAL-RANKED.md §4.3)', () => {
    it('writes changes in one bulk, skips unchanged rows, refreshes every 60 s, unsets on leave', async () => {
        let list: PresenceEntry[] = [
            { accountId: 'A', state: 'party', party: 'ABCD', joinable: true },
            { accountId: 'B', state: 'match' },
        ];
        const t = sink(() => list);
        expect(await t.s.flush()).toBe(2);
        expect(t.calls[0][0].updateOne).toMatchObject({
            filter: { _id: 'A' },
            update: {
                $set: { relay: { state: 'party', party: 'ABCD', joinable: true } },
                $max: { exp: expect.any(Date) },
            },
            upsert: true,
        });
        t.advance(5000);
        expect(await t.s.flush()).toBe(0);
        list = [{ accountId: 'A', state: 'queue' }];
        t.advance(5000);
        expect(await t.s.flush()).toBe(2);
        expect(t.calls[1].map((o: any) => [o.updateOne.filter._id, Object.keys(o.updateOne.update)])).toEqual([
            ['A', ['$set', '$max']],
            ['B', ['$unset']],
        ]);
        t.advance(PRESENCE_REFRESH_MS);
        expect(await t.s.flush()).toBe(1);
    });

    it('a write error is counted and logged, never thrown', async () => {
        const t = sink(() => [{ accountId: 'A', state: 'match' }], true);
        await expect(t.s.flush()).resolves.toBe(1);
        expect(t.s.errors).toBe(1);
        expect(t.logs).toEqual(['presence_write_errors']);
    });

    it('without a model it writes nothing', async () => {
        const s = new PresenceSink(() => [{ accountId: 'A', state: 'match' }], null);
        expect(await s.flush()).toBe(0);
    });
});
