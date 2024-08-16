"use client";

import { PixelButton } from "@/components/button/PixelButton";
import { CatCard } from "@/components/cat/CatCard";
import { CatGame } from "@/components/catGame/CatGame";
import { getCatsForSale } from "@/constants/api";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import Web3ModalProvider from "@/context/web3";
import { Web3Provider } from "@/context/Web3Context";
import { ICat } from "@/models/cats";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export default function Connect() {
  const [selectedCat, setSelectedCat] = useState<any>(null);
  const { user, showSignInPopup, showProfilePopup, profile } =
    useFirebaseAuth();

  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () =>
      getCatsForSale({ minPrice: process.env.NEXT_PUBLIC_IS_PROD ? 0 : 0 }),
  });

  useEffect(() => {
    if (!user) {
      showSignInPopup();
    }
  }, [user]);

  useEffect(() => {
    if (profile && user) {
      if (!profile.cat) {
        showProfilePopup();
      }
    }
  }, [profile]);

  const handleCatClick = (cat: Partial<ICat>) => {
    if (!profile) {
      showSignInPopup();
    } else {
      setSelectedCat(cat);
    }
  };

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
    <div className="max-h-screen max-w-screen overflow-hidden relative">
      {isClicked && (
        <audio className="display: none" autoPlay>
          <source
            src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
            type="audio/mpeg"
          />
        </audio>
      )}
      <div className="flex gap-1 md:gap-4 items-center justify-center fixed top-2 left-0 right-0 z-10 h-12">
        {profile?.cat && (
          <a className="flex justify-end" href="/base">
            <PixelButton text="MY CATS" onClick={() => {}}></PixelButton>
          </a>
        )}
        <a href="/">
          <PixelButton text="HOME" onClick={() => {}}></PixelButton>
        </a>
        <PixelButton text="ADOPTION" active onClick={() => {}}></PixelButton>
        <PixelButton
          text="PROFILE"
          onClick={() => showProfilePopup()}
        ></PixelButton>
      </div>
      <CatGame cats={catsForSale || []} onClickCallback={handleCatClick} />
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
    </div>
  );
}
