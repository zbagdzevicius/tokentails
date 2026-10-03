import { SeoHead } from "@/components/seo/SeoHead";
import { PacksModal } from "@/components/shared/PacksModal";

export default function Packs() {
  return (
    <>
      <SeoHead
        title="Token Tails - Cat Packs"
        description="Pixel cat packs for the Token Tails games."
        path="/packs"
      />
      <PacksModal />
    </>
  );
}
