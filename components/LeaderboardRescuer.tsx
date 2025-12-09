import { USER_API } from "@/api/user-api";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "./shared/Tag";

export const LeaderboardRescuerContent = () => {
  const { data } = useQuery({
    queryKey: ["leaderboard-Rescuer"],
    queryFn: () => USER_API.leaderboardCatnip(),
  });
  const { catnipPosition } = useProfile();
  return (
    <>
    <h2 className="text-gray-700 border-yellow-300/50 border-4 mb-2 mt-4 text-balance text-center font-primary uppercase z-0 tracking-tight text-p6 md:text-p5 bg-yellow-300/50 2xl:mt-4 px-4 md:px-8 rounded-full">
      EVENT HOSTED BY
    </h2>
    <div className="flex justify-between items-center gap-8 mb-8 opacity-80">
        <img draggable={false} className="h-4 lg:h-8" src={cdnFile("images/sponsor/mantle.webp")} />
        <img draggable={false} className="h-4 lg:h-8" src={cdnFile("images/sponsor/bga.webp")} />
        <img draggable={false} className="h-4 lg:h-8" src={cdnFile("images/sponsor/bybit.webp")} />
      </div>
    <div className="font-paws text-h4 text-gray-700">SAVE <span className="">CATS</span></div>
    <div className="font-paws text-p1 text-gray-700 -mt-2">WIN <span className="">REWARDS</span></div>
      <span className="-mt-6 -mb-6 relative z-0">
        <svg viewBox="0 0 400 100" className="w-full">
          <defs>
            <path id="curve" d="M0,100 Q200,10 400,100" />
          </defs>
          <text className="fill-current text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] text-p2 font-primary relative z-0">
            <textPath href="#curve" startOffset="50%" text-anchor="middle">
              TOP 100 SHARE 3000 MNT
            </textPath>
          </text>
        </svg>
      </span>
      <span className="-mt-6 -mb-4 relative z-0">
        <svg viewBox="0 0 400 100" className="w-full">
          <defs>
            <path id="curve" d="M0,100 Q200,10 400,100" />
          </defs>
          <text className="fill-current text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] text-p2 font-primary relative z-0">
            <textPath href="#curve" startOffset="50%" text-anchor="middle">
              + 600k $TAILS tokens
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
        <Tag>Rescue CHAMPS</Tag>
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
            <th className="p-2 md:p-4 text-center">RescuerS</th>
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
