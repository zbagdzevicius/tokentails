import { useState } from "react";
import { CatCard } from "../cat/CatCard";
import { CatGame } from "../catGame/CatGame";
import { cats } from "./cat.const";
import { useQuery } from "@tanstack/react-query";
import { catsForSaleFetch } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";

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
      <audio className="display: none" autoPlay>
        <source
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
          type="audio/mpeg"
        />
      </audio>
      <CatGame cats={cats || []} onClickCallback={setSelectedCat} />
      {/* <Web3ModalProvider>
        <Web3Provider> */}
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
