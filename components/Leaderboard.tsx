import { USER_API } from "@/api/user-api";
import { useProfile } from "@/context/ProfileContext";
import { GameModal } from "@/models/game";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CloseButton } from "./shared/CloseButton";
import { PixelButton } from "./shared/PixelButton";
import { Tag } from "./shared/Tag";
import { bgStyle } from "@/constants/utils";

const leaderboardTexts: Partial<
  Record<GameModal, { header: string; title: string; subtitle: string }>
> = {
  [GameModal.LEADERBOARD]: {
    header: "ALL TIME",
    title: "STAY IN TOP 200 - GET 100 WEEKLY $TAILS",
    subtitle: "EARN $TAILS TO STAY IN THE TOP",
  },
};

export const LeaderboardContent = () => {
  const [type, setType] = useState(GameModal.LEADERBOARD);
  const { data } = useQuery({
    queryKey: ["leaderboard", type],
    queryFn: () => USER_API.leaderboard(type),
  });
  const { position } = useProfile();
  return (
    <>
      <div className="flex flex-col animate-appear pt-4">
        <Tag>CHAMPS</Tag>
        <div className="py-1 gap-4 pt-2 flex justify-center">
          <PixelButton
            active={type === GameModal.LEADERBOARD}
            text={leaderboardTexts[GameModal.LEADERBOARD]?.header!}
            onClick={() => setType(GameModal.LEADERBOARD)}
          ></PixelButton>
        </div>
        <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
          {leaderboardTexts[type]?.title}
        </h2>
        <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
          {leaderboardTexts[type]?.subtitle}
        </h2>
        {position && (
          <div className="font-secondary uppercase text-p1 bg-yellow-100 w-fit m-auto rounded-t-xl px-8">
            Your position {position}
          </div>
        )}
      </div>
      <table className="rounded-b-lg overflow-hidden rounded-2xl table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500">
        <thead className="text-p5 font-secondary md:text-p5 uppercase text-black-300 bg-gray-50 border-b border-purple-300">
          <tr>
            <th className="py-2 px-1 text-center">PLACE</th>
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
                {(type === GameModal.LEADERBOARD
                  ? result.tails
                  : result.catnipCount) || 0}
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
    <div className="fixed inset-0 mt-safe pb-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div
        className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full absolute inset-0 max-h-screen overflow-y-auto rounded-xl shadow"
        style={bgStyle("4")}
      >
        <CloseButton onClick={() => close()} />
        <LeaderboardContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
