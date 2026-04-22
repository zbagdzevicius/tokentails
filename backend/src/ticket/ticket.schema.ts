import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';

@Schema({ timestamps: true })
export class Ticket extends CommonSchema {
    @Prop({ required: true })
    message: string;

    @Prop({ required: false })
    answer: string;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;
}

export type TicketDocument = Ticket & Document;
export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.plugin(uniqueValidator);

TicketSchema.index({ user: 1 });
TicketSchema.index({ answer: 1 });
