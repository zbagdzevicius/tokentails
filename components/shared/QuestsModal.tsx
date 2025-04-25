import { QUEST_API } from "@/api/quest-api";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { IQuest } from "@/models/quest";
import { LeaderboardContent } from "../Leaderboard";
import { isApp } from "@/models/app";
import { AppCTA } from "./AppCTA";
enum QuestType {
  SOCIAL = "SOCIAL",
  GOAL = "GOAL",
  FRIEND = "FRIEND",
  WIN = "WIN",
}

interface IQuestReward {
  coins: number;
}

interface ILocalQuest {
  type: QuestType;
  name: string;
  key: QUEST;
  link?: string;
  icon: string;
  reward: IQuestReward;
}

export enum QUEST {
  START_VANA_DATA_HERO = "START_VANA_DATA_HERO",
  START_NOT_BITCOIN = "START_NOT_BITCOIN",
  START_DONZ_SQUAT = "START_DONZ_SQUAT",
  START_TAP_WARRIOR = "START_TAP_WARRIOR",
  START_RUN_TAP = "START_RUN_TAP",
  START_ROYAL_PETS = "START_ROYAL_PETS",
  FOLLOW_ROYAL_PETS = "FOLLOW_ROYAL_PETS",
  FOLLOW_DRATON = "FOLLOW_DRATON",
  START_DRATON = "START_DRATON",
  FOLLOW_KITTY = "FOLLOW_KITTY",
  START_KITTY = "START_KITTY",
  START_BITSNAP = "START_BITSNAP",
  FOLLOW_TG_CHANNEL = "FOLLOW_TG_CHANNEL",
  FOLLOW_TG_GROUP = "FOLLOW_TG_GROUP",
  FOLLOW_X = "FOLLOW_X",
  FOLLOW_DISCORD = "FOLLOW_DISCORD",
  FOLLOW_IG = "FOLLOW_IG",
  FOLLOW_TIKTOK = "FOLLOW_TIKTOK",
  FOLLOW_LINKEDIN = "FOLLOW_LINKEDIN",
  REACH_COINS_2K = "REACH_COINS_2K",
  REACH_COINS_20K = "REACH_COINS_20K",
  REACH_COINS_100K = "REACH_COINS_100K",
  REACH_COINS_1M = "REACH_COINS_1M",
  INVITE_FRIENDS_10 = "INVITE_FRIENDS_10",
  INVITE_FRIENDS_35 = "INVITE_FRIENDS_35",
  INVITE_FRIENDS_100 = "INVITE_FRIENDS_100",
}

const allQuests: ILocalQuest[] = [
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TG_CHANNEL,
    name: "Subscribe channel",
    link: "https://t.me/tokentails",
    icon: "/icons/social/telegram.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_X,
    name: "Follow on X",
    link: "https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton",
    icon: "/icons/social/x.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TG_GROUP,
    name: "Join group",
    link: "https://t.me/tokentailsgroup",
    icon: "/icons/social/telegram.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_DISCORD,
    name: "Join Discord",
    link: "https://discord.gg/4FVYmnd7Hg",
    icon: "/icons/social/discord.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_LINKEDIN,
    name: "Follow on LinkedIn",
    link: "https://www.linkedin.com/company/token-tails",
    icon: "/icons/social/linkedin.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_IG,
    name: "Follow on Instagram",
    link: "https://www.instagram.com/tokentails",
    icon: "/icons/social/instagram.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TIKTOK,
    name: "Follow on Tiktok",
    link: "https://www.tiktok.com/@tokentails",
    icon: "/icons/social/tiktok.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_2K,
    name: "Reach 2k coins",
    icon: "/logo/coin.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_10,
    name: "Invite 10 friens",
    icon: "/images/cats-hub/cat-with-hat.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_20K,
    name: "Reach 20k coins",
    icon: "/logo/coin.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_35,
    name: "Invite 35 friens",
    link: "https://www.linkedin.com/company/token-tails",
    icon: "/images/cats-hub/cat-with-hat.webp",
    reward: {
      coins: 3500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_100K,
    name: "Reach 100k coins",
    icon: "/logo/boss-coin.png",
    reward: {
      coins: 5000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_100,
    name: "Invite 100 friens",
    icon: "/images/cats-hub/cat-with-hat.webp",
    reward: {
      coins: 10000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_1M,
    name: "Reach 1m coins",
    icon: "/logo/boss-coin.png",
    reward: {
      coins: 50000,
    },
  },
];

export const QuestsModalContent = () => {
  const { profile, setProfileUpdate, utils } = useProfile();
  const [questsType, setQuestsType] = useState(QuestType.SOCIAL);
  const quests = useMemo(
    () =>
      allQuests.filter((quest) => {
        const isMatchingType = quest.type === questsType;
        return isMatchingType;
      }),
    [questsType]
  );
  const { data: partnerQuests } = useQuery({
    queryKey: ["quests"],
    queryFn: () => QUEST_API.find(),
  });
  const toast = useToast();

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

  const redeemPartner = useDebouncedCallback(async (quest: IQuest) => {
    if (quest.link) {
      if (quest.link?.startsWith("https://t.me")) {
        utils?.openTelegramLink(quest.link!);
      } else {
        utils?.openLink(quest.link!);
      }
    }
    const result = await QUEST_API.complete(quest._id);
    toast({ message: result.message });
    if (result.success) {
      setProfileUpdate({ quests: [...(profile?.quests || []), quest._id] });
    }
  }, 200);

  return (
    <div className="px-2 md:px-4 pb-8 pt-4 md:b-12 flex flex-col justify-between items-center animate-appear">
      <Tag>QUESTS</Tag>
      <div className="py-2 flex items-center justify-between w-full mb-4">
        <PixelButton
          text="SOCIAL"
          active={questsType === QuestType.SOCIAL}
          onClick={() => setQuestsType(QuestType.SOCIAL)}
        ></PixelButton>
        <PixelButton
          text="GOALS"
          active={questsType === QuestType.GOAL}
          onClick={() => setQuestsType(QuestType.GOAL)}
        ></PixelButton>
        <PixelButton
          text="WIN"
          active={questsType === QuestType.WIN}
          onClick={() => setQuestsType(QuestType.WIN)}
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
                        src="icons/check.webp"
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
                  <div className="text-p5 h-6 flex items-center gap-1 font-secondary bg-yellow-300 rounded-full pr-1 pl-4 relative">
                    <img
                      draggable={false}
                      className="w-6 h-6 -left-3 top-0 bottom-0 z-10 absolute"
                      src="/logo/coin.webp"
                    />
                    {quest.reward.coins} COINS
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {questsType === QuestType.GOAL && isApp && (
          <>
            <div className="flex flex-col gap-2 w-full pb-8">
              {quests.map((quest) => (
                <div
                  key={quest.name}
                  className="flex justify-between items-center w-full"
                >
                  <div className="flex relative gap-2 items-center">
                    {profile?.quests?.includes(quest.key) ? (
                      <img
                        draggable={false}
                        className="w-10"
                        src="icons/check.webp"
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
                  <div className="text-p5 h-6 flex items-center gap-1 font-secondary bg-yellow-300 rounded-full pr-1 pl-4 relative">
                    <img
                      draggable={false}
                      className="w-6 h-6 -left-3 top-0 bottom-0 z-10 absolute"
                      src="/logo/coin.webp"
                    />
                    {quest.reward.coins} COINS
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </span>
      {questsType === QuestType.GOAL && !isApp && <AppCTA />}
      {questsType === QuestType.WIN && isApp && <LeaderboardContent />}
      {questsType === QuestType.WIN && !isApp && <AppCTA />}
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
        style={{
          backgroundImage: "url('/backgrounds/bg-5.png')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
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
