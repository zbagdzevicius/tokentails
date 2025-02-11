import { CAT_API } from "@/api/cat-api";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { CatCard } from "../CatCardModal";
import { Slider } from "../shared/Slider";
import { Web3Providers } from "../web3/Web3Providers";

export const HelpCats = () => {
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });
  const { showSignInPopup } = useFirebaseAuth();
  const { profile } = useProfile();

  const items = catsForSale?.tokentails?.map((cat) => (
    <div
      onClick={() => (profile ? showSignInPopup() : {})}
      key={cat._id}
      className="m-auto w-fit"
    >
      <CatCard {...cat} relative />
    </div>
  ));

  return (
    <div className=" h-full flex flex-col items-center justify-center overflow-visible">
      <h2 className="font-secondary uppercase tracking-tight text-h3 md:text-h2 text-balance my-3">
        Cats for adoption
      </h2>
      <Web3Providers>
        <Slider items={items || []} mobileSlides={1} slidesPerView={2} />
      </Web3Providers>
    </div>
  );
};
