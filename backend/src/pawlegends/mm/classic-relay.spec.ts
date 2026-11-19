import { bootMm } from './mm-relay.helper-spec';

/*
 * 5v5 Classic is retired from the menu (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 19: one 3v3 main queue). The
 * relay refuses a new `mm.join {queue:'classic'}` with `mm_locked`, reason `mode_retired`; the casual 3v3 queue stays
 * open from the first session. The matchmaker's 5v5 rules stay in code (matchmaker-classic.spec.ts) for old rooms.
 */

describe('5v5 Classic relay (retired, MODE-UNLOCKS.md)', () => {
    jest.setTimeout(120_000);

    it('refuses new classic joins with mode_retired, at any level; casual 3v3 still queues', async () => {
        const b = await bootMm();
        try {
            const vet = await b.veteran({ hint: { maxDifficulty: 'normal', newbie: false, matches: 40 } });
            const fresh = await b.guest({ hint: { maxDifficulty: 'easy', newbie: true, matches: 0 } });
            for (const c of [vet, fresh]) {
                c.send({ t: 'mm.join', queue: 'classic', side: 'any' });
                const err = await c.until(() => c.last('error'));
                expect(err).toMatchObject({ code: 'mm_locked', reason: 'mode_retired', mode: 'classic' });
                expect(c.last('mm.status')).toBeUndefined();
            }
            expect((b.relay.counters() as Record<string, number>).mm_queued ?? 0).toBe(0);
            fresh.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            expect((await fresh.until(() => fresh.last('mm.status'))).queue).toBe('casual');
        } finally {
            await b.stop();
        }
    });
});
