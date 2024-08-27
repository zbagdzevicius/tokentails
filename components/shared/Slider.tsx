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
  mobileSlides?: number;
}

export const Slider = ({ items, customClass, mobileSlides }: IProps) => {
  return (
    <Swiper
      effect={"coverflow"}
      grabCursor={true}
      centeredSlides={true}
      slidesPerView={'auto'}
      initialSlide={2}
      coverflowEffect={{
        rotate: 20,
        depth: 100,
        slideShadows: true,
      }}

      breakpoints={{
        0: {
          slidesPerView: mobileSlides || 1,
          spaceBetween: 10,
        },
        640: {
          slidesPerView: mobileSlides || 1,
          spaceBetween: 10,
        },
        768: {
          slidesPerView: 3,
          spaceBetween: 15,
        },
        1024: {
          slidesPerView: 5,
          spaceBetween: 20,
        },
      }}
      pagination={{ clickable: true }}
      slideToClickedSlide={true}
      modules={[EffectCoverflow, Pagination]}
      className={customClass || ""}
    >
      {items.map((Item, index) => (
        <SwiperSlide key={index}>{Item}</SwiperSlide>
      ))}
    </Swiper>
  );
};
