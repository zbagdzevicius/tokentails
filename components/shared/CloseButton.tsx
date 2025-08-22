import { cdnFile } from "@/constants/utils";

interface ICloseButton {
  onClick: () => void;
  absolute?: boolean;
}

export const CloseButton = ({ onClick, absolute }: ICloseButton) => {
  return (
    <img
      draggable={false}
      src={cdnFile("icons/pixel-close.png")}
      className={`hover:brightness-150 hover:translate hover:scale-125 lg:w-9 w-7 lg:h-9 h-7 ${
        absolute ? "absolute right-2 mt-2" : "sticky pt-2 px-1"
      } top-2 -mb-9 lg:-mb-10 ml-auto mr-2 z-[90]`}
      onClick={onClick}
    />
  );
};
