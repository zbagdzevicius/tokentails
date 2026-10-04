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
  PIXEL_RESCUE_LEVEL = "PIXEL_RESCUE_LEVEL",
}

export interface ILocalQuest {
  type: QuestType;
  name: string;
  key: QUEST;
  link?: string;
  icon: string;
  reward: IQuestReward;
  /** A count goal (GOAL quests): which profile number it tracks and the target, for its progress line. */
  goal?: { metric: "tails" | "referrals"; target: number };
}

export const allQuests: ILocalQuest[] = [
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
    key: QUEST.FOLLOW_DISCORD,
    name: "Join Discord",
    link: "https://discord.gg/4FVYmnd7Hg",
    icon: cdnFile("icons/social/discord.webp"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_IG,
    name: "Follow on Instagram",
    link: "https://www.instagram.com/tokentails",
    icon: cdnFile("icons/social/ig.webp"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.SOCIAL,
    key: QUEST.FOLLOW_TIKTOK,
    name: "Follow on Tiktok",
    link: "https://www.tiktok.com/@tokentails",
    icon: cdnFile("icons/social/tiktok.webp"),
    reward: {
      tails: 10,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_1k,
    name: "Reach 1,000 Tails",
    goal: { metric: "tails", target: 1000 },
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 100,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_10,
    name: "Invite 10 friends",
    goal: { metric: "referrals", target: 10 },
    icon: cdnFile("logo/friends.png"),
    reward: {
      tails: 100,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_10k,
    name: "Reach 10,000 Tails",
    goal: { metric: "tails", target: 10000 },
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_50,
    name: "Invite 50 friends",
    goal: { metric: "referrals", target: 50 },
    icon: cdnFile("logo/friends.png"),
    reward: {
      tails: 500,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_50k,
    name: "Reach 50,000 Tails",
    goal: { metric: "tails", target: 50000 },
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 5000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.INVITE_FRIENDS_100,
    name: "Invite 100 friends",
    goal: { metric: "referrals", target: 100 },
    icon: cdnFile("logo/friends.png"),
    reward: {
      tails: 1000,
    },
  },
  {
    type: QuestType.GOAL,
    key: QUEST.REACH_TAILS_100k,
    name: "Reach 100,000 Tails",
    goal: { metric: "tails", target: 100000 },
    icon: cdnFile("logo/logo.webp"),
    reward: {
      tails: 10000,
    },
  },
];
