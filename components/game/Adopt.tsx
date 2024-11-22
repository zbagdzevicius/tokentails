import { catsForSaleFetch } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CatCard } from "../CatCard";
import { CatGame } from "../CatGame";
function Adopt() {
  const [selectedCat, setSelectedCat] = useState<any>(null);
  const { profile } = useProfile();
  const { data: cats } = useQuery({
    queryKey: ["sale", profile?.cats],
    queryFn: () => catsForSaleFetch(),
  });

  const handleCloseModal = () => {
    setSelectedCat(null);
  };

  return (
    <>
      <CatGame cats={cats || []} onClickCallback={setSelectedCat} />
      {selectedCat && (
        <CatCard
          onClose={handleCloseModal}
          {...selectedCat}
          isMintable={true}
        />
      )}
      {/* </Web3Provider>
      </Web3ModalProvider> */}
    </>
  );
}

export default Adopt;
