import { USER_API } from "@/api/user-api";
import { useProfile } from "@/context/ProfileContext";
import { formatTails } from "@/shared-contracts/copy";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { LeaderboardBoard } from "./LeaderboardBoard";

/** The weekly Tails board (EVENTS, first tab). */
export const LeaderboardContent = () => {
  const { data, isPending } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => USER_API.leaderboard(),
  });
  const { position, profile } = useProfile();
  // ProfileContext reads the place; while that read runs the board shows a skeleton.
  const positionLoading = useIsFetching({ queryKey: ["profile-position"] }) > 0;
  return (
    <LeaderboardBoard
      title="Tails champs"
      icon="coins"
      helper="Players ranked by Tails. The top 200 get 200 Tails each week."
      mascot="tail/cat-celebrate.webp"
      valueLabel="Tails"
      rows={data?.map((row, index) => ({
        key: `${index}-${row.name}`,
        name: row.name,
        value: formatTails(Number(row.tails) || 0, { word: false }),
      }))}
      loading={isPending}
      position={position}
      positionLoading={positionLoading && position == null}
      meName={profile?.name}
      emptyTitle="No one ranked yet"
      emptyBody="Play a run to earn Tails and get on the board."
    />
  );
};
