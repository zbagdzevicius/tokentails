import { TailsCardPack } from "@/components/tailsCard/TailsCardPack";
import { cdnFile } from "@/constants/utils";

export default function TestPage() {
  return (
    <div
      className="flex items-center justify-center min-h-screen w-full"
      style={{
        backgroundImage: `url(${cdnFile("landing/card-bg.webp")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <TailsCardPack packType="starter" />
    </div>
  );
}
