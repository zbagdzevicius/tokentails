/*
 * The relay side of party chat storage (docs/plans/moba/CHAT-AVATARS.md §5): `chat.say` delivers a line at once and
 * hands it here; every 2 s (or at 50 buffered lines) one `insertMany` writes the lines and one bulk upsert moves each
 * party thread (members, last line, 30-day expiry). Never on the socket path, never throws: errors are counted. Lines
 * still in the buffer answer `pending(mid)`, so a report can name a party line before the flush.
 *
 * Relative imports only: the relay role loads it without the `src/` alias.
 */
import { CHAT_LIMITS } from '../../shared-contracts/chat';
import type { RelayChatLine } from './party-relay';

export const CHAT_FLUSH_MS = 2_000;
export const CHAT_FLUSH_LINES = 50;
const RETAIN_MS = CHAT_LIMITS.retentionDays * 86_400_000;

export interface ChatSinkWriters {
    messages: { insertMany(docs: Record<string, unknown>[], options?: Record<string, unknown>): Promise<unknown> };
    threads: {
        bulkWrite(
            ops: Array<{
                updateOne: { filter: Record<string, unknown>; update: Record<string, unknown>; upsert: boolean };
            }>,
            options?: Record<string, unknown>
        ): Promise<unknown>;
    };
}

export class ChatSink {
    private buffer: Array<{ line: RelayChatLine; members: string[] }> = [];
    private inFlight: Array<{ line: RelayChatLine; members: string[] }> = [];
    private timer: NodeJS.Timeout | null = null;
    private busy = false;
    errors = 0;
    written = 0;

    constructor(
        private readonly writers: ChatSinkWriters | null,
        private readonly log: (event: string, props: Record<string, unknown>) => void = () => undefined
    ) {}

    start(): void {
        if (this.timer || !this.writers) return;
        this.timer = setInterval(() => void this.flush(), CHAT_FLUSH_MS);
        this.timer.unref?.();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    push(line: RelayChatLine, members: string[]): void {
        if (!this.writers) return;
        // a stuck database never grows the buffer without bound: the oldest lines go first
        if (this.buffer.length >= 5000) this.buffer.shift();
        this.buffer.push({ line, members });
        if (this.buffer.length >= CHAT_FLUSH_LINES) void this.flush();
    }

    /** A line not yet written (the report route's fallback). */
    pending(mid: string): RelayChatLine | null {
        return this.pendingEntry(mid)?.line ?? null;
    }

    /** A line not yet written with the party's registered account ids (who may report it). */
    pendingEntry(mid: string): { line: RelayChatLine; members: string[] } | null {
        return this.buffer.find(b => b.line._id === mid) ?? this.inFlight.find(b => b.line._id === mid) ?? null;
    }

    async flush(): Promise<number> {
        if (!this.writers || this.busy || !this.buffer.length) return 0;
        this.busy = true;
        const batch = this.buffer;
        this.buffer = [];
        this.inFlight = batch;
        try {
            await this.writers.messages.insertMany(
                batch.map(({ line }) => {
                    // the thread kind belongs to the thread row, not the message
                    const row: Record<string, unknown> = { ...line, exp: new Date(line.at.getTime() + RETAIN_MS) };
                    delete row.kind;
                    return row;
                }),
                { ordered: false }
            );
            const last = new Map<string, { line: RelayChatLine; members: Set<string> }>();
            for (const { line, members } of batch) {
                const cur = last.get(line.thread) ?? { line, members: new Set<string>() };
                cur.line = line;
                members.forEach(m => cur.members.add(m));
                last.set(line.thread, cur);
            }
            await this.writers.threads.bulkWrite(
                [...last.entries()].map(([thread, { line, members }]) => ({
                    updateOne: {
                        filter: { _id: thread },
                        update: {
                            $setOnInsert: {
                                kind: line.kind ?? 'party',
                                createdAt: line.at,
                                read: {},
                                muted: [],
                                createdBy: '',
                            },
                            $addToSet: { members: { $each: [...members] } },
                            $set: {
                                tier: line.k === 't' ? 'text' : 'quick',
                                lastAt: line.at,
                                lastFrom: line.from,
                                lastPreview:
                                    line.k === 't' ? String(line.text ?? '').slice(0, 40) : `[${line.k}:${line.id}]`,
                                exp: new Date(line.at.getTime() + RETAIN_MS),
                                closedAt: null,
                            },
                        },
                        upsert: true,
                    },
                })),
                { ordered: false }
            );
            this.written += batch.length;
            return batch.length;
        } catch (e) {
            this.errors++;
            this.log('chat_write_error', {
                message: String((e as Error)?.message || e).slice(0, 200),
                lines: batch.length,
            });
            return 0;
        } finally {
            this.inFlight = [];
            this.busy = false;
        }
    }
}
