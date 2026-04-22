import { IBlessing } from '@/models/blessing';
import { IShelter } from '@/models/shelter';
import { waitForLocalStorageKey, apiUrl, getAuthHeaders } from './api';

const sheltersFetch = async (): Promise<IShelter[]> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/shelter`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    } as any
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const shelterFetch = async (shelterId: string): Promise<IShelter> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/shelter/${shelterId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    } as any
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const shelterEdit = async (shelter: IShelter): Promise<IBlessing> => {
  const id = shelter._id;
  delete shelter._id;
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/shelter/${id}`, {
    method: 'PUT',
    body: JSON.stringify(shelter),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    } as any
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const shelterCreate = async (shelter: IShelter): Promise<IShelter> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/shelter`, {
    method: 'POST',
    body: JSON.stringify(shelter),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    } as any
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const SHELTER_API = {
  sheltersFetch,
  shelterFetch,
  shelterEdit,
  shelterCreate
};
