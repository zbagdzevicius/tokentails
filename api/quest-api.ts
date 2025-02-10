import { QUEST } from "@/components/shared/QuestsModal";
import { waitForLocalStorageKey, apiUrl, getAuthHeaders } from "./api";

const friendInvited = async (): Promise<object> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/friends/invited`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {};
  });
};

const setReferralTelegram = async (telegramId: string): Promise<object> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/referral/${telegramId}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {};
  });
};
const setReferralWeb = async (profileId: string): Promise<object> => {
  if (!profileId) return Promise.resolve({});
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/referralw/${profileId}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {};
  });
};

const complete = async (
  quest: QUEST
): Promise<{ message: string; success?: boolean }> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/quest/${quest}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return { message: "Please try again later", success: false };
  });
};

export const QUEST_API = {
  friendInvited,
  setReferralTelegram,
  setReferralWeb,
  complete,
};
