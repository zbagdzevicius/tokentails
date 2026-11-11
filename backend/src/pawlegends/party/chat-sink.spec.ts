import { ChatSink, CHAT_FLUSH_LINES } from './chat-sink';

/* The party chat sink (CHAT-AVATARS.md §5): batches, upserts the party thread, answers pending lines, never throws. */

const line = (i: number, thread = 'pAAAAAAAAAAAAAAAAAAAAAA') => ({
    _id: i.toString(16).padStart(24, '0'),
    thread,
    from: `acct-${i % 2}`,
    k: 'q' as const,
    id: 12,
    at: new Date(Date.UTC(2026, 10, 12, 12, 0, i)),
});

describe('ChatSink', () => {
    it('buffers, answers pending lines, then writes one batch and one thread upsert with a 30-day expiry', async () => {
        const inserted: any[] = [];
        const ops: any[] = [];
        const sink = new ChatSink({
            messages: { insertMany: async docs => void inserted.push(...docs) },
            threads: { bulkWrite: async o => void ops.push(...o) },
        });
        sink.push(line(1), ['acct-0', 'acct-1']);
        sink.push(line(2), ['acct-0', 'acct-1', 'acct-2']);
        expect(sink.pending(line(2)._id)).toMatchObject({ id: 12 });
        expect(await sink.flush()).toBe(2);
        expect(sink.pending(line(2)._id)).toBeNull();
        expect(inserted).toHaveLength(2);
        expect(inserted[0].exp.getTime() - inserted[0].at.getTime()).toBe(30 * 86_400_000);
        expect(ops).toHaveLength(1);
        expect(ops[0].updateOne.update.$addToSet.members.$each.sort()).toEqual(['acct-0', 'acct-1', 'acct-2']);
        expect(ops[0].updateOne.update.$set.lastPreview).toBe('[q:12]');
    });

    it(`flushes at ${CHAT_FLUSH_LINES} lines and counts errors without throwing`, async () => {
        let calls = 0;
        const sink = new ChatSink({
            messages: {
                insertMany: async () => {
                    calls++;
                    throw new Error('down');
                },
            },
            threads: { bulkWrite: async () => undefined },
        });
        for (let i = 0; i < CHAT_FLUSH_LINES; i++) sink.push(line(i), ['acct-0']);
        await new Promise(r => setTimeout(r, 10));
        expect(calls).toBe(1);
        expect(sink.errors).toBe(1);
    });

    it('without writers nothing is buffered', async () => {
        const sink = new ChatSink(null);
        sink.push(line(1), ['acct-0']);
        expect(sink.pending(line(1)._id)).toBeNull();
        expect(await sink.flush()).toBe(0);
    });
});
