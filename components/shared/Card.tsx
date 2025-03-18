import React from "react";
interface IProps {
  image: string;
  title: string;
  description: string;
}

export const Card = ({ image, title, description }: IProps) => {
  return (
    <div className="flex-1 rounded-[26px] bg-accent-900 md:rounded-[45px] overflow-hidden">
      <img
        draggable={false}
        className="w-full hue-rotate-90 aspect-square md:aspect-video object-cover"
        src={image}
      />
      <div className="title text-p4 md:text-p2 text-center font-bold">
        {title}
      </div>
      <div className="px-4 md:px-8 pb-3 md:pb-8">{description}</div>
    </div>
  );
};
