import { useEffect, useState } from "react";
import { CatCard } from "../cat/CatCard";
import { CatGame } from "../catGame/CatGame";
import { cats } from "./cat.const";

function Adopt() {
  const [selectedCat, setSelectedCat] = useState<any>(null);

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
      <CatGame cats={cats} onClickCallback={setSelectedCat} />
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
