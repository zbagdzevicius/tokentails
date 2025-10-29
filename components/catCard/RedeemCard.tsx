import { CAT_API } from "@/api/cat-api";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";

export const RedeemCard = ({ close }: { close: () => void }) => {
  const [isDisplayed, setIsDisplayed] = useState(false);
  const { profile, setProfileUpdate } = useProfile();
  const [code, setCode] = useState("");
  const { addNotification } = useGame();
  const toast = useToast();
  const redeem = async () => {
    const { message, cat, success } = await CAT_API.redeem(code);
    if (!success) {
      toast({ message });
    }
    setProfileUpdate({
      cats: [...(profile?.cats || []), cat],
      cat,
    });
    addNotification({
      message: "Redeemed Successfully!",
      img: cat.catImg,
    });
    close();
  };

  return (
    <div className="flex flex-col items-center justify-center mb-4">
      {isDisplayed ? (
        <div className="flex flex-col items-center justify-center mb-8 gap-3 animate-appear">
          <Tag>REDEEM YOUR CAT</Tag>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value?.slice(0, 24))}
            className="flex-grow px-2 py-1 outline-none text-p3 bg-white rounded-full"
            placeholder="ENTER YOUR CODE"
          />
          {!!code && <PixelButton text="REDEEM" onClick={() => redeem()} />}
        </div>
      ) : (
        <PixelButton
          onClick={() => setIsDisplayed(true)}
          text="REDEEM YOUR CAT ⚝"
        />
      )}
    </div>
  );
};
