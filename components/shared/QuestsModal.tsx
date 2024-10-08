import { TPostQuest } from "@/constants/telegram-api";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { PixelButton } from "../button/PixelButton";

enum QuestType {
  SOCIAL = "SOCIAL",
  MILESTONE = "MILESTONE",
  PARTNERS = "PARTNERS",
}

interface IQuestReward {
  coins: number;
}

interface IQuest {
  type: QuestType;
  name: string;
  key: QUEST;
  link?: string;
  icon: string;
  reward: IQuestReward;
}

export enum QUEST {
  START_VANA_DATA_HERO = "START_VANA_DATA_HERO",
  START_TEA_FARM = "START_TEA_FARM",
  START_EPIC_OF_CASTLES = "START_EPIC_OF_CASTLES",
  START_NOT_BITCOIN = "START_NOT_BITCOIN",
  START_DONZ_SQUAT = "START_DONZ_SQUAT",
  START_TAP_WARRIOR = "START_TAP_WARRIOR",
  START_STAR_AI = "START_STAR_AI",
  START_RUN_TAP = "START_RUN_TAP",
  START_TRUMP = "START_TRUMP",
  START_PRO_TRADER = "START_PRO_TRADER",
  START_MAHJONG = "START_MAHJONG",
  START_MHAYA = "START_MHAYA",
  FOLLOW_MHAYA = "FOLLOW_MHAYA",
  START_MOONDROPS = "START_MOONDROPS",
  FOLLOW_MOONDROPS = "FOLLOW_MOONDROPS",
  FOLLOW_BLOCKGAMES = "FOLLOW_BLOCKGAMES",
  START_GRAND_JOURNEY = "START_GRAND_JOURNEY",
  FOLLOW_GRAND_JOURNEY = "FOLLOW_GRAND_JOURNEY",
  START_ROYAL_PETS = "START_ROYAL_PETS",
  FOLLOW_ROYAL_PETS = "FOLLOW_ROYAL_PETS",
  START_CLOCKIE_CHAOS = "START_CLOCKIE_CHAOS",
  FOLLOW_DRATON = "FOLLOW_DRATON",
  START_DRATON = "START_DRATON",
  START_COIN_BUNNY = "START_COIN_BUNNY",
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

const allQuests: IQuest[] = [
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
    link: "https://x.com/tokentails",
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
    key: QUEST.FOLLOW_BLOCKGAMES,
    name: "Follow Blockgames",
    link: "https://x.com/GetBlockGames",
    icon: "/icons/social/blockgames.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_VANA_DATA_HERO,
    name: "Start Vana Data Hero",
    link: "https://t.me/VanaDataHeroBot/VanaDataHero",
    icon: "/icons/social/vana.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_TEA_FARM,
    name: "Start Tea Farm",
    link: "https://t.me/TeaFarmTownBot/game?startapp=r_5527372962",
    icon: "/icons/social/teafarm.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_EPIC_OF_CASTLES,
    name: "Start Epic of Castles",
    link: "https://t.me/epicofcastles_bot/start?startapp=u119983992",
    icon: "/icons/social/epicofcastles.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_NOT_BITCOIN,
    name: "Start NotBitCoin",
    link: "https://t.me/notbitco_in_bot?start=2jeus9u",
    icon: "/icons/social/notbitcoin.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_DONZ_SQUAT,
    name: "Start Doonz Squad",
    link: "https://t.me/doonz_squad_bot/doonz_squad?startapp=id5527372962",
    icon: "/icons/social/donzsquad.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_TAP_WARRIOR,
    name: "Start Tap Warrior",
    link: "https://t.me/tapwarrior_bot",
    icon: "/icons/social/tapwarrior.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_STAR_AI,
    name: "Start Star AI",
    link: "https://t.me/TheStarAIBot/StarAI?startapp=KwAg1e",
    icon: "/icons/social/starai.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_RUN_TAP,
    name: "Start RUN Tap Tap",
    link: "https://t.me/run_tap_tap_bot/RunTapTap?startapp=M04OUXXJ6787273224",
    icon: "/icons/social/run_tap.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_TRUMP,
    name: "Start Trump Fight",
    link: "https://t.me/trumpfight_app_bot",
    icon: "/icons/social/trump.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_PRO_TRADER,
    name: "Start ProTrader",
    link: "https://t.me/ProTraderBot_Tap2EarnGame_Bot/tap2earn?startapp=r_386752948",
    icon: "/icons/social/protrader.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_MAHJONG,
    name: "Start Mahjong",
    link: "https://game.mjmeta.io",
    icon: "/icons/social/mahjong.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_MHAYA,
    name: "Start Mhaya",
    link: "https://t.me/mhaya_bot?start=28ABuuKPr4d",
    icon: "/icons/social/mhaya.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_MOONDROPS,
    name: "Start Moondrops",
    link: "https://t.me/moondropsggbot/app?startapp=eyJhZmZpbGlhdGVfaWQiOiJNRFpNSDM2NiJ9",
    icon: "/icons/social/moondrops.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_GRAND_JOURNEY,
    name: "Start Grand Journey",
    link: "https://t.me/grandjourneybot/airdrop?startapp=ref_aRql1Z",
    icon: "/icons/social/grandjourney.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_ROYAL_PETS,
    name: "Start Royal Pets",
    link: "https://t.me/royalpetsbot/pet?startapp=7041976025",
    icon: "/icons/social/royalpets.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_CLOCKIE_CHAOS,
    name: "Start Clockie Chaos",
    link: "https://t.me/ClockieChaosBot?start=8d007fff-42e8-4345-b315-983c24160cf9",
    icon: "/icons/social/clockiechaos.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_DRATON,
    name: "Start Draton",
    link: "https://t.me/DratonTrading_bot/Launch?startapp=qnRCrayK40",
    icon: "/icons/social/draton.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.PARTNERS,
    key: QUEST.START_COIN_BUNNY,
    name: "Start Coin Bunny",
    link: "https://t.me/CoinBunnyAppBot",
    icon: "/icons/social/coinbunny.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_IG,
    name: "Follow on IG",
    link: "https://instagram.com/tokentails",
    icon: "/icons/social/instagram.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TIKTOK,
    name: "Follow on TIKTOK",
    link: "https://tiktok.com/@tokentails",
    icon: "/icons/social/tiktok.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_LINKEDIN,
    name: "Follow on LINKEDIN",
    link: "https://www.linkedin.com/company/token-tails",
    icon: "/icons/social/linkedin.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_DISCORD,
    name: "Join server",
    link: "https://discord.gg/4FVYmnd7Hg",
    icon: "/icons/social/discord.png",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_MHAYA,
    name: "Joing Mhaya",
    link: "https://t.me/mhaya_monopoly",
    icon: "/icons/social/mhaya.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_MOONDROPS,
    name: "Join Moondrops",
    link: "https://t.me/MoonDropsAnnouncements",
    icon: "/icons/social/moondrops.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_GRAND_JOURNEY,
    name: "Follow Grand Journey",
    link: "https://t.me/Channel_GrandJourney",
    icon: "/icons/social/grandjourney.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_ROYAL_PETS,
    name: "Follow Royal Pets",
    link: "https://t.me/royalpetofficial",
    icon: "/icons/social/royalpets.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_DRATON,
    name: "Follow Draton",
    link: "https://t.me/draton_channel",
    icon: "/icons/social/draton.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.MILESTONE,
    key: QUEST.REACH_COINS_2K,
    name: "Reach 2k coins",
    icon: "/logo/coin.webp",
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.MILESTONE,
    key: QUEST.INVITE_FRIENDS_10,
    name: "Invite 10 friens",
    icon: "/images/cats-hub/cat-with-hat.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.MILESTONE,
    key: QUEST.REACH_COINS_20K,
    name: "Reach 20k coins",
    icon: "/logo/coin.webp",
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.MILESTONE,
    key: QUEST.INVITE_FRIENDS_35,
    name: "Invite 35 friens",
    link: "https://www.linkedin.com/company/token-tails",
    icon: "/images/cats-hub/cat-with-hat.webp",
    reward: {
      coins: 3500,
    },
  },
  {
    type: QuestType.MILESTONE,
    key: QUEST.REACH_COINS_100K,
    name: "Reach 100k coins",
    icon: "/logo/boss-coin.png",
    reward: {
      coins: 5000,
    },
  },
  {
    type: QuestType.MILESTONE,
    key: QUEST.INVITE_FRIENDS_100,
    name: "Invite 100 friens",
    icon: "/images/cats-hub/cat-with-hat.webp",
    reward: {
      coins: 10000,
    },
  },
  {
    type: QuestType.MILESTONE,
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
        const isNotCompleted = !profile?.quests?.includes(quest.key);
        return isMatchingType && isNotCompleted
      }),
    [questsType]
  );
  const toast = useToast();

  const redeem = useDebouncedCallback(async (quest: IQuest) => {
    if (quest.link) {
      if (quest.link?.startsWith("https://t.me")) {
        utils?.openTelegramLink(quest.link!);
      } else {
        utils?.openLink(quest.link!);
      }
    }
    const result = await TPostQuest(quest.key);
    toast({ message: result.message });
    if (result.success) {
      setProfileUpdate({ quests: [...(profile?.quests || []), quest.key] });
    }
  }, 200);

  return (
    <div className="px-4 py-8 md:px-16 md:py-12 text-gray-800 flex flex-col justify-between items-center">
      <div className="flex items-center justify-between w-full">
        <PixelButton
          text="SOCIAL"
          active={questsType === QuestType.SOCIAL}
          onClick={() => setQuestsType(QuestType.SOCIAL)}
        ></PixelButton>
        <PixelButton
          text="PARTNERS"
          active={questsType === QuestType.PARTNERS}
          onClick={() => setQuestsType(QuestType.PARTNERS)}
        ></PixelButton>
        <PixelButton
          text="MILESTONE"
          active={questsType === QuestType.MILESTONE}
          onClick={() => setQuestsType(QuestType.MILESTONE)}
        ></PixelButton>
      </div>
      {questsType === QuestType.SOCIAL && (
        <>
          <div className="text-p1 font-secondary w-full flex justify-between items-center">
            SOCIAL QUESTS
            <span className="text-p6 flex flex-col">
              <span>verified every 24 hours</span>
              <span>complete 3 to unlock milestone rewards</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 w-full">
            {quests.map((quest) => (
              <div
                key={quest.name}
                className="flex justify-between items-center w-full"
              >
                <div className="flex gap-2 items-center">
                  {profile?.quests?.includes(quest.key) ? (
                    <img className="w-6" src="icons/check.webp" />
                  ) : (
                    <img className="w-6" src={quest.icon} />
                  )}
                  <PixelButton
                    text={quest.name}
                    active={profile?.quests?.includes(quest.key)}
                    onClick={() => redeem(quest)}
                  ></PixelButton>
                </div>
                <div className="text-p5 h-6 flex items-center gap-1 font-secondary bg-yellow-300 rounded-full pr-1 pl-4 relative">
                  <img
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
      {questsType !== QuestType.SOCIAL && (
        <>
          <div className="text-p1 font-secondary w-full flex justify-between items-center">
            {questsType} QUESTS
          </div>
          <div className="flex flex-col gap-2 w-full pb-8">
            {quests.map((quest) => (
              <div
                key={quest.name}
                className="flex justify-between items-center w-full"
              >
                <div className="flex relative gap-2 items-center">
                  {profile?.quests?.includes(quest.key) ? (
                    <img className="w-6" src="icons/check.webp" />
                  ) : (
                    <img className="w-6" src={quest.icon} />
                  )}
                  <PixelButton
                    text={quest.name}
                    active={profile?.quests?.includes(quest.key)}
                    onClick={() => redeem(quest)}
                  ></PixelButton>
                </div>
                <div className="text-p5 h-6 flex items-center gap-1 font-secondary bg-yellow-300 rounded-full pr-1 pl-4 relative">
                  <img
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
    </div>
  );
};

export const QuestsModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-yellow-300 to-purple-300 absolute inset-0 max-h-screen overflow-y-auto rounded-lg shadow h-fit">
        <QuestsModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
