import { CAT_API } from "@/api/cat-api";
import { useQuery } from "@tanstack/react-query";
import { MarketplaceItem } from "../marketplace/MarketplaceItem";

export const AirdropCats = () => {
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });

  return (
    <div className="mt-8 mx-auto">
      {catsForSale?.["rozine-pedute"]?.length && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 justify-items-center">
          {catsForSale?.["rozine-pedute"]?.map((cat) => (
            <MarketplaceItem key={cat._id} cat={cat} />
          ))}
        </div>
      )}
    </div>
  );
};
