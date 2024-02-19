import React, { ReactNode } from "react";

// Import Swiper React components
import { Swiper, SwiperSlide } from "swiper/react";

// Import Swiper styles
import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";
import { EffectCoverflow, Pagination } from "swiper/modules";

interface IProps {
  items: ReactNode[];
  customClass?: string;
}

export const Slider = ({ items, customClass }: IProps) => {
  return (
    <Swiper
      effect={"coverflow"}
      grabCursor={true}
      centeredSlides={true}
      slidesPerView={"auto"}
      pagination={true}
      modules={[EffectCoverflow, Pagination]}
      className={customClass || ""}
    >
      {items.map((Item, index) => (
        <SwiperSlide key={index}>{Item}</SwiperSlide>
      ))}
    </Swiper>
  );
};
