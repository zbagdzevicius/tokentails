import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { controlPortFrom, isLoopback, RelayDrainController } from './relay-drain.controller';

/*
 * POST /pawlegends/relay/drain (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §4.2): loopback callers on the control port only
 * (RELAY_CONTROL_PORT), by socket peer and local port.
 */
describe('RelayDrainController', () => {
    const CONTROL = 9301;
    const PUBLIC = 8080;
    const req = (remoteAddress: string, localPort = CONTROL, forwarded?: string) =>
        ({ socket: { remoteAddress, localPort }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} } as never);
    let saved: string | undefined;
    beforeEach(() => {
        saved = process.env.RELAY_CONTROL_PORT;
        process.env.RELAY_CONTROL_PORT = String(CONTROL);
    });
    afterEach(() => {
        if (saved === undefined) delete process.env.RELAY_CONTROL_PORT;
        else process.env.RELAY_CONTROL_PORT = saved;
    });

    it('accepts loopback peers on the control port only; a forwarded header never counts', () => {
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
        expect(() => c.drain(req('203.0.113.9', CONTROL, '127.0.0.1'), {})).toThrow(ForbiddenException);
        // a loopback peer on the public port (a local reverse proxy in front of the app) is refused
        expect(() => c.drain(req('127.0.0.1', PUBLIC), {})).toThrow(ForbiddenException);
        expect(c.drain(req('127.0.0.1'), { maxMs: 60_000 })).toEqual({
            state: 'draining',
            rooms_live: 2,
            deadline_in_ms: 60_000,
        });
        expect(c.drain(req('::1'), { maxMs: 'soon' })).toMatchObject({ rooms_live: 2 });
        expect(calls).toEqual([60_000, undefined]);
    });

    it('refuses every caller in a process without a control port (DigitalOcean, Cloud Run)', () => {
        delete process.env.RELAY_CONTROL_PORT;
        expect(controlPortFrom()).toBe(0);
        const relay = { drain: () => ({ state: 'draining', rooms_live: 0, deadline_in_ms: 0 }) };
        expect(() => new RelayDrainController(relay as never).drain(req('127.0.0.1', PUBLIC), {})).toThrow(
            ForbiddenException
        );
        expect(controlPortFrom({ RELAY_CONTROL_PORT: '70000' })).toBe(0);
        expect(controlPortFrom({ RELAY_CONTROL_PORT: 'x' })).toBe(0);
    });

    it('answers 404 on the control port of a process without the relay', () => {
        expect(() => new RelayDrainController(undefined).drain(req('127.0.0.1'), {})).toThrow(NotFoundException);
    });
});
