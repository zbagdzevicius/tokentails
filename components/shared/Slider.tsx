import React, { ReactNode } from "react";
// Import Swiper React components
import { Swiper, SwiperSlide } from "swiper/react";
// Import Swiper styles
import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";
import { EffectCoverflow, Pagination, Autoplay } from "swiper/modules";

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
      slidesPerView={'auto'}
      initialSlide={1}
      coverflowEffect={{
        rotate: 20,
        depth: 100,
        slideShadows: true,
      }}

      breakpoints={{
        640: {
          slidesPerView: 1,
          spaceBetween: 10,
        },
        768: {
          slidesPerView: 2,
          spaceBetween: 15,
        },
        1024: {
          slidesPerView: 3,
          spaceBetween: 20,
        },
      }}
      pagination={{ clickable: true }}
      slideToClickedSlide={true}
      autoplay={{
        delay: 8000,
        disableOnInteraction: false

      }}
      modules={[Autoplay, EffectCoverflow, Pagination]}
      className={customClass || ""}
    >
      {items.map((Item, index) => (
        <SwiperSlide key={index}>{Item}</SwiperSlide>
      ))}
    </Swiper>
  );
};
