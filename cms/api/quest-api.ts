import { IQuest } from '@/models/quest';
import { waitForLocalStorageKey, apiUrl, getAuthHeaders } from './api';

const questsFetch = async (): Promise<IQuest[]> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/search`, {
    method: 'POST',
    body: JSON.stringify({}),
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

const questFetch = async (questId: string): Promise<IQuest> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/${questId}`, {
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

const questEdit = async (quest: IQuest): Promise<IQuest> => {
  const id = quest._id;
  delete quest._id;
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/${id}`, {
    method: 'PUT',
    body: JSON.stringify(quest),
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

const questCreate = async (quest: IQuest): Promise<IQuest> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest`, {
    method: 'POST',
    body: JSON.stringify(quest),
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

const questDelete = async (questId: string): Promise<any> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/${questId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    } as any
  }).then((response) => {
    if (response.ok) {
      return null;
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const QUEST_API = {
  questsFetch,
  questFetch,
  questEdit,
  questCreate,
  questDelete
};
