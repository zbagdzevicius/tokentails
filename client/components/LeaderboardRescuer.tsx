import { apiUrl, currentAccessToken } from "@/api/api";
import { cdnFile } from "@/constants/utils";
import { formatTails } from "@/shared-contracts/copy";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "./shared/Tag";

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
  const { data } = useQuery({
    queryKey: ["leaderboard-rescuers", "season"],
    queryFn: ({ signal }) => fetchRescuers(signal),
  });
  const { data: position } = useQuery({
    queryKey: ["leaderboard-rescuers-position", "season"],
    queryFn: ({ signal }) => fetchRescuerPosition(signal),
  });
  return (
    <>
      <div className="flex flex-col animate-appear items-center relative z-10 mt-2">
        <img src={cdnFile("tail/guard.webp")} alt="" className="w-32 -mb-6" />
        <Tag>TOP RESCUERS THIS SEASON</Tag>
        {/* claim:fiction Tails are in-game points; giving them moves no money */}
        <p className="mt-2 text-center font-secondary text-p5 text-tt-cream">
          Ranked by Tails given to shelter goals. Giving never lowers your Tails rank.
        </p>
        {position && (
          <div className="font-secondary uppercase text-p3 bg-tt-night-700 text-tt-cream ring-1 ring-tt-gold-500/60 w-fit m-auto rounded-t-xl px-8 mt-2">
            Your position {position}
          </div>
        )}
      </div>
      {data && data.length === 0 ? (
        <p data-testid="rescuers-empty" className="mt-3 rounded-lg bg-tt-night-900/80 px-4 py-3 text-center font-secondary text-p5 text-tt-cream">
          No one has given Tails to a goal this season yet.
        </p>
      ) : (
        <table className="mt-2 w-full table-auto overflow-hidden rounded-2xl bg-tt-night-800 text-left text-sm text-tt-cream">
          <thead className="border-b border-tt-gold-500/50 font-secondary text-p5 uppercase">
            <tr>
              <th className="px-1 py-2 text-center">PLACE</th>
              <th className="py-2 text-center">NAME</th>
              <th className="p-2 text-center md:p-4">TAILS GIVEN</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row, index) => (
              <tr key={row._id || index} className="border-b border-tt-night-500">
                <th scope="row" className="py-1 text-center font-secondary text-p4">
                  {index + 1}
                </th>
                <td className="py-1 text-center text-p6 font-bold">{row.name}</td>
                <td className="p-3 text-center font-secondary text-p6">
                  {formatTails(row.tailsGiven, { word: false })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
};
