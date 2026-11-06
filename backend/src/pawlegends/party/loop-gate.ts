/*
 * Main-thread health gate (MULTIPLAYER.md §3.3, D13): the relay refuses NEW rooms with `server_busy` while the event
 * loop's p99 delay over the last window is above PARTY_LIMITS.loopDelayP99Ms, or a referee worker lags more than
 * PARTY_LIMITS.refereeLagTurns. Running rooms are never stopped.
 */
import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';
import { PARTY_LIMITS } from './party-limits';

export class LoopGate {
    private h: IntervalHistogram | null = null;
    private lastP99 = 0;
    private resetAt = 0;
    private lagTurns = 0;

    /** `sample` (specs): returns the p99 delay in ms instead of the real histogram. */
    constructor(private readonly sample?: () => number, private readonly now: () => number = Date.now) {}

    start(): void {
        if (this.sample || this.h) return;
        this.h = monitorEventLoopDelay({ resolution: 10 });
        this.h.enable();
        this.resetAt = this.now();
    }

    stop(): void {
        this.h?.disable();
        this.h = null;
    }

    /** p99 event-loop delay in ms over the current window. */
    p99Ms(): number {
        if (this.sample) return this.sample();
        if (!this.h) return 0;
        const p = this.h.percentile(99) / 1e6;
        if (this.now() - this.resetAt >= PARTY_LIMITS.loopDelayWindowMs) {
            this.lastP99 = p;
            this.h.reset();
            this.resetAt = this.now();
        }
        return Math.max(p, this.lastP99);
    }

    /** The worst referee lag (turns behind the room clock) the relay saw lately. */
    reportLag(turns: number): void {
        this.lagTurns = turns;
    }

    get lag(): number {
        return this.lagTurns;
    }

    /** True when a new room must be refused. */
    busy(): boolean {
        return this.p99Ms() > PARTY_LIMITS.loopDelayP99Ms || this.lagTurns > PARTY_LIMITS.refereeLagTurns;
    }
}
