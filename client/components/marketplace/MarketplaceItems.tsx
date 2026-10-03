import { useStorefront } from "@/hooks/useStorefront";
import { PixelButton } from "../shared/PixelButton";
import { MarketplaceItem } from "./MarketplaceItem";

export const MarketplaceItems = ({
  type,
  setType,
}: {
  type: "shelter" | "famous";
  setType: (type: "shelter" | "famous") => void;
}) => {
  // Shelter cats come from partner shelters, by the roles in the storefront's `_meta` (today's
  // slug for a shelter `_meta` gives no role), plan G13. Famous cats are the `token-tails` shelter
  // only; the event and home zones are house shelters too but not famous.
  const { partnerCats, famousCats, isLoading, failure, isRetrying, retry } =
    useStorefront();
  const cats = type === "shelter" ? partnerCats : famousCats;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === "shelter"}
          text="SHELTER CATS"
          onClick={() => setType("shelter")}
        ></PixelButton>
        <PixelButton
          active={type === "famous"}
          text="FAMOUS CATS"
          onClick={() => setType("famous")}
        ></PixelButton>
      </div>
      {failure ? (
        <div
          role="alert"
          data-testid="storefront-degraded"
          className="flex flex-col items-center gap-3 py-8 text-center"
        >
          <p className="font-secondary text-p3 text-balance max-w-sm">
            We couldn&apos;t load the cats just now.
          </p>
          <PixelButton
            text={isRetrying ? "RETRYING..." : "RETRY"}
            disabled={isRetrying}
            onClick={retry}
          />
        </div>
      ) : isLoading ? (
        <p
          role="status"
          data-testid="storefront-loading"
          className="font-secondary text-p3 py-8 text-center animate-pulse motion-reduce:animate-none"
        >
          Loading cats...
        </p>
      ) : !cats.length ? (
        <p
          data-testid="storefront-empty"
          className="font-secondary text-p3 py-8 text-center text-balance"
        >
          {type === "shelter"
            ? "All adopted, thank you! New shelter cats arrive soon."
            : "No famous cats right now. Check back soon."}
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-8 md:gap-4">
          {cats.map((cat, index) => (
            <MarketplaceItem key={cat._id ?? `cat-${index}`} cat={cat} />
          ))}
        </div>
      )}
    </div>
  );
};
