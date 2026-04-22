import { ICat } from '@/models/cats';
import React from 'react';
import { CloseButton } from '@/shared/CloseButton';
import { TailsCard } from './TailsCard';

interface IProps {
  onClose?: () => void;
  cat: ICat;
}

export const TailsCardModal: React.FC<IProps> = ({ onClose, cat }) => {
  return (
    <div className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]">
      <div
        className="absolute inset-0 z-0 opacity-90 bg-gradient-to-tl from-black via-yellow-900 to-yellow-800"
        onClick={() => onClose?.()}
      ></div>
      <CloseButton absolute onClick={() => onClose?.()} />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center h-full lg:gap-8 p-4">
        <div className="flex-shrink-0 md:scale-[0.65] lg:scale-100">
          <TailsCard cat={cat} />
        </div>
      </div>
    </div>
  );
};
