import { QUEST_API } from "@/api/quest-api";
import { useProfile } from "@/context/ProfileContext";
import { useWeb3 } from "@/context/Web3Context";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { TrailheadsData, TrailheadsTypes } from "../shared/QuestsModal";
import { Web3Providers } from "../web3/Web3Providers";
import { Tag } from "../shared/Tag";
import { Countdown } from "../shared/Countdown";
import { useToast } from "@/context/ToastContext";

const ConnectWallet = dynamic(
  () => import("../web3/minting/Web3Mint").then((mod) => mod.ConnectWallet),
  {
    ssr: false,
    loading: () => (
      <img
        src="/icons/loader.webp"
        className="w-8 h-8 m-auto animate-spin pixelated"
      />
    ),
  }
);

export const TrailheadsRedeem = () => {
  const { namespaceDetail } = useWeb3();
  const { setProfileUpdate, profile } = useProfile();
  const toast = useToast();
  const [redeemStatus, setRedeemStatus] = useState<
    null | "loading" | "success"
  >();
  useEffect(() => {
    if (redeemStatus === "success") {
      setRedeemStatus(null);
    }
  }, [namespaceDetail?.address]);

  const redeem = async () => {
    if (namespaceDetail?.connected) {
      setRedeemStatus("loading");
      const response = await QUEST_API.redeemTrailheads(
        namespaceDetail.address!
      );
      if (response) {
        setProfileUpdate({
          quests: [...(profile?.quests || []), ...response.owned],
        });
      }
      setRedeemStatus("success");
      toast({ message: response.message });
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {namespaceDetail?.connected && (
        <PixelButton
          isDisabled={redeemStatus === "loading" || redeemStatus === "success"}
          active={redeemStatus === "success"}
          text={
            redeemStatus === "loading"
              ? "REDEEMING..."
              : redeemStatus === "success"
              ? "REDEEMED"
              : "REDEEM"
          }
          onClick={() => redeem()}
        />
      )}
      <ConnectWallet />
    </div>
  );
};

export const Trailheads = () => {
  const { profile } = useProfile();
  const ownedSkins = useMemo(() => {
    return profile?.quests
      ? profile.quests.filter((quest) =>
          TrailheadsTypes.some((type) => type === quest)
        )
      : [];
  }, [profile]);

  return (
    <div className="flex flex-col items-center animate-opacity">
      <img src="/catnip-chaos/trailheads.gif" className="w-52 rounded-2xl" />

      <div className="flex flex-row items-center gap-2 pixelated -mt-12">
        {TrailheadsData.filter(
          (trailhead) => !ownedSkins.includes(trailhead.name)
        ).map((trailhead, index) => (
          <img
            key={index}
            src={trailhead.icon}
            className="w-16 md:w-20 rounded-2xl -mx-4 md:-mx-6"
          />
        ))}
        <img
          src="/blessings/CAMP_TYPE.png"
          className="w-20 md:w-28 -mt-8 md:-mt-14 rounded-2xl pixelated"
        />
        {TrailheadsData.filter((trailhead) =>
          ownedSkins.includes(trailhead.name)
        ).map((trailhead, index) => (
          <img
            key={index}
            src={trailhead.icon}
            className="w-16 md:w-20 rounded-2xl -mx-4 md:-mx-6 scale-x-[-1]"
          />
        ))}
      </div>
      <div className="flex flex-col items-center font-primary">
        <div className="text-p2 md:text-p1">
          Do you own{" "}
          <span className="text-yellow-300 drop-shadow-[0_1.6px_1.8px_rgba(0,0,0)]">
            TrailHeads NFT
          </span>{" "}
          ?
        </div>
        <div className="mb-4 text-p4">REDEEM YOUR PLAYABLE PETS</div>
        <Web3Providers>
          <TrailheadsRedeem />
        </Web3Providers>
      </div>
      <div className="flex flex-col items-center font-primary mt-2 text-p5">
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          REDEEMED
        </span>
        <Tag isSmall>{ownedSkins.length} / 6</Tag>
      </div>
    </div>
  );
};
