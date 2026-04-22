import { ITicket } from '@/models/ticket';
import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from './api';

const ticketsFetch = async ({ page }: { page: number }): Promise<ITicket[]> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/ticket/search/unanswered`, {
    method: 'POST',
    body: JSON.stringify({
      perPage: 10,
      page
    }),
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

const ticketEdit = async (ticket: Partial<ITicket>): Promise<ITicket> => {
  const id = ticket._id;
  delete ticket._id;
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/ticket/${id}`, {
    method: 'PUT',
    body: JSON.stringify(ticket),
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

export const TICKET_API = {
  ticketsFetch,
  ticketEdit
};
