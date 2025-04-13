import { CAT_API } from "@/api/cat-api";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo } from "react";
import { MarketplaceItem } from "./MarketplaceItem";

export const MarketplaceItems = () => {
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });
  const fiveRandomCatsForSale = useMemo(() => {
    return catsForSale?.["rozine-pedute"];
  }, [catsForSale]);

  return (
    <div className="flex flex-wrap justify-center gap-8 md:gap-4">
      {fiveRandomCatsForSale?.map((cat) => (
        <MarketplaceItem key={cat._id} cat={cat} />
      ))}
    </div>
  );
};
