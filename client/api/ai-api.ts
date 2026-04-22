const apiUrl = process.env.NEXT_PUBLIC_AI_URL;

export interface AirdropUser {
  username: string;
  totalScore: number;
  totalScoreJuly: number;
  totalScoreAugust: number;
  totalScoreSeptember: number;
}

export const getAirdropScores = async ({
  pageParam = 0,
  sortBy = "totalScore",
}: {
  pageParam?: number;
  username?: string;
  sortBy?:
    | "totalScore"
    | "totalScoreJuly"
    | "totalScoreAugust"
    | "totalScoreSeptember";
}): Promise<AirdropUser[]> => {
  const res = await fetch(`${apiUrl}/users/score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page: pageParam + 1, sortBy }),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch airdrop scores");
  }

  const data = await res.json();
  return data;
};

export async function searchUsers(
  username: string,
  page: number = 0
): Promise<AirdropUser[]> {
  const response = await fetch(
    `${apiUrl}/users/search/${encodeURIComponent(username)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page }),
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error("Failed to search users");
  }

  return response.json();
}
