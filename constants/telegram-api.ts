import { QUEST } from "@/components/shared/QuestsModal";
import { IProfile } from "@/models/profile";

const apiUrl = process.env.NEXT_PUBLIC_BE_URL;

function waitForLocalStorageKey(key: string = "accesstoken") {
  return new Promise((resolve) => {
    const checkKey = () => {
      if (sessionStorage.getItem(key) !== null) {
        resolve(sessionStorage.getItem(key));
      } else {
        setTimeout(checkKey, 1000); // Check every 100ms
      }
    };
    checkKey();
  });
}

const getAuthHeaders = () => ({
  accesstoken: sessionStorage.getItem("accesstoken"),
});

export const TDeleteLive = async (
  points: string | number
): Promise<IProfile[]> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/live/${points}`, {
    method: "DELETE",
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
    return [];
  });
};

export const TRedeemLives = async (): Promise<object> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/lives/redeem`, {
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

export const TPostReferral = async (telegramId: string): Promise<object> => {
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

export const TPostQuest = async (
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
