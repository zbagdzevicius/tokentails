import { cdnFile } from "@/constants/utils";

export const Laptop = () => {
  return (
    <div className="relative m-auto justify-center w-[400px]">
      <img
        className="w-full h-[200px] z-10 relative"
        src={cdnFile("devices/macbook.webp")}
      />

      <video
        className="absolute w-[320px] h-auto top-0 left-0 right-0 ml-[40px] mt-1 object-cover z-0"
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/token-tails-trailer.mp4" />
      </video>
    </div>
  );
};
