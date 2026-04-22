import { ITicket } from "@/models/ticket";
import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from "./api";

async function createTicket(ticket: ITicket): Promise<ITicket> {
  await waitForLocalStorageKey();

  return fetch(`${apiUrl}/ticket`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    } as any,
    body: JSON.stringify(ticket),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
}

async function getTickets(): Promise<ITicket[]> {
  await waitForLocalStorageKey();

  return fetch(`${apiUrl}/ticket`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
}

export const TICKET_API = {
  createTicket,
  getTickets,
};
