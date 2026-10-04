import { USER_API } from "@/api/user-api";
import { useProfile } from "@/context/ProfileContext";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { LeaderboardBoard } from "./LeaderboardBoard";

/** The catnip board (EVENTS, second tab): who collected the most catnip in the games. */
export const LeaderboardCatnipContent = () => {
  const { data, isPending } = useQuery({
    queryKey: ["leaderboard-catnip"],
    queryFn: () => USER_API.leaderboardCatnip(),
  });
  const { catnipPosition, profile } = useProfile();
  const positionLoading = useIsFetching({ queryKey: ["profile-position-catnip"] }) > 0;
  return (
    <LeaderboardBoard
      title="Catnip champs"
      icon="zap"
      helper="Players ranked by the catnip they collected in the games."
      mascot="tail/guard.webp"
      valueLabel="Catnip"
      rows={data?.map((row, index) => ({
        key: `${index}-${row.name}`,
        name: row.name,
        value: row.catnipCount,
      }))}
      loading={isPending}
      position={catnipPosition}
      positionLoading={positionLoading && catnipPosition == null}
      meName={profile?.name}
      emptyTitle="No one ranked yet"
      emptyBody="Collect catnip in a run to get on the board."
    />
  );
};
