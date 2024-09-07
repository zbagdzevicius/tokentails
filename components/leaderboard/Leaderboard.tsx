import { getLeaderboard } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";

export const LeaderboardContent = () => {
  const { data } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLeaderboard(),
  });
  const { position } = useProfile();
  return (
    <>
      <div className="flex flex-col bg-gradient-to-b from-purple-300 to-yellow-300">
        <h2 className="text-center font-secondary uppercase tracking-tight text-8xl max-lg:text-5xl  max-lg:text-balance pt-4">
          LEADERBOARD
        </h2>
        <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
          Airdrop - Climb up the leaderboard to get bigger Airdrops !
        </h2>
        <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
          Coins are multiplied on weekly basis for top 200 players
        </h2>
        {position && (
          <div className="font-secondary uppercase text-p1 bg-yellow-100 w-fit m-auto rounded-t-xl px-8">
            Your position {position}
          </div>
        )}
      </div>
      <table className="rounded-b-lg overflow-hidden table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500">
        <thead className="text-p6 md:text-p5 uppercase text-black-300 bg-gray-50 border-b border-purple-300">
          <tr>
            <th className="py-2 md:py-4 text-center">PLACE</th>
            <th className="py-2 text-center">name</th>
            <th className="p-2 md:p-4 text-center">score</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((result, index) => (
            <tr
              key={index}
              className={`border-b ${
                index > 2 ? "border-purple-300" : "border-yellow-300"
              }`}
            >
              <th
                scope="row"
                className={`text-p5 text-center py-4 font-medium whitespace-nowrap border-b ${
                  index > 2
                    ? "bg-white border-purple-300"
                    : "bg-yellow-300 border-white"
                }`}
              >
                {index + 1}
              </th>
              <td
                className={`py-4 text-center bg-gray-700 text-p5 border-l font-bold ${
                  index > 2
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {result.name}
              </td>
              <td
                className={`p-4 text-center bg-gray-700 text-p5 md:text-p4 border-l font-secondary ${
                  index > 2
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {result.catpoints || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export const Leaderboard = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative absolute inset-0 max-h-screen overflow-y-auto shadow h-fit">
        <LeaderboardContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
