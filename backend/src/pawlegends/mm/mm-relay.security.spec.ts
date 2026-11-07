import { MM_LIMITS } from './mm-limits';
import { bootMm } from './mm-relay.helper-spec';

/* Quick Play abuse guards (M1A-IMPL.md §4.5, §5.5). */

describe('Quick Play relay security', () => {
    jest.setTimeout(90_000);

    it('every mm.* guard: unknown key, bad queue, bad side, bad region, bad offer → bad_message', async () => {
        const b = await bootMm();
        try {
            for (const bad of [
                { t: 'mm.join', queue: 'coop', side: 'any', extra: 1 },
                { t: 'mm.join', queue: 'ranked', side: 'any' },
                { t: 'mm.join', queue: 'coop', side: 'bird' },
                { t: 'mm.join', queue: 'coop', side: 'any', region: 'EU WEST!' },
                { t: 'mm.backfill', offer: 'short', yes: true },
                { t: 'mm.side', side: 1 },
            ]) {
                const c = await b.guest();
                c.send(bad);
                expect((await c.until(() => c.last('error'))).code).toBe('bad_message');
                expect(c.last('mm.status')).toBeUndefined();
            }
            // a region other than eu is accepted on the wire and queued in eu (the only region today)
            const r = await b.guest();
            r.send({ t: 'mm.join', queue: 'coop', side: 'any', region: 'us-east' });
            await r.until(() => r.last('mm.status'));
        } finally {
            await b.stop();
        }
    });

    it('one entry per identity: a second socket of the same person moves the entry (the newest socket wins)', async () => {
        const b = await bootMm();
        try {
            const a1 = await b.client();
            a1.hello({ guestKey: 'same-person-key-1' });
            await a1.until(() => a1.last('welcome'));
            const a2 = await b.client();
            a2.hello({ guestKey: 'same-person-key-1' });
            await a2.until(() => a2.last('welcome'));
            a1.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await a1.until(() => a1.last('mm.status'));
            a2.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await a2.until(() => a2.last('mm.status'));
            expect((await a1.until(() => a1.last('mm.cancel'))).reason).toBe('left');
            expect((b.relay.counters() as Record<string, number>).mm_queued).toBe(1);
        } finally {
            await b.stop();
        }
    });

    it('join rate per identity: over 30 per 10 minutes is mm_locked with retryMs', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            let locked: Record<string, any> | undefined;
            for (let i = 0; i < MM_LIMITS.joins.perIdentity + 1 && !locked; i++) {
                a.send({ t: 'mm.join', queue: 'coop', side: 'any' });
                await a.until(() => a.json.filter(j => j.t === 'mm.status').length > i || a.last('error'));
                locked = a.last('error');
                if (!locked) {
                    a.send({ t: 'mm.leave' });
                    await a.until(() => a.json.filter(j => j.t === 'mm.cancel').length > i);
                }
                // stay under the JSON frame rate (5 per second)
                await new Promise(r => setTimeout(r, 450));
            }
            expect(locked).toMatchObject({ code: 'mm_locked' });
            expect(locked!.retryMs).toBeGreaterThan(0);
        } finally {
            await b.stop();
        }
    });
});
