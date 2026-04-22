export enum EntityType {
  ARTICLE = "ARTICLE",
  LOOT_BOX = "LOOT_BOX",
  COMMENT = "COMMENT",
  CAT = "CAT",
  PACK = "PACK",
  IMAGE = "IMAGE",
}

export interface ISave {
  type: EntityType;
  entity: string;
}

export interface ISavedMetadata {
  isLiked: boolean;
}

export type ISaved = ISave & ISavedMetadata;
