"use client";

import { PixelButton } from "@/components/button/PixelButton";
import { CatGame } from "@/components/catGame/CatGame";
import ModalCard from "@/components/modalCard/ModalCard";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { CatConsts, ICat } from "@/models/cats";
import { useEffect, useState } from "react";

export default function Connect() {
  const [selectedCat, setSelectedCat] = useState<any>(null);
  const { user, showSignInPopup, showProfilePopup, profile } =
    useFirebaseAuth();

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
    setSelectedCat(cat);
  };

  const handleCloseModal = () => {
    setSelectedCat(null);
  };

  return (
    <div className="max-h-screen max-w-screen overflow-hidden relative">
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
      <CatGame cats={CatConsts} onClickCallback={handleCatClick} />
      {selectedCat && (
        <ModalCard
          onClose={handleCloseModal}
          {...selectedCat}
          isMintable={true}
        />
      )}
    </div>
  );
}
