export enum EntityType {
    ARTICLE = 'ARTICLE',
    PRESALE = 'PRESALE',
    QUIZ = 'QUIZ',
    VIDEO = 'VIDEO',
    VIDEO_SLIDER = 'VIDEO_SLIDER',
    COMMENT = 'COMMENT',
    GROUP = 'GROUP',
    PUBLICATION = 'PUBLICATION',
    CAT = 'CAT',
}

export interface ISave {
    type: EntityType;
    entity: string;
}

export interface ISavedMetadata {
    isLiked: boolean;
    isUnliked: boolean;
    isSaved: boolean;
}

export type ISaved = ISave & ISavedMetadata;
