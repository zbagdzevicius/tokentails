import { apiUrl, currentAccessToken } from "@/api/api";
import { formatTails } from "@/shared-contracts/copy";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { LeaderboardBoard } from "./LeaderboardBoard";

/*
 * The rescuers board (plan G5): players ranked by the Tails they gave to shelter goals this season
 * (`GET /user/leaderboard/rescuers?period=season`). Neutral copy until decision #40 (the old
 * Mantle campaign) is settled: no prize line, no MNT, no token words.
 */

export interface RescuerRow {
  _id: string;
  name: string;
  tailsGiven: number;
  goalsHelped: number;
}

export async function fetchRescuers(signal?: AbortSignal): Promise<RescuerRow[]> {
  if (!apiUrl) return [];
  try {
    const res = await fetch(`${apiUrl}/user/leaderboard/rescuers?period=season&top=100`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows)
      ? rows.map((r) => ({
          _id: String(r?._id ?? ""),
          name: String(r?.name ?? ""),
          tailsGiven: Number(r?.tailsGiven) || 0,
          goalsHelped: Number(r?.goalsHelped) || 0,
        }))
      : [];
  } catch {
    return [];
  }
}

/** The caller's place on the season board, or null (signed out, excluded, or not on it). */
export async function fetchRescuerPosition(signal?: AbortSignal): Promise<number | null> {
  const token = currentAccessToken();
  if (!apiUrl || !token) return null;
  try {
    const res = await fetch(`${apiUrl}/user/leaderboard/rescuers/position?period=season`, {
      signal,
      headers: { Accept: "application/json", accesstoken: token },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const position = typeof body === "number" ? body : body?.position;
    return typeof position === "number" && position > 0 && body?.tailsGiven !== 0 ? position : null;
  } catch {
    return null;
  }
}

export const LeaderboardRescuerContent = () => {
  const { profile } = useProfile();
  const { data, isPending } = useQuery({
    queryKey: ["leaderboard-rescuers", "season"],
    queryFn: ({ signal }) => fetchRescuers(signal),
  });
  const { data: position, isPending: positionLoading } = useQuery({
    queryKey: ["leaderboard-rescuers-position", "season"],
    queryFn: ({ signal }) => fetchRescuerPosition(signal),
  });
  return (
    <LeaderboardBoard
      title="Top rescuers this season"
      icon="heart"
      // claim:fiction Tails are in-game points; giving them moves no money
      helper="Ranked by Tails given to shelter goals. Giving never lowers your Tails rank."
      mascot="tail/open-arms.webp"
      valueLabel="Tails given"
      rows={data?.map((row, index) => ({
        key: row._id || String(index),
        name: row.name,
        value: formatTails(row.tailsGiven, { word: false }),
      }))}
      loading={isPending}
      position={position}
      positionLoading={positionLoading}
      meName={profile?.name}
      emptyTitle="No gives yet"
      emptyBody="No one has given Tails to a goal this season. Be the first from PROGRESS."
      emptyTestId="rescuers-empty"
    />
  );
};
