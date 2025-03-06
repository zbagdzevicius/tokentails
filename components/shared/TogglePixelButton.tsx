import { useState } from "react";

interface IProps {
  defaultActive?: boolean;
  onClick?: (isActive: boolean) => void;
}

export const TogglePixelButton = ({
  defaultActive = false,
  onClick,
}: IProps) => {
  const [isActive, setIsActive] = useState(defaultActive);

  const handleClick = () => {
    const newState = !isActive;
    setIsActive(newState);
    if (onClick) {
      onClick(newState);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`relative flex justify-center items-center h-12`}
    >
      <div className="h-6 w-1 bg-black"></div>

      <div
        className={`h-8 w-16 flex flex-col justify-center items-center border-y-4 border-black ${
          isActive ? "bg-green-500" : "bg-red-500"
        }`}
      >
        <div
          className={`text-white mx-2 font-bold text-p4 ${
            !isActive ? "text-right pr-1" : "text-left pl-1"
          } w-full`}
        >
          {isActive ? "ON" : "OFF"}
        </div>

        <div
          className={`absolute top-1/2 transform -translate-y-1/2 flex justify-center items-center h-7 ${
            isActive ? " right-2" : " left-2"
          } transition-transform duration-300`}
        >
          <div className="h-4 w-1 bg-gray-700"></div>
          <div
            className={`h-5 w-3 flex flex-col border-y-4 border-gray-700 ${
              isActive ? "bg-green-500" : "bg-red-500"
            }`}
          >
            <div className="h-0.5 w-4 bg-yellow-300"></div>
          </div>
          <div
            className={`h-5 w-1 flex flex-col ${
              isActive ? "bg-green-500" : "bg-red-500"
            } border-y-4 border-gray-700`}
          >
            <div className="h-0.5 w-1 bg-yellow-300"></div>
          </div>

          <div className="h-4 w-1 bg-gray-700"></div>
        </div>
      </div>
      <div
        className={`h-8 w-1 flex flex-col ${
          isActive ? "bg-green-500" : "bg-red-500"
        } border-y-4 border-black`}
      ></div>

      <div className="h-6 w-1 bg-black"></div>
    </button>
  );
};
