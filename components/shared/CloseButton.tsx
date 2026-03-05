import { cdnFile } from "@/constants/utils";

interface ICloseButton {
  onClick: () => void;
  absolute?: boolean;
}

export const CloseButton = ({ onClick, absolute }: ICloseButton) => {
  const shared =
    "hover:brightness-150 brightness-70 opacity-70 transition-all duration-300 hover:opacity-100 hover:scale-125 lg:w-16 w-12 h-auto";

  return (
    <img
      draggable={false}
      src={cdnFile("icons/close.webp")}
      className={`${shared} ${
        absolute
          ? "absolute right-2 top-2 z-[200000]"
          : "sticky top-2 -mb-9 lg:-mb-10 ml-auto mr-2 z-[90] pt-2"
      }`}
      onClick={onClick}
    />
  );
};
