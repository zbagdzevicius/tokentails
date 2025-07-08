export enum EntityType {
  ARTICLE = "ARTICLE",
  PRESALE = "PRESALE",
  MYSTERY_BOX = "MYSTERY_BOX",
  LOOT_BOX = "LOOT_BOX",
  COMMENT = "COMMENT",
  CAT = "CAT",
}

export interface ISave {
  type: EntityType;
  entity: string;
}

export interface ISavedMetadata {
  isLiked: boolean;
}

export type ISaved = ISave & ISavedMetadata;
