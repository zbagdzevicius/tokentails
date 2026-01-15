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
      <CloseButton absolute onClick={() => close?.()} />
      <TailsCardPack cat={cat} packType={cat.packType} />
    </div>
  );
};
