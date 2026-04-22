import { IBlessing } from '@/models/blessing';
import { IBlessingSearch } from '@/models/search';
import { request } from './api';
import { BlessingStatus } from '@/models/cats';

const blessingFetch = async (blessingId: string): Promise<IBlessing | null> => {
  return request<IBlessing>(`/blessing/${blessingId}`, 'GET');
};

const blessingDelete = async (blessingId: string): Promise<any> => {
  return request<any>(`/blessing/${blessingId}`, 'DELETE');
};

const blessingEdit = async (
  blessing: IBlessing,
  custom?: boolean
): Promise<IBlessing | null> => {
  const id = blessing._id;
  const blessingData = { ...blessing };
  delete blessingData._id;
  return request<IBlessing>(
    `/blessing/${id}/${custom ? 'custom' : ''}`,
    'PUT',
    blessingData
  );
};

const blessingCreate = async (
  blessing: IBlessing,
  custom?: boolean
): Promise<IBlessing | null> => {
  return request<IBlessing>(
    `/blessing/${custom ? 'custom' : ''}`,
    'POST',
    blessing
  );
};

const giveCatToUser = async (
  catId: string,
  userId: string
): Promise<IBlessing | null> => {
  return request<IBlessing>(`/cat/gift/${catId}/${userId}`, 'GET');
};

const blessingsFetch = async (
  search: IBlessingSearch
): Promise<IBlessing[] | null> => {
  return request<IBlessing[]>('/blessing/search', 'POST', search);
};

const blessingUpdateStatus = async (
  id: string,
  status: BlessingStatus
): Promise<IBlessing | null> => {
  return request<IBlessing>(`/blessing/${id}/status`, 'PUT', { status });
};

const blessingAvatarUpdate = async (id: string): Promise<IBlessing | null> => {
  return request<IBlessing>(`/blessing/${id}/avatar`, 'PUT', {});
};

export const BLESSING_API = {
  blessingFetch,
  blessingDelete,
  blessingEdit,
  blessingCreate,
  blessingsFetch,
  giveCatToUser,
  blessingUpdateStatus,
  blessingAvatarUpdate
};
