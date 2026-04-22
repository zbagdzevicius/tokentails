import React, { ReactNode } from "react";
// Import Swiper React components
import { Swiper, SwiperSlide } from "swiper/react";
// Import Swiper styles
import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";
import { Pagination } from "swiper/modules";

interface IProps {
  items: ReactNode[];
  customClass?: string;
  mobileSlides?: number;
  slidesPerView?: number;
  isCoverflowDisabled?: boolean
}

export const Slider = ({ items, customClass, mobileSlides, slidesPerView }: IProps) => {
  return (
    <Swiper
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
          slidesPerView: slidesPerView || 3,
          spaceBetween: 15,
        },
        1024: {
          slidesPerView: slidesPerView || 5,
          spaceBetween: 20,
        },
      }}
      pagination={{ clickable: true }}
      slideToClickedSlide={true}
      modules={[Pagination]}
      className={customClass || ""}
    >
      {items.map((Item, index) => (
        <SwiperSlide key={index}>{Item}</SwiperSlide>
      ))}
    </Swiper>
  );
};
