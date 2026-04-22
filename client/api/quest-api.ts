import { QUEST } from "@/models/quest";
import { waitForLocalStorageKey, apiUrl, getAuthHeaders } from "./api";
import {
  ILocalQuest,
  IQuest,
  IQuestStatistics,
  QuestType,
} from "@/models/quest";
import { ICat } from "@/models/cats";
import { ITransactionStatus } from "./order-api";

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

const statistics = async (): Promise<IQuestStatistics> => {
  return fetch(`${apiUrl}/count`, {
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
    return null;
  });
};

const openLootBox = async (): Promise<ITransactionStatus> => {
  return fetch(`${apiUrl}/web3/open`, {
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
    return null;
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
  quest: QUEST | string
): Promise<{ message: string; success?: boolean }> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/complete/${quest}`, {
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

const redeemContest = async (
  contest: string
): Promise<{
  message: string;
  success?: boolean;
  cat?: ICat;
  tails?: number;
}> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/contest/${contest}`, {
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

const find = async (): Promise<ILocalQuest[]> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/quest/search`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }
      return [];
    })
    .then((data: IQuest[]) => {
      return data.map(
        (dataPoint: IQuest) =>
          ({
            type: QuestType.SOCIAL,
            key: dataPoint._id,
            name: dataPoint.name,
            icon: dataPoint.image.url,
            link: dataPoint.link,
            reward: {
              tails: dataPoint.tails,
            },
          } as ILocalQuest)
      );
    });
};

export const QUEST_API = {
  friendInvited,
  setReferralTelegram,
  setReferralWeb,
  complete,
  redeemContest,
  find,
  statistics,
  openLootBox,
};
