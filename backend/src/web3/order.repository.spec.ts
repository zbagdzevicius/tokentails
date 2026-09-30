import { ConflictException } from '@nestjs/common';
import { HASH_ALREADY_USED, OrderRepository } from './order.repository';
import { OrderSchema, OrderStatus } from './order.schema';

function repositoryWith(model: Record<string, jest.Mock>) {
    return new OrderRepository(model as any);
}

describe('Order hash uniqueness', () => {
    it('declares a unique index on hash that skips orders without one', () => {
        const indexes = OrderSchema.indexes() as unknown as Array<[Record<string, unknown>, Record<string, unknown>]>;
        const hashIndex = indexes.find(([fields]) => Object.keys(fields).join() === 'hash');

        expect(hashIndex).toBeDefined();
        expect(hashIndex![1]).toMatchObject({
            unique: true,
            partialFilterExpression: { hash: { $gt: '' } },
        });
    });

    it('turns a duplicate hash into a 409', async () => {
        const duplicate = Object.assign(new Error('E11000 duplicate key error index: hash_unique'), {
            code: 11000,
            keyPattern: { hash: 1 },
        });
        const repository = repositoryWith({ create: jest.fn().mockRejectedValue(duplicate) });

        const attempt = repository.create({ hash: 'h', status: OrderStatus.PENDING } as any);
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow(HASH_ALREADY_USED);
    });

    it('rethrows other errors unchanged', async () => {
        const failure = new Error('connection lost');
        const repository = repositoryWith({ create: jest.fn().mockRejectedValue(failure) });

        await expect(repository.create({ hash: 'h' } as any)).rejects.toBe(failure);
    });

    it('releases a hash by moving it to failedHash and marking the order FAILED', async () => {
        const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        const repository = repositoryWith({ updateOne });

        await repository.releaseHash('order-1', 'h', 'UNDERPAID');

        expect(updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', hash: 'h' },
            {
                $set: { status: OrderStatus.FAILED, failedHash: 'h', failureReason: 'UNDERPAID' },
                $unset: { hash: 1 },
            }
        );
    });
});
