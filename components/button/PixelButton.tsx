interface IProps {
  text: string;
  active?: boolean;
  onClick: () => void;
}

export const PixelButton = ({ text, active, onClick }: IProps) => {
  return (
    <button
      onClick={onClick}
      className={`flex justify-center items-center h-12 ${
        !active ? "hover:animate-colormax hover:pb-1" : ""
      }`}
    >
      <div className="h-8 w-1 bg-black"></div>
      <div className="h-10 w-1 flex flex-col bg-red-500 border-y-4 border-black">
        <div className="h-6 bg-red-500"></div>
        <div className="h-1 bg-yellow-300"></div>
        {!active && <div className="h-2 bg-red-700"></div>}
      </div>
      <div className="h-12 flex flex-col border-y-4 border-black bg-red-500">
        <div className="h-9 bg-red-500 px-4 font-secondary text-p4 flex items-center gap-2">
          <p className="text-yellow-300">{text}</p>
        </div>
        <div className="h-1 bg-yellow-300"></div>
        {!active && <div className="h-2 bg-red-700"></div>}
      </div>
      <div className="h-10 w-1 flex flex-col bg-red-500 border-y-4 border-black">
        <div className="h-8 bg-yellow-300"></div>
        {!active && <div className="h-2 bg-red-700"></div>}
      </div>
      <div className="h-8 w-1 bg-black"></div>
    </button>
  );
};
