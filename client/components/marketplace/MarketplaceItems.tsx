import { CAT_API } from "@/api/cat-api";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PixelButton } from "../shared/PixelButton";
import { MarketplaceItem } from "./MarketplaceItem";

export const MarketplaceItems = ({
  type,
  setType,
}: {
  type: "shelter" | "famous";
  setType: (type: "shelter" | "famous") => void;
}) => {
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });
  const pinkPawCats = useMemo(() => {
    return catsForSale?.["rozine-pedute"];
  }, [catsForSale]);
  const famousCats = useMemo(() => {
    return catsForSale?.["token-tails"];
  }, [catsForSale]);

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
      <div className="flex flex-wrap justify-center gap-8 md:gap-4">
        {type === "shelter" &&
          pinkPawCats?.map((cat) => (
            <MarketplaceItem key={cat._id} cat={cat} />
          ))}
        {type === "famous" &&
          famousCats?.map((cat) => <MarketplaceItem key={cat._id} cat={cat} />)}
      </div>
    </div>
  );
};
