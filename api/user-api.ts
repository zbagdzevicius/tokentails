import { GameModal } from "@/models/game";
import { IProfile } from "@/models/profile";
import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from "./api";
import { IMatch } from "@/models/match";

const profile = async (): Promise<IProfile> => {
  return fetch(`${apiUrl}/user/profile`, {
    // return fetch(`${apiUrl}/user/profile/669ad4658b4f9b107ecbe1bb`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    return response.json();
  });
};

const leaderboard = async (gameModal: GameModal): Promise<IProfile[]> => {
  return fetch(
    `${apiUrl}/user/leaderboard${
      gameModal === GameModal.LEADERBOARD_DAILY ? "/daily" : ""
    }`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      } as any,
    }
  )
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return [];
    })
    .then();
};

const leaderboardPosition = async (): Promise<number> => {
  return fetch(`${apiUrl}/user/leaderboard/position`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { position: "999" };
    })
    .then((v) => v.position);
};

const setAdventDay = async (): Promise<void> => {
  return fetch(`${apiUrl}/user/advent`, {
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
    return;
  });
};

const saveCodex = async (): Promise<Partial<IProfile>> => {
  return fetch(`${apiUrl}/user/codex`, {
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
    return {};
  });
};

const saveProfileTwitter = (profile: Partial<IProfile>) => {
  return fetch(`${apiUrl}/user/profile/${profile._id}/twitter`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(profile),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

const saveMatch = async (match: IMatch): Promise<Partial<IProfile>> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/live`, {
    method: "POST",
    body: JSON.stringify(match),
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

const redeem = async (): Promise<object> => {
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

export const USER_API = {
  profile,
  leaderboard,
  leaderboardPosition,
  setAdventDay,
  saveProfileTwitter,
  saveMatch,
  redeem,
  saveCodex,
};
