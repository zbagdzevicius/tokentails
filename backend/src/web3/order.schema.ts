import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
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
OrderSchema.plugin(uniqueValidator);
