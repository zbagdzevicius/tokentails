import { createHash, randomUUID } from 'crypto';

/*
 * A small PostHog batch sender (no SDK, no new dependency): events wait in memory and go out together with one
 * `POST <host>/batch/` every few seconds or when a batch fills. It never blocks the caller and never throws into it:
 * a network error or a 5xx/429 puts the batch back for a later try (backoff, at most `maxAttempts` sends each), a
 * 4xx drops it, a full queue drops the oldest events. `close()` (Nest shutdown) sends what is left within a deadline,
 * then drops the rest.
 */

export interface PosthogEvent {
    event: string;
    distinct_id: string;
    properties: Record<string, unknown>;
    timestamp: string;
    /** Deterministic for a fact the server may report twice (a retried save), so PostHog keeps one. */
    uuid: string;
}

export type PosthogFetch = (
    url: string,
    init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number }>;

export interface PosthogBatcherOptions {
    token: string;
    host: string;
    fetch?: PosthogFetch;
    flushMs?: number;
    maxBatch?: number;
    maxQueue?: number;
    maxAttempts?: number;
    timeoutMs?: number;
    log?: { warn(message: string): void };
    now?: () => number;
}

interface Queued {
    e: PosthogEvent;
    attempts: number;
}

/** A UUID (v4 layout) from a stable key: the same fact always gets the same event uuid. */
export function stableUuid(key: string): string {
    const h = createHash('sha256').update(key).digest('hex');
    const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const newUuid = (): string => randomUUID();

const defaultFetch: PosthogFetch = (url, init) => (globalThis as any).fetch(url, init);

export class PosthogBatcher {
    private queue: Queued[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;
    private flushing: Promise<void> | null = null;
    private failures = 0;
    private pausedUntil = 0;
    private closed = false;
    /** Counters for the log line and the specs. */
    readonly stats = { sent: 0, dropped: 0, failedSends: 0 };

    private readonly fetch: PosthogFetch;
    private readonly flushMs: number;
    private readonly maxBatch: number;
    private readonly maxQueue: number;
    private readonly maxAttempts: number;
    private readonly timeoutMs: number;
    private readonly now: () => number;
    private warned = -Infinity;

    constructor(private readonly opts: PosthogBatcherOptions) {
        this.fetch = opts.fetch ?? defaultFetch;
        this.flushMs = opts.flushMs ?? 5000;
        this.maxBatch = opts.maxBatch ?? 50;
        this.maxQueue = opts.maxQueue ?? 2000;
        this.maxAttempts = opts.maxAttempts ?? 4;
        this.timeoutMs = opts.timeoutMs ?? 5000;
        this.now = opts.now ?? (() => Date.now());
    }

    get size(): number {
        return this.queue.length;
    }

    enqueue(e: PosthogEvent): void {
        if (this.closed) {
            this.stats.dropped++;
            return;
        }
        this.queue.push({ e, attempts: 0 });
        if (this.queue.length > this.maxQueue) {
            const over = this.queue.length - this.maxQueue;
            this.queue.splice(0, over);
            this.stats.dropped += over;
        }
        this.ensureTimer();
        if (this.queue.length >= this.maxBatch) void this.flush();
    }

    /** Drops every waiting event of a distinct id (consent withdrawn, account deleted). */
    drop(distinctId: string): number {
        const before = this.queue.length;
        this.queue = this.queue.filter(q => q.e.distinct_id !== distinctId);
        const n = before - this.queue.length;
        this.stats.dropped += n;
        return n;
    }

    /** Sends one batch (if any and not backing off). Concurrent calls share one send. */
    flush(force = false): Promise<void> {
        if (this.flushing) return this.flushing;
        if (!this.queue.length) return Promise.resolve();
        if (!force && this.now() < this.pausedUntil) return Promise.resolve();
        this.flushing = this.sendOne().finally(() => {
            this.flushing = null;
        });
        return this.flushing;
    }

    /** Stops the timer and sends what is left until the queue is empty or `deadlineMs` passed. Never throws. */
    async close(deadlineMs = 3000): Promise<void> {
        this.closed = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        const end = this.now() + deadlineMs;
        while (this.queue.length && this.now() < end) {
            // a send already on its way finishes first (it holds events that are no longer in the queue)
            if (this.flushing) {
                await this.flushing;
                continue;
            }
            const before = this.queue.length;
            await this.flush(true);
            // a failed send put the batch back: one more try is all a shutdown gets
            if (this.queue.length >= before) break;
        }
        this.stats.dropped += this.queue.length;
        this.queue = [];
    }

    private ensureTimer(): void {
        if (this.timer || this.closed) return;
        this.timer = setInterval(() => void this.flush(), this.flushMs);
        (this.timer as { unref?: () => void }).unref?.();
    }

    private async sendOne(): Promise<void> {
        const batch = this.queue.splice(0, this.maxBatch);
        if (!batch.length) return;
        const body = JSON.stringify({ api_key: this.opts.token, batch: batch.map(q => q.e) });
        let status = 0;
        try {
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const t = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
            (t as { unref?: () => void } | null)?.unref?.();
            try {
                const res = await this.fetch(`${this.opts.host}/batch/`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body,
                    ...(controller ? { signal: controller.signal } : {}),
                });
                status = res.status;
                if (res.ok) {
                    this.stats.sent += batch.length;
                    this.failures = 0;
                    this.pausedUntil = 0;
                    return;
                }
            } finally {
                if (t) clearTimeout(t);
            }
        } catch {
            status = 0;
        }
        this.stats.failedSends++;
        const retry = status === 0 || status === 429 || status >= 500;
        if (!retry) {
            this.stats.dropped += batch.length;
            this.warn(`posthog batch refused (${status}): ${batch.length} events dropped`);
            return;
        }
        const keep = batch.filter(q => ++q.attempts < this.maxAttempts);
        this.stats.dropped += batch.length - keep.length;
        this.queue.unshift(...keep);
        this.failures++;
        this.pausedUntil = this.now() + Math.min(60_000, this.flushMs * 2 ** Math.min(this.failures, 6));
        this.warn(`posthog batch failed (${status || 'network'}): retrying ${keep.length} events later`);
    }

    /** At most one warning a minute: an outage must not flood the log. */
    private warn(message: string): void {
        const t = this.now();
        if (t - this.warned < 60_000) return;
        this.warned = t;
        this.opts.log?.warn(message);
    }
}
