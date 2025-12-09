import { cdnFile } from "@/constants/utils";
import { IImage } from "./image";

export interface IQuest {
  _id: string;
  name: string;
  link: string;
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
  CATNIP = "CATNIP",
  RESCUE = "RESCUE",
}

interface IQuestReward {
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
  REACH_TAILS_1k = "REACH_TAILS_1k",
  REACH_TAILS_10k = "REACH_TAILS_10k",
  REACH_TAILS_50k = "REACH_TAILS_50k",
  REACH_TAILS_100k = "REACH_TAILS_100k",
  INVITE_FRIENDS_10 = "INVITE_FRIENDS_10",
  INVITE_FRIENDS_50 = "INVITE_FRIENDS_50",
  INVITE_FRIENDS_100 = "INVITE_FRIENDS_100",
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
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_X,
    name: "Follow on X",
    link: "https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton",
    icon: cdnFile("icons/social/x.webp"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_X_FOUNDER,
    name: "Follow Commander",
    link: "https://x.com/intent/follow?screen_name=zbagdz&tw_p=followbutton",
    icon: cdnFile("icons/social/x.webp"),
    reward: {
      tails: 50,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TG_GROUP,
    name: "Join group",
    link: "https://t.me/tokentailsgroup",
    icon: cdnFile("icons/social/telegram.png"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_DISCORD,
    name: "Join Discord",
    link: "https://discord.gg/4FVYmnd7Hg",
    icon: cdnFile("icons/social/discord.png"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_LINKEDIN,
    name: "Follow on LinkedIn",
    link: "https://www.linkedin.com/company/token-tails",
    icon: cdnFile("icons/social/linkedin.png"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_IG,
    name: "Follow on Instagram",
    link: "https://www.instagram.com/tokentails",
    icon: cdnFile("icons/social/instagram.png"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TIKTOK,
    name: "Follow on Tiktok",
    link: "https://www.tiktok.com/@tokentails",
    icon: cdnFile("icons/social/tiktok.png"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_1k,
    name: "Reach 1k $TAILS",
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 100,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_10,
    name: "Invite 10 friens",
    icon: cdnFile("logo/friends.png"),
    reward: {
      tails: 100,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_10k,
    name: "Reach 10k $TAILS",
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_50,
    name: "Invite 50 friens",
    icon: cdnFile("logo/friends.png"),
    reward: {
      tails: 500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_50k,
    name: "Reach 50k $TAILS",
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 5000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_100,
    name: "Invite 100 friens",
    icon: cdnFile("logo/friends.png"),
    reward: {
      tails: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_100k,
    name: "Reach 100k $TAILS",
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 10000,
    },
  },
];
