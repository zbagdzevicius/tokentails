import { USER_API } from "@/api/user-api";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "./shared/Tag";

export const LeaderboardCatnipContent = () => {
  const { data } = useQuery({
    queryKey: ["leaderboard-catnip"],
    queryFn: () => USER_API.leaderboardCatnip(),
  });
  const { catnipPosition } = useProfile();
  return (
    <>
      <span className="-mt-6 -mb-6 relative z-0">
        <svg viewBox="0 0 400 100" className="w-full">
          <defs>
            <path id="curve" d="M0,100 Q200,10 400,100" />
          </defs>
          <text className="fill-current text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] text-p2 font-primary relative z-0">
            <textPath href="#curve" startOffset="50%" text-anchor="middle">
              TOP 200 GETS 100 $TAILS WEEKLY
            </textPath>
          </text>
        </svg>
      </span>
      <div className="flex flex-col animate-appear items-center relative z-10">
        <img
          src={cdnFile("tail/guard.webp")}
          alt="champs"
          className="w-32 -mb-20"
        />
        <Tag>CATNIP CHAMPS</Tag>
        {catnipPosition && (
          <div className="font-secondary uppercase text-p1 bg-yellow-100 w-fit m-auto rounded-t-xl px-8">
            Your position {catnipPosition}
          </div>
        )}
      </div>
      <table className="rounded-b-lg overflow-hidden rounded-2xl table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500">
        <thead className="text-p5 font-secondary md:text-p5 uppercase text-black-300 bg-gray-50 border-b border-purple-300">
          <tr>
            <th className="py-2 px-1 text-center">PLACE</th>
            <th className="py-2 text-center">name</th>
            <th className="p-2 md:p-4 text-center">CATNIPS</th>
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
                className={`text-p4 font-secondary text-center py-1 font-medium whitespace-nowrap border-b ${
                  index > 2
                    ? "bg-white border-purple-300"
                    : "bg-yellow-300 border-white"
                }`}
              >
                {index + 1}
              </th>
              <td
                className={`py-1 text-center bg-gray-700 text-p6 border-l font-bold ${
                  index > 2
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {result.name}
              </td>
              <td
                className={`p-4 text-center bg-gray-700 text-p6 md:text-p6 border-l font-secondary ${
                  index > 2
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {result.catnipCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
