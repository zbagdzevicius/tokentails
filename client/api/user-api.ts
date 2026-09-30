import { IMatch } from "@/models/match";
import { IProfile } from "@/models/profile";
import {
  IAirdropProgression,
  IAirdropTierClaimResponse,
} from "@/models/airdrop";
import { getPlatform } from "@/analytics/platform";
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

const leaderboardPawMatchLevel = async (
  level: string,
  top: number = 120,
): Promise<
  Array<{
    _id: string;
    name: string;
    levelScore: number;
    match3ScoreCount: number;
  }>
> => {
  return fetch(`${apiUrl}/user/leaderboard/paw-match/${level}?top=${top}`, {
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

const leaderboardPawMatchLevelPosition = async (
  level: string,
): Promise<{
  position: number | null;
  levelScore: number;
  match3ScoreCount: number;
}> => {
  return fetch(`${apiUrl}/user/leaderboard/paw-match/${level}/position`, {
    method: "GET",
    headers: authHeaders(),
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { position: null, levelScore: 0, match3ScoreCount: 0 };
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

/** Longest wait, in seconds, before retrying a throttled save once. */
const MAX_SAVE_RETRY_WAIT = 60;

/** Thrown by saveMatch when the save was rate limited even after one retry. */
export class MatchSaveThrottledError extends Error {
  constructor() {
    super("Match save was rate limited");
    this.name = "MatchSaveThrottledError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, MatchSaveThrottledError.prototype);
  }
}

const saveMatch = async (
  match: IMatch
): Promise<Partial<IProfile> | null> => {
  await waitForLocalStorageKey();
  const body = JSON.stringify({
    ...match,
    platform: match.platform ?? getPlatform(),
  });
  const post = () =>
    fetch(`${apiUrl}/user/catbassadors/live`, {
      method: "POST",
      body,
      headers: authHeaders(),
    });

  let response = await post();
  // 429: players sharing an address, or fast retries. Wait out the window once
  // rather than drop the run.
  if (response.status === 429) {
    const wait = Number(response.headers.get("Retry-After"));
    if (!(wait > 0 && wait <= MAX_SAVE_RETRY_WAIT)) {
      throw new MatchSaveThrottledError();
    }
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    response = await post();
    if (response.status === 429) throw new MatchSaveThrottledError();
  }
  if (response.ok) {
    return response.json();
  }

  console.warn(JSON.stringify(response));
  return null;
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
  leaderboardPawMatchLevel,
  leaderboardPawMatchLevelPosition,
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
