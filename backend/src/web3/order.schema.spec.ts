import * as mongoose from 'mongoose';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { ORDER_HASH_INDEX, OrderSchema, OrderStatus, PackType } from './order.schema';

// A model on a connection that never opens: validate() runs in memory, and any query a validator
// issues goes to the stubbed find/countDocuments below instead of MongoDB.
const connection = mongoose.createConnection();
const Order = connection.model('OrderSchemaSpec', OrderSchema);

const order = (hash: string) =>
    new Order({
        status: OrderStatus.PENDING,
        hash,
        price: 5,
        entityType: EntityType.PACK,
        id: PackType.STARTER,
    });

describe('OrderSchema', () => {
    afterEach(() => jest.restoreAllMocks());

    it('keeps the partial unique index on hash', () => {
        const index = (OrderSchema.indexes() as any[]).find(([, options]) => options?.name === ORDER_HASH_INDEX);
        expect(index).toEqual([
            { hash: 1 },
            expect.objectContaining({ unique: true, partialFilterExpression: { hash: { $gt: '' } } }),
        ]);
    });

    it('has no query-based unique validator on hash', () => {
        const validators = (OrderSchema.path('hash') as any).validators.map((v: any) => v.type);
        expect(validators).not.toContain('unique');
    });

    it('validates a new order without querying, even when another order already has a hash', async () => {
        // What mongoose-unique-validator would see if the collection held any order with a hash.
        const find = jest.spyOn(Order, 'find').mockReturnValue({ exec: async () => [{ _id: 'x' }] } as any);
        const count = jest.spyOn(Order, 'countDocuments').mockReturnValue({ exec: async () => 1 } as any);

        await expect(order('b'.repeat(64)).validate()).resolves.toBeUndefined();
        expect(find).not.toHaveBeenCalled();
        expect(count).not.toHaveBeenCalled();
    });
});
