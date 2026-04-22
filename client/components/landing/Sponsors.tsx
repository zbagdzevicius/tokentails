import { cdnFile } from "@/constants/utils";

const sponsorImage = [
  "images/sponsor/bga.webp",
  "images/sponsor/bybit.webp",
  "images/sponsor/mantle.webp",
  "images/sponsor/sei.webp",
  "images/sponsor/stellar.webp",
  "images/sponsor/bga.webp",
  "images/sponsor/bybit.webp",
  "images/sponsor/mantle.webp",
  "images/sponsor/sei.webp",
  "images/sponsor/stellar.webp",
  "images/sponsor/bga.webp",
  "images/sponsor/bybit.webp",
  "images/sponsor/mantle.webp",
  "images/sponsor/sei.webp",
  "images/sponsor/stellar.webp",
];

export const Sponsors = () => {
  return (
    <div className="slider absolute z-10 bottom-0">
      <div className="slide-track">
        {sponsorImage.map((sponsor, index) => (
          <div key={index} className="slide flex items-center">
            <img
              draggable={false}
              className="h-10 w-auto"
              src={cdnFile(sponsor)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
