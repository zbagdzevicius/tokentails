import { TailsCardPack } from "@/components/tailsCard/TailsCardPack";
import { cdnFile } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { CloseButton } from "./CloseButton";

export const PackModal = ({ close, cat }: { close: () => void; cat: ICat }) => {
  return (
    <div
      className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]"
      style={{
        backgroundImage: `url(${cdnFile("landing/card-bg.webp")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="mt-safe z-[100000] absolute top-0 right-0">
        <CloseButton onClick={() => close?.()} />
      </div>
      <TailsCardPack cat={cat} packType={cat.packType} />
    </div>
  );
};
