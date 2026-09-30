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
  streak: number;
  catpoints: number;
  catpointsRecord: number;
  shelter: string;
  permission: PERMISSION_LEVEL;
}

/**
 * Write payload for POST/PUT /user/profile from the CMS user form. The
 * permission input keeps '' while the number field is empty.
 */
export type IProfileInput = Partial<Omit<IProfile, 'shelter' | 'permission'>> & {
  shelter?: string | null;
  permission?: number | '';
};
