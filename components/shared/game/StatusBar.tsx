import { IStatus, statusTypeLabels, typeImages } from "@/models/status";

const statuses = [0, 1, 2, 3, 4];
const colors = ["#f75252", "#f7c352", "#e1f752", "#bbf752", "#52f76a"];

export const StatusBar = ({ status: currentStatus, type }: IStatus) => {
  return (
    <div className="flex justify-center gap-2 items-center z-10">
      <img className="w-8 md:w-10" src={typeImages[type]} />
      <div className="w-24 h-8 flex items-center justify-center relative">
        <div className="z-10 absolute flex inset-0 justify-center items-center">
          <p className="font-secondary text-p4">{statusTypeLabels[type]}</p>
        </div>
        <div className="h-1 w-1 bg-gray-400"></div>
        <div className="h-3 w-1 bg-gray-600"></div>
        <div className="h-5 w-1 bg-gray-800"></div>
        <div className="h-7 w-1 bg-black"></div>
        <div className="w-full h-full p-0.5 border-y-4 border-black bg-white">
          <div
            className={`flex w-full h-full gap-0.5 ${
              currentStatus < 3 ? "animate-pulse" : ""
            }`}
          >
            {statuses.map((status, index) => (
              <div
                className="flex-1"
                key={index}
                id={index.toString()}
                style={{
                  background:
                    index <= currentStatus
                      ? colors[currentStatus]
                      : "transparent",
                }}
              ></div>
            ))}
          </div>
        </div>
        <div className="h-7 w-1 bg-black"></div>
        <div className="h-5 w-1 bg-gray-800"></div>
        <div className="h-3 w-1 bg-gray-600"></div>
        <div className="h-1 w-1 bg-gray-400"></div>
      </div>
    </div>
  );
};
