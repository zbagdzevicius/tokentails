import { LoopGate, LOOP_SAMPLE_MS } from './loop-gate';
import { maxLiveRoomsFrom, PARTY_LIMITS } from './party-limits';

describe('LoopGate', () => {
    it('reads an idle loop as (near) zero delay, not the sampling interval', async () => {
        // Node's histogram records the whole interval between samples: an idle loop reads about LOOP_SAMPLE_MS. Before,
        // the gate compared that raw value with the 20 ms budget, so it refused rooms at about 9 ms of real delay.
        const gate = new LoopGate();
        gate.start();
        await new Promise(r => setTimeout(r, 300));
        const p = gate.p99Ms();
        gate.stop();
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(LOOP_SAMPLE_MS);
        expect(gate.busy()).toBe(false);
    });

    it('is busy only above the budget', () => {
        let v = PARTY_LIMITS.loopDelayP99Ms;
        const gate = new LoopGate(() => v);
        expect(gate.busy()).toBe(false);
        v += 0.1;
        expect(gate.busy()).toBe(true);
    });
});

describe('maxLiveRoomsFrom', () => {
    it('reads PARTY_MAX_LIVE_ROOMS and falls back to the default for anything else', () => {
        expect(maxLiveRoomsFrom({})).toBe(PARTY_LIMITS.maxLiveRooms);
        expect(maxLiveRoomsFrom({ PARTY_MAX_LIVE_ROOMS: '140' })).toBe(140);
        for (const bad of ['', '0', '-5', '1001', '12.5', 'lots', '1e3']) {
            expect(maxLiveRoomsFrom({ PARTY_MAX_LIVE_ROOMS: bad })).toBe(PARTY_LIMITS.maxLiveRooms);
        }
    });
});
