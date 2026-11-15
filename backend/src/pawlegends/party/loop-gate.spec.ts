import * as perfHooks from 'perf_hooks';
import { LoopGate, LOOP_SAMPLE_MS } from './loop-gate';
import { maxLiveRoomsFrom, PARTY_LIMITS } from './party-limits';

describe('LoopGate', () => {
    afterEach(() => jest.restoreAllMocks());

    it('reads an idle loop as (near) zero delay, not the sampling interval', () => {
        // Node's histogram records the whole interval between samples: an idle loop reads about LOOP_SAMPLE_MS. Before,
        // the gate compared that raw value with the 20 ms budget, so it refused rooms at about 9 ms of real delay.
        // The histogram is Node's, read as an idle loop reads it (p99 = the interval plus 0.4 ms): the real loop of a
        // test process on a loaded machine is not idle, and the gate's arithmetic is what this checks.
        let p99Ns = (LOOP_SAMPLE_MS + 0.4) * 1e6;
        const histogram = { enable: jest.fn(), disable: jest.fn(), reset: jest.fn(), percentile: jest.fn(() => p99Ns) };
        const spy = jest
            .spyOn(perfHooks, 'monitorEventLoopDelay')
            .mockReturnValue(histogram as unknown as perfHooks.IntervalHistogram);
        const gate = new LoopGate(undefined, () => 0);
        gate.start();
        expect(spy).toHaveBeenCalledWith({ resolution: LOOP_SAMPLE_MS });
        expect(histogram.percentile).not.toHaveBeenCalled();
        const p = gate.p99Ms();
        expect(histogram.percentile).toHaveBeenCalledWith(99);
        expect(p).toBeCloseTo(0.4, 6);
        expect(gate.busy()).toBe(false);
        // the budget applies to the delay beyond the interval: interval + budget is still fine, a little more is busy
        p99Ns = (LOOP_SAMPLE_MS + PARTY_LIMITS.loopDelayP99Ms) * 1e6;
        expect(gate.busy()).toBe(false);
        p99Ns = (LOOP_SAMPLE_MS + PARTY_LIMITS.loopDelayP99Ms + 0.5) * 1e6;
        expect(gate.busy()).toBe(true);
        gate.stop();
        expect(histogram.disable).toHaveBeenCalled();
    });

    it('reads the real event loop without throwing', async () => {
        const gate = new LoopGate();
        gate.start();
        await new Promise(r => setTimeout(r, 50));
        expect(gate.p99Ms()).toBeGreaterThanOrEqual(0);
        gate.stop();
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
