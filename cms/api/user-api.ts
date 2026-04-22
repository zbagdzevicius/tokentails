import { IBlessing } from '@/models/blessing';
import { IProfile, PackType } from '@/models/profile';
import { ISearch } from '@/models/search';
import { request } from './api';

const profileFetch = async (id?: string): Promise<IProfile | null> => {
  return request<IProfile>(`/user/profile/${id || ''}`, 'GET');
};

const grantPack = async (
  id: string,
  packType: PackType
): Promise<IProfile | null> => {
  return request<IProfile>(`/web3/pack/${packType}/${id}`, 'GET');
};

const userEdit = async (profile: IProfile): Promise<IBlessing | null> => {
  const id = profile._id;
  const profileData = { ...profile };
  delete profileData._id;
  return request<IBlessing>(`/user/profile/${id}`, 'PUT', profileData);
};

const userCreate = async (profile: IProfile): Promise<IProfile | null> => {
  return request<IProfile>('/user/profile', 'POST', profile);
};

const usersFetch = async (search: ISearch): Promise<IProfile[] | null> => {
  return request<IProfile[]>('/user/search', 'POST', search);
};

const sendBoxes = async (
  entities: string[],
  type: 'twitter' | 'discord'
): Promise<IProfile[] | null> => {
  return request<IProfile[]>(`/user/loot/${type}`, 'POST', {
    [type]: entities
  });
};

export const USER_API = {
  profileFetch,
  userEdit,
  userCreate,
  usersFetch,
  grantPack,
  sendBoxes
};
