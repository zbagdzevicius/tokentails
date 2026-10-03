import {
  FAMOUS_SLUG,
  shelterRoleOf,
  useStorefront,
} from "@/hooks/useStorefront";
import { CatAbilityType, CatAbilityTypes, ICat } from "@/models/cats";
import Link from "next/link";
import { PixelButton } from "../shared/PixelButton";
import { ShelterBenefits } from "../shared/ShelterBenefits";
import { TailsCard } from "../tailsCard/TailsCard";

export const MarketplaceItemDetails = ({ cat }: { cat: ICat }) => {
  // Shelter roles from the storefront's `_meta` (today's slugs until `_meta` carries roles). This
  // reads the shared, cached storefront; a cold details view fetches it once (accepted, 45 s stale).
  const { roles } = useStorefront();
  const role = shelterRoleOf(cat.shelter?.slug, roles);
  // Only the famous shelter hides the shelter link; event and home cats are house cats, not famous.
  const isFamous = cat.shelter?.slug === FAMOUS_SLUG;

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-16">
        <TailsCard
          cat={{
            ...cat,
            type: CatAbilityTypes.includes(cat.type)
              ? cat.type
              : CatAbilityType.FAIRY,
          }}
        />
        <div className="lg:absolute -bottom-12 -left-1/2 pixelated rounded-full flex flex-col items-center lg:-ml-8">
          {role === "partner" && <ShelterBenefits />}
        </div>
      </div>
      {!isFamous && (
        // Client-side navigation so it also works in the static app export.
        <Link href="/cats">
          <PixelButton as="span" size="lg" text="SEE ALL SHELTER CATS" />
        </Link>
      )}
    </div>
  );
};
