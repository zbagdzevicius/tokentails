import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';

@Schema({ timestamps: true })
export class Quest extends CommonSchema {
    @Prop({ required: true, unique: true, dropDups: true })
    name: string;

    @Prop({ required: true })
    link: string;

    @Prop({ required: false })
    tails: number;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    image: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    users: Types.ObjectId[];
}

export type QuestDocument = Quest & Document;
export const QuestSchema = SchemaFactory.createForClass(Quest);
QuestSchema.plugin(uniqueValidator);
