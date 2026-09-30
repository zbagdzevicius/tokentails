import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { ChainType } from './web3.model';

export enum OrderStatus {
    COMPLETE = 'COMPLETE',
    PENDING = 'PENDING',
    LOCKED = 'LOCKED',
    FAILED = 'FAILED',
}

export enum PackType {
    STARTER = 'STARTER',
    INFLUENCER = 'INFLUENCER',
    LEGENDARY = 'LEGENDARY',
}

export enum ProductType {
    DIGITAL = 'digital',
    PRINT = 'print',
    CANVAS = 'canvas',
}

@Schema({ timestamps: true })
export class Order extends CommonSchema {
    @Prop({ required: true })
    status: OrderStatus;

    @Prop({ required: true })
    hash: string;

    // A Stellar order that failed verification moves its hash here so the payer can retry.
    @Prop({ required: false })
    failedHash?: string;

    @Prop({ required: false })
    failureReason?: string;

    @Prop({ required: false })
    walletAddress?: string;

    @Prop({ required: false })
    discount?: string;

    @Prop({ required: false })
    chainType?: ChainType;

    @Prop({ required: false })
    currencyType?: CurrencyType;

    @Prop({ required: true })
    price: number;

    @Prop({ required: false })
    priceUsd: number;

    // PRODUCT
    @Prop({ required: false, type: String })
    id: Types.ObjectId | string;

    @Prop({ required: false })
    ref: string;

    @Prop({ required: true })
    entityType: EntityType;

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Image' })
    image?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    user?: Types.ObjectId;
}

export type OrderDocument = Order & Document;

export type IOrder = Pick<Order, keyof Order>;

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ chainType: 1 });
OrderSchema.index({ entityType: 1 });
OrderSchema.index({ price: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ ref: 1 });
OrderSchema.index({ id: 1 });
OrderSchema.index({ image: 1 });
OrderSchema.index({ user: 1, entityType: 1, status: 1 });
// One order per payment: a Stellar transaction hash, Stripe session id or PaymentIntent id.
// Partial so orders without a hash (released after a failed verification) do not collide.
// The build fails while duplicates exist: run scripts/audit-orders.js first (docs/BACKEND.md).
export const ORDER_HASH_INDEX = 'hash_unique';
OrderSchema.index(
    { hash: 1 },
    { unique: true, name: ORDER_HASH_INDEX, partialFilterExpression: { hash: { $gt: '' } } }
);
OrderSchema.on('init', model => {
    // Mongoose builds indexes in the background and otherwise drops the error silently.
    model.on('index', (error?: Error) => {
        if (error) {
            console.error(`Order index build failed; duplicate order hashes must be resolved first: ${error.message}`);
        }
    });
});
// No mongoose-unique-validator here. It would add a validator for `hash_unique` that merges the
// partialFilterExpression into its query, so every create checked `{ hash: { $gt: '' } }` and failed
// once any order had a hash. Duplicates surface as E11000, which OrderRepository.create maps to 409.
