import { cdnFile } from '@/constants/utils';

interface ICloseButton {
  onClick: () => void;
  absolute?: boolean;
}

export const CloseButton = ({ onClick, absolute }: ICloseButton) => {
  return (
    <img
      draggable={false}
      src={cdnFile('icons/close.webp')}
      className={`hover:brightness-150 hover:translate brightness-70 opacity-70 transition-all duration-300 hover:opacity-100 hover:scale-125 w-20 h-auto ${
        absolute ? 'absolute right-0' : 'sticky pt-2'
      } top-2 -mb-9 lg:-mb-10 ml-auto mr-2 z-[90]`}
      onClick={onClick}
    />
  );
};
