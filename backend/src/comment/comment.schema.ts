import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { SearchModel } from 'src/common/validators';
import { EntityType } from 'src/shared/interfaces/common.interface';

@Schema({ timestamps: true })
export class Comment extends CommonSchema {
    @Prop({ unique: true })
    text: string;
    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;
    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    likes: Types.ObjectId[];
    @Prop({ default: 0 })
    likesCount: number;
    @Prop({ required: true, type: Types.ObjectId })
    entity: Types.ObjectId;
    @Prop({ required: true })
    type: EntityType;
    @Prop({ type: [{ type: Types.ObjectId, ref: 'Comment' }], default: [] })
    comments: Types.ObjectId[];
}

export type IComment = Pick<Comment, keyof Comment>;

export type CommentDocument = Comment & Document;

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.plugin(uniqueValidator);

export class CommentSearchModel extends SearchModel {}
