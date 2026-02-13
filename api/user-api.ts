import { IMatch } from "@/models/match";
import { IProfile } from "@/models/profile";
import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from "./api";

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

const leaderboard = async (): Promise<IProfile[]> => {
  return fetch(`${apiUrl}/user/leaderboard`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return [];
    })
    .then();
};

const leaderboardCatnip = async (): Promise<IProfile[]> => {
  return fetch(`${apiUrl}/user/leaderboard/catnip`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  })
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

const leaderboardCatnipPosition = async (): Promise<number> => {
  return fetch(`${apiUrl}/user/leaderboard/catnip/position`, {
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
    return null;
  });
};

const redeem = async (): Promise<{tails: number}> => {
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
    return {tails: 0};
  });
};

export const USER_API = {
  profile,
  leaderboard,
  leaderboardCatnip,
  leaderboardPosition,
  leaderboardCatnipPosition,
  saveProfileTwitter,
  saveMatch,
  redeem,
  saveCodex,
};
