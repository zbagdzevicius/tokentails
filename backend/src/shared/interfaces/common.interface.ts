import { ICat } from 'src/cat/cat.schema';

export type IObject = Record<string, unknown>;

export interface IMessage {
    success: boolean;
    message?: string;
    cat?: ICat;
    tails?: number;
}

export interface IAggregationOptions {
    limit?: number;
    skip?: number;
}

export enum EntityType {
    ARTICLE = 'ARTICLE',
    CAT = 'CAT',
    COMMENT = 'COMMENT',
    BLESSING = 'BLESSING',
    PACK = 'PACK',
    IMAGE = 'IMAGE',
}
