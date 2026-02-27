import { IMatch } from "@/models/match";
import { IProfile } from "@/models/profile";
import {
  IAirdropProgression,
  IAirdropTierClaimResponse,
} from "@/models/airdrop";
import { apiUrl, waitForLocalStorageKey } from "./api";

const baseHeaders: HeadersInit = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

const authHeaders = (): HeadersInit => ({
  ...baseHeaders,
  accesstoken: sessionStorage.getItem("accesstoken") || "",
});

const profile = async (): Promise<IProfile> => {
  return fetch(`${apiUrl}/user/profile`, {
    // return fetch(`${apiUrl}/user/profile/669ad4658b4f9b107ecbe1bb`, {
    method: "GET",
    headers: authHeaders(),
  }).then((response) => {
    return response.json();
  });
};

const leaderboard = async (): Promise<IProfile[]> => {
  return fetch(`${apiUrl}/user/leaderboard`, {
    method: "GET",
    headers: baseHeaders,
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
    headers: baseHeaders,
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const redeem = async (): Promise<{ tails: number }> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/catbassadors/lives/redeem`, {
    method: "GET",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return { tails: 0 };
  });
};

const airdropProgression = async (): Promise<IAirdropProgression | null> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/airdrop/progression`, {
    method: "GET",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }
    console.warn(JSON.stringify(response));
    return null;
  });
};

const claimAirdropTier = async (
  tierId: string
): Promise<IAirdropTierClaimResponse> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/airdrop/claim/${tierId}`, {
    method: "POST",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return { success: false, message: "Unable to claim this tier right now." };
  });
};

const claimAirdropChallenge = async (
  challengeId: string
): Promise<IAirdropTierClaimResponse> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/airdrop/challenge/claim/${challengeId}`, {
    method: "POST",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {
      success: false,
      message: "Unable to claim this challenge reward right now.",
    };
  });
};

const claimAirdropMilestone = async (
  milestoneId: string
): Promise<IAirdropTierClaimResponse> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/airdrop/milestone/claim/${milestoneId}`, {
    method: "POST",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {
      success: false,
      message: "Unable to claim this milestone reward right now.",
    };
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
  airdropProgression,
  claimAirdropTier,
  claimAirdropChallenge,
  claimAirdropMilestone,
};
