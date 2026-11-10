import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { isLoopback, RelayDrainController } from './relay-drain.controller';

/* POST /pawlegends/relay/drain (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §4.2): loopback callers only, by socket peer. */
describe('RelayDrainController', () => {
    const req = (remoteAddress: string, forwarded?: string) =>
        ({ socket: { remoteAddress }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} } as never);

    it('accepts loopback peers only; a forwarded header never counts', () => {
        expect(isLoopback('127.0.0.1')).toBe(true);
        expect(isLoopback('::1')).toBe(true);
        expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
        expect(isLoopback('10.0.0.5')).toBe(false);
        expect(isLoopback(undefined)).toBe(false);
        const calls: (number | undefined)[] = [];
        const relay = {
            drain: (ms?: number) => {
                calls.push(ms);
                return { state: 'draining', rooms_live: 2, deadline_in_ms: ms ?? 540_000 };
            },
        };
        const c = new RelayDrainController(relay as never);
        expect(() => c.drain(req('203.0.113.9', '127.0.0.1'), {})).toThrow(ForbiddenException);
        expect(c.drain(req('127.0.0.1'), { maxMs: 60_000 })).toEqual({
            state: 'draining',
            rooms_live: 2,
            deadline_in_ms: 60_000,
        });
        expect(c.drain(req('::1'), { maxMs: 'soon' })).toMatchObject({ rooms_live: 2 });
        expect(calls).toEqual([60_000, undefined]);
    });

    it('answers 404 in a process without the relay (the Cloud Run API role)', () => {
        expect(() => new RelayDrainController(undefined).drain(req('127.0.0.1'), {})).toThrow(NotFoundException);
    });
});
