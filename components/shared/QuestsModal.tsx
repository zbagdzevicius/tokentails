import { QUEST_API } from "@/api/quest-api";
import { REWARDS } from "@/constants/rewards";
import { bgStyle, cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { allQuests, ILocalQuest, QuestType } from "@/models/quest";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { LeaderboardContent } from "../Leaderboard";
import { LeaderboardCatnipContent } from "../LeaderboardCatnip";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { LeaderboardRescuerContent } from "../LeaderboardRescuer";

export const TrailheadsData = [
  {
    name: "beaver",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BEAVER/base/RUNNING.gif",
  },
  {
    name: "fox",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOX/base/IDLE.gif",
  },
  {
    name: "goat",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GOAT/base/JUMPING.gif",
  },
  {
    name: "owl",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OWL/bandage/RUNNING.gif",
  },
  {
    name: "moose",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MOOSE/base/JUMPING.gif",
  },
  {
    name: "raccoon",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RACCON/base/WALKING.gif",
  },
];

export const TrailheadsTypes = TrailheadsData.map(
  (trailhead) => trailhead.name
);

export const QuestsModalContent = () => {
  const { profile, setProfileUpdate, utils } = useProfile();
  const [questsType, setQuestsType] = useState(QuestType.WIN);
  const { data: partnerQuests } = useQuery({
    queryKey: ["quests"],
    queryFn: () => QUEST_API.find(),
  });
  const quests = useMemo(
    () =>
      [...(partnerQuests || []), ...allQuests].filter(quest => !profile?.quests.includes(quest.key)),
    [partnerQuests]
  );
  const toast = useToast();

  const { shareUrl } = useProfile();

  const onInvite = () => {
    utils?.shareURL(shareUrl!);
  };

  const redeem = useDebouncedCallback(async (quest: ILocalQuest) => {
    if (quest.link) {
      if (quest.link?.startsWith("https://t.me")) {
        utils?.openTelegramLink(quest.link!);
      } else {
        utils?.openLink(quest.link!);
      }
    }
    const result = await QUEST_API.complete(quest.key);
    toast({ message: result.message });
    if (result.success) {
      setProfileUpdate({ quests: [...(profile?.quests || []), quest.key] });
    }
  }, 200);

  return (
    <div className="px-2 md:px-4 pb-8 pt-4 md:b-12 flex flex-col justify-between items-center animate-appear">
      <div className="font-paws text-h2 glow text-gray-700">EVENTS</div>
      <div className="pb-2 flex items-center justify-between w-full">
        <PixelButton
          text="Rescuer"
          isSmall
          active={questsType === QuestType.RESCUE}
          onClick={() => setQuestsType(QuestType.RESCUE)}
        ></PixelButton>
        <PixelButton
          text="$TAILS"
          isSmall
          active={questsType === QuestType.WIN}
          onClick={() => setQuestsType(QuestType.WIN)}
        ></PixelButton>
        <PixelButton
          text="CATNIP"
          isSmall
          active={questsType === QuestType.CATNIP}
          onClick={() => setQuestsType(QuestType.CATNIP)}
        ></PixelButton>
        <PixelButton
          text="QUESTS"
          isSmall
          active={questsType === QuestType.SOCIAL}
          onClick={() => setQuestsType(QuestType.SOCIAL)}
        ></PixelButton>
      </div>
      <span className="lg:px-8 w-full">
        {questsType === QuestType.SOCIAL && (
          <>
            <div className="flex flex-col gap-2 w-full">
              {quests.map((quest) => (
                <div
                  key={quest.name}
                  className="flex justify-between items-center w-full"
                >
                  <div className="flex gap-2 items-center">
                    {profile?.quests?.includes(quest.key) ? (
                      <img
                        draggable={false}
                        className="w-10"
                        src={cdnFile("icons/check.webp")}
                      />
                    ) : (
                      <img
                        draggable={false}
                        className="w-10"
                        src={quest.icon}
                      />
                    )}
                    <PixelButton
                      text={quest.name}
                      active={profile?.quests?.includes(quest.key)}
                      onClick={() => redeem(quest)}
                    ></PixelButton>
                  </div>
                  {!!quest.reward.tails && (
                    <div className="text-p5 h-6 flex items-center gap-1 font-secondary bg-yellow-300 rounded-full pr-1 pl-4 relative">
                      <img
                        draggable={false}
                        className="w-8 -left-5 -top-2 bottom-0 z-10 absolute"
                        src={cdnFile("logo/logo.webp")}
                      />
                      {quest.reward.tails} $TAILS
                    </div>
                  )}
                </div>
              ))}
            </div>

                    <>
                      <div
                        className="flex flex-col mb-4 font-primary uppercase px-2 relative rounded-lg py-2 text-main-black mt-8"
                        style={bgStyle("6")}
                      >
                        <Tag isSmall>WHAT I'LL GET FOR INVITING A FRIEND?</Tag>
            
                        <div className="flex flex-row items-center mb-1">
                          <img
                            draggable={false}
                            className="md:h-8 lg:h-10 h-7 mr-1"
                            src={cdnFile("logo/logo.webp")}
                          />
                          <p className="text-p4">{REWARDS.INVITE_FRIEND} $TAILS</p>
                        </div>
                        <div className="flex flex-row items-center">
                          <img
                            draggable={false}
                            className="w-7 h-6  md:w-8 md:h-7 lg:w-10 lg:h-9 mr-1"
                            src={cdnFile("icons/invites/gift-coin.png")}
                          />
                          <p className="text-p4">
                            {REWARDS.INVITE_FRIEND} $TAILS FOR YOUR FRIEND
                          </p>
                        </div>
                        <div className="absolute -top-3 -left-3 z-0 -rotate-45">
                          <img
                            draggable={false}
                            className="h-6 w-6"
                            src={cdnFile("logo/heart.webp")}
                          />
                        </div>
                        <div className="absolute -top-3 -right-3 z-0 rotate-45">
                          <img
                            draggable={false}
                            className="h-6 w-6"
                            src={cdnFile("logo/heart.webp")}
                          />
                        </div>
                        <div className="flex flex-col gap-4 uppercase text-center">
                          You feel that? That’s what purpose on-chain looks like
                        </div>
                      </div>
                      <PixelButton text="GET INVITE LINK" onClick={onInvite} isWidthFull/>
                    </>
          </>
        )}
      </span>
      {questsType === QuestType.WIN && <LeaderboardContent />}
      {questsType === QuestType.CATNIP && <LeaderboardCatnipContent />}
      {questsType === QuestType.RESCUE && <LeaderboardRescuerContent />}
    </div>
  );
};

export const QuestsModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div
        className="m-auto z-50 rem:w-[386px] md:w-[480px] max-w-full absolute inset-0 max-h-screen overflow-y-auto rounded-xl shadow"
        style={bgStyle("4")}
      >
        <CloseButton onClick={() => close()} />
        <QuestsModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
