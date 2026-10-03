import { HEIST_REPLAY_QUEUE, heistReplayQueue, ReplayQueue, ReplayQueueFullException } from './replay-queue';

describe('ReplayQueue (plan F6 replay CPU bound)', () => {
    const deferredExecutor = () => {
        const pending: { run: () => void }[] = [];
        const execute = <T>(task: () => T) =>
            new Promise<T>((resolve, reject) =>
                pending.push({
                    run: () => {
                        try {
                            resolve(task());
                        } catch (error) {
                            reject(error);
                        }
                    },
                })
            );
        return { execute, pending };
    };

    it('runs at most `concurrency` tasks and queues at most `maxQueued`', async () => {
        const { execute, pending } = deferredExecutor();
        const queue = new ReplayQueue({ concurrency: 2, maxQueued: 1, execute });
        const results = [queue.run(() => 1), queue.run(() => 2), queue.run(() => 3)];
        expect(queue.running).toBe(2);
        expect(queue.queued).toBe(1);
        const task = jest.fn(() => 4);
        expect(() => queue.run(task)).toThrow(ReplayQueueFullException);
        expect(task).not.toHaveBeenCalled();

        pending.shift()!.run();
        await results[0];
        // The waiting task took the free slot.
        expect(queue.running).toBe(2);
        expect(queue.queued).toBe(0);
        while (pending.length) {
            pending.shift()!.run();
            await new Promise(resolve => setImmediate(resolve));
        }
        await expect(Promise.all(results)).resolves.toEqual([1, 2, 3]);
        expect(queue.size).toBe(0);
    });

    it('rejects with 429 and a Retry-After of at least one second', () => {
        const { execute } = deferredExecutor();
        const queue = new ReplayQueue({ concurrency: 1, maxQueued: 0, execute });
        void queue.run(() => 0);
        try {
            void queue.run(() => 0);
            throw new Error('expected a full queue');
        } catch (error) {
            expect(error).toBeInstanceOf(ReplayQueueFullException);
            expect((error as ReplayQueueFullException).getStatus()).toBe(429);
            expect((error as ReplayQueueFullException).retryAfterSeconds).toBeGreaterThanOrEqual(1);
        }
    });

    it('frees the slot when a task throws', async () => {
        const queue = new ReplayQueue({ concurrency: 1, maxQueued: 0 });
        await expect(
            queue.run(() => {
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');
        await expect(queue.run(() => 'next')).resolves.toBe('next');
    });

    it('starts each task on a fresh macrotask, so other requests interleave', async () => {
        const queue = new ReplayQueue({ concurrency: 1, maxQueued: 4 });
        const order: string[] = [];
        const done = queue.run(() => order.push('task'));
        order.push('sync');
        await done;
        expect(order).toEqual(['sync', 'task']);
    });

    it('is configured for main-thread replays: one at a time, 16 waiting', () => {
        expect(HEIST_REPLAY_QUEUE).toEqual({ concurrency: 1, maxQueued: 16 });
        expect(heistReplayQueue.size).toBe(0);
    });
});
