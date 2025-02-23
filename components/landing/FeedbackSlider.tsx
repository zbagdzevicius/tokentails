import { CAT_API } from "@/api/cat-api";
import { useQuery } from "@tanstack/react-query";
import { CatMiniCard } from "../shared/CatMiniCard";

export const FeedbackSlider = () => {
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });

  return (
    <>
      <div className="flex items-center justify-center flex-col my-32">
        <h2 className="text-left font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
          Get to Know our Cats
        </h2>

        <div className="w-screen">
          <div className="flex gap-4 justify-center overflow-x-auto">
            {catsForSale?.tokentails?.map((cat) => (
              <CatMiniCard key={cat._id} cat={cat} />
            ))}
          </div>

          {catsForSale?.["rozine-pedute"]?.length && (
            <div className="m-auto mt-4">
              <div className="flex m-auto justify-center gap-4 overflow-x-auto">
                {catsForSale?.["rozine-pedute"]?.map((cat) => (
                  <CatMiniCard key={cat._id} cat={cat} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
