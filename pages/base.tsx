"use client";
import { CatProvider } from "@/context/CatContext";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });

export default function Game() {
  const [isClicked, setIsClicked] = useState(false);
  useEffect(() => {
    window.onclick = () => {
      setIsClicked(true);
    };
  }, []);
  return (
    <CatProvider>
      {isClicked && (
        <audio className="display: none" autoPlay>
          <source
            src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
            type="audio/mpeg"
          />
        </audio>
      )}
      <Base />
    </CatProvider>
  );
}
