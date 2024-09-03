import { getCatsForSale } from "@/constants/api";
import Web3ModalProvider from "@/context/web3";
import { Web3Provider } from "@/context/Web3Context";
import { isProd } from "@/models/app";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CatCard } from "../cat/CatCard";
import { CatGame } from "../catGame/CatGame";

function Adopt() {
  const [selectedCat, setSelectedCat] = useState<any>(null);

  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => getCatsForSale({ minPrice: isProd ? 0 : 0 }),
  });

  const handleCloseModal = () => {
    setSelectedCat(null);
  };
  const [isClicked, setIsClicked] = useState(false);
  useEffect(() => {
    window.onclick = () => {
      setIsClicked(true);
    };
  }, []);

  return (
    <>
      {isClicked && (
        <audio className="display: none" autoPlay>
          <source
            src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
            type="audio/mpeg"
          />
        </audio>
      )}
      <CatGame cats={catsForSale || []} onClickCallback={setSelectedCat} />
      <Web3ModalProvider>
        <Web3Provider>
          {selectedCat && (
            <CatCard
              onClose={handleCloseModal}
              {...selectedCat}
              isMintable={true}
            />
          )}
        </Web3Provider>
      </Web3ModalProvider>
    </>
  );
}

export default Adopt;
