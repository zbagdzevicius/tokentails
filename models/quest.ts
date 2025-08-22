import { cdnFile } from "@/constants/utils";
import { IImage } from "./image";

export interface IQuest {
  _id: string;
  name: string;
  link: string;
  catpoints: number;
  tails: number;
  image: IImage;
}

export type IDataRecord = Record<string, number>;

export interface IQuestStatistics {
  users: {
    count: number;
    weekly: IDataRecord[];
  };
  cats: {
    count: number;
    staked: number;
  };
  blessings: {
    count: number;
    weekly: IDataRecord[];
  };
  orders: {
    count: number;
    weekly: IDataRecord[];
  };
}

export enum QuestType {
  SOCIAL = "SOCIAL",
  GOAL = "GOAL",
  FRIEND = "FRIEND",
  WIN = "WIN",
}

interface IQuestReward {
  coins?: number;
  tails?: number;
}

export enum QUEST {
  FOLLOW_TG_CHANNEL = "FOLLOW_TG_CHANNEL",
  FOLLOW_TG_GROUP = "FOLLOW_TG_GROUP",
  FOLLOW_X = "FOLLOW_X",
  FOLLOW_X_FOUNDER = "FOLLOW_X_FOUNDER",
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
  CATNIP_CHAOS_1 = "CATNIP_CHAOS_1",
  CATNIP_CHAOS_2 = "CATNIP_CHAOS_2",
  CATNIP_CHAOS_3 = "CATNIP_CHAOS_3",
  CATNIP_CHAOS_4 = "CATNIP_CHAOS_4",
  CATNIP_CHAOS_5 = "CATNIP_CHAOS_5",
}

export interface ILocalQuest {
  type: QuestType;
  name: string;
  key: QUEST;
  link?: string;
  icon: string;
  reward: IQuestReward;
}

export const allQuests: ILocalQuest[] = [
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TG_CHANNEL,
    name: "Subscribe channel",
    link: "https://t.me/tokentails",
    icon: cdnFile("icons/social/telegram.png"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_X,
    name: "Follow on X",
    link: "https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton",
    icon: cdnFile("icons/social/x.webp"),
    reward: {
      coins: 2500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_X_FOUNDER,
    name: "Follow Commander",
    link: "https://x.com/intent/follow?screen_name=zbagdz&tw_p=followbutton",
    icon: cdnFile("icons/social/x.webp"),
    reward: {
      coins: 2500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TG_GROUP,
    name: "Join group",
    link: "https://t.me/tokentailsgroup",
    icon: cdnFile("icons/social/telegram.png"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_DISCORD,
    name: "Join Discord",
    link: "https://discord.gg/4FVYmnd7Hg",
    icon: cdnFile("icons/social/discord.png"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_LINKEDIN,
    name: "Follow on LinkedIn",
    link: "https://www.linkedin.com/company/token-tails",
    icon: cdnFile("icons/social/linkedin.png"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_IG,
    name: "Follow on Instagram",
    link: "https://www.instagram.com/tokentails",
    icon: cdnFile("icons/social/instagram.png"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TIKTOK,
    name: "Follow on Tiktok",
    link: "https://www.tiktok.com/@tokentails",
    icon: cdnFile("icons/social/tiktok.png"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_2K,
    name: "Reach 2k coins",
    icon: cdnFile("logo/coin.webp"),
    reward: {
      coins: 500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_10,
    name: "Invite 10 friens",
    icon: cdnFile("images/cats-hub/cat-with-hat.webp"),
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_20K,
    name: "Reach 20k coins",
    icon: cdnFile("logo/coin.webp"),
    reward: {
      coins: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_35,
    name: "Invite 35 friens",
    icon: cdnFile("images/cats-hub/cat-with-hat.webp"),
    reward: {
      coins: 3500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_100K,
    name: "Reach 100k coins",
    icon: cdnFile("logo/boss-coin.png"),
    reward: {
      coins: 5000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_100,
    name: "Invite 100 friens",
    icon: cdnFile("images/cats-hub/cat-with-hat.webp"),
    reward: {
      coins: 10000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_COINS_1M,
    name: "Reach 1m coins",
    icon: cdnFile("logo/boss-coin.png"),
    reward: {
      coins: 50000,
    },
  },
];
