export enum PERMISSION_LEVEL {
  USER = 1,
  MODERATOR = 2,
  EDITOR = 3,
  MANAGER = 4,
  ADMIN = 5
}

export enum PackType {
  STARTER = 'STARTER',
  INFLUENCER = 'INFLUENCER',
  LEGENDARY = 'LEGENDARY'
}

export interface IProfile {
  _id?: string;
  catpointsToday: number;
  name: string;
  discount: string;
  email: string;
  telegramId: string;
  telegramUsername: string;
  streak: number;
  catpoints: number;
  catpointsRecord: number;
  shelter: string;
  permission: PERMISSION_LEVEL;
}
