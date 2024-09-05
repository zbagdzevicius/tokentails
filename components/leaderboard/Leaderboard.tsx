import { getLeaderboard } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";

export const Leaderboard = () => {
  const { data } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLeaderboard(),
  });
  const { position } = useProfile();
  return (
    <div>
      <h2 className="text-center font-secondary uppercase tracking-tight text-8xl max-lg:text-5xl  max-lg:text-balance ">
        LEADERBOARD
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
        EXCLUSIVE FOR EARLY BIRDS - UNLOCKED ON JULY 1st
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
        Airdrop - Fullfill the needs of your cat to earn 1 point per day
      </h2>
      {position && (
        <div className="font-secondary uppercase text-p1 bg-yellow-300 w-fit m-auto rounded-xl px-8 mt-4">
          Your position {position}
        </div>
      )}
      <table className="rounded-lg overflow-hidden table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500  md:mt-8">
        <thead className="text-p6 md:text-p5 uppercase text-black-300 bg-gray-50 border-b border-purple-300">
          <tr>
            <th className="p-2 md:p-4 text-center">PLACE</th>
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
                className={`text-p5 text-center md:text-p4 p-4 font-medium whitespace-nowrap border-b ${
                  index > 2
                    ? "bg-white border-purple-300"
                    : "bg-yellow-300 border-white"
                }`}
              >
                {index + 1}
              </th>
              <td
                className={`py-4 text-center bg-gray-700 text-p5 border-l ${
                  index > 2
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {result.name}
              </td>
              <td
                className={`p-4 text-center bg-gray-700 text-p5 md:text-p4 border-l ${
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
    </div>
  );
};
