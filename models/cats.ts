import { IImage } from "./image";
import { IProfile } from "./profile";
import { IStatusValue, StatusType } from "./status";

export enum BlessingType {
  CAT = "CAT",
  SUPPLIES = "SUPPLIES",
  MEDICAL = "MEDICAL",
  BILLS = "BILLS",
}

export enum CatType {
  REGULAR = "REGULAR",
  EXCLUSIVE = "EXCLUSIVE",
  BLESSED = "BLESSED",
}

export const Prices = {
  generatedCat: 5,
};

export type IBlessing = {
  type: BlessingType;
  _id: string;
  name: string;
  description: string;
  ability: CatAbilityType;
  image: IImage;
  birthDate: Date;
  images: IImage[];
  price: number;
  creator?: IProfile;
  owner?: IProfile;
  instagram?: string;
};

export type IShelter = {
  _id: string;
  name: string;
  image?: IImage;
  description?: string;
  slug: string;
  address?: string;
  website?: string;
  facebook?: string;
  tiktok?: string;
  instagram?: string;
};

export enum CatAbilitySkill {
  FURSHADOW = "FURSHADOW",
  PURRSTORM = "PURRSTORM",
  WHISKERFLAME = "WHISKERFLAME",
  TAILWIND = "TAILWIND",
  SHADOWPOUNCE = "SHADOWPOUNCE",
  AQUAWHISKER = "AQUAWHISKER",
  BREEZEPAW = "BREEZEPAW", // AIR
  PAWSQUAKE = "PAWSQUAKE", // EARTH
  ICECLAW = "ICECLAW", // ICE
  LEAFPURR = "LEAFPURR", // NATURE
  SANDSWIPE = "SANDSWIPE", // SAND
  TAILSPIN = "TAILSPIN", // TAILS
  STELLARROAR = "STELLARROAR", //LEGENDARY
}

export const catbassadorsGameDuration = 30;

export enum CatAbilityType {
  ELECTRIC = "ELECTRIC",
  STORM = "STORM",
  FIRE = "FIRE",
  WIND = "WIND",
  DARK = "DARK",
  WATER = "WATER",
  AIR = "AIR",
  EARTH = "EARTH",
  ICE = "ICE",
  NATURE = "NATURE",
  SAND = "SAND",
  TAILS = "TAILS",
  LEGENDARY = "LEGENDARY",
}

export interface CatAbility {
  skill: CatAbilitySkill;
  type: CatAbilityType;
  description: string;
}

export const names = [
  "Peanut",
  "Snowball",
  "Pinkie",
  "Cookie",
  "Pickle",
  "Rainbow",
  "Bagel",
];

export const resqueStory = (name: string) => {
  const stories = {
    [names[0]]: `Found wandering near an ancient temple, ${name} now uses its mystical powers to help lost and scared kittens find their way.`,
    [names[1]]: `Once caught in a fierce storm, ${name} now harnesses the power of thunder to protect its companions from danger.`,
    [names[2]]: `Found in a cold, abandoned building, ${name}'s fiery spirit helped her survive and now inspires resilience in others.`,
    [names[3]]: `Once a shy, elusive shadow, ${name} now uses its speed to deliver messages and help between shelters.`,
    [names[4]]: `Emerging from the shadows of the streets, ${name} now uses its stealth to protect the shelter from threats unseen.`,
    [names[5]]: `Once adrift and alone, ${name} now soothes troubled spirits with its serene presence.`,
    [names[6]]: `Once left, ${name} now dreams to find a loving owner.`,
  };

  return stories[name];
};

export const catAbilitiesSkills = [
  CatAbilitySkill.FURSHADOW,
  CatAbilitySkill.PURRSTORM,
  CatAbilitySkill.WHISKERFLAME,
  CatAbilitySkill.TAILWIND,
  CatAbilitySkill.SHADOWPOUNCE,
  CatAbilitySkill.AQUAWHISKER,
  CatAbilitySkill.BREEZEPAW,
  CatAbilitySkill.PAWSQUAKE,
  CatAbilitySkill.ICECLAW,
  CatAbilitySkill.LEAFPURR,
  CatAbilitySkill.SANDSWIPE,
  CatAbilitySkill.TAILSPIN,
  CatAbilitySkill.STELLARROAR,
];

export const getCatAbility = () =>
  catAbilitiesSkills[Math.floor(Math.random() * catAbilitiesSkills.length)];

export type ICatStatus = Partial<Record<StatusType, IStatusValue>>;

export enum CatAIStatus {
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
}

export interface ICat {
  _id?: string;
  name: string;
  ability: CatAbilitySkill;
  type: CatAbilityType;
  owner: string;
  resqueStory: string;
  status: ICatStatus;
  supply: number;
  totalSupply: number;
  staked: Date | null;
  spriteImg: string;
  catImg: string;
  cardImg: string;
  lives: number;
  expiresAt?: string;
  price: number;
  catpoints: number;
  isExclusive: boolean;
  blessings: IBlessing[];
  shelter?: any;
}

export const CatAbilities: Record<CatAbilitySkill, CatAbility> = {
  [CatAbilitySkill.FURSHADOW]: {
    skill: CatAbilitySkill.FURSHADOW,
    type: CatAbilityType.DARK,
    description: "Calms wild or aggressive opponents",
  },
  [CatAbilitySkill.PURRSTORM]: {
    skill: CatAbilitySkill.PURRSTORM,
    type: CatAbilityType.STORM,
    description: "A powerful roar that can stun opponents for a brief moment",
  },
  [CatAbilitySkill.WHISKERFLAME]: {
    skill: CatAbilitySkill.WHISKERFLAME,
    type: CatAbilityType.FIRE,
    description: "A high-speed attack that leaves a trail of fire.",
  },
  [CatAbilitySkill.TAILWIND]: {
    skill: CatAbilitySkill.TAILWIND,
    type: CatAbilityType.WIND,
    description: "A leap so swift, it creates a mini tornado.",
  },
  [CatAbilitySkill.SHADOWPOUNCE]: {
    skill: CatAbilitySkill.SHADOWPOUNCE,
    type: CatAbilityType.DARK,
    description: `A stealth attack that's almost impossible to see coming.`,
  },
  [CatAbilitySkill.AQUAWHISKER]: {
    skill: CatAbilitySkill.AQUAWHISKER,
    type: CatAbilityType.WATER,
    description:
      "A gentle but powerful stream of water that can push opponents away",
  },
  [CatAbilitySkill.BREEZEPAW]: {
    skill: CatAbilitySkill.BREEZEPAW,
    type: CatAbilityType.AIR,
    description: "Creates a gentle breeze that confuses and distracts foes.",
  },
  [CatAbilitySkill.PAWSQUAKE]: {
    skill: CatAbilitySkill.PAWSQUAKE,
    type: CatAbilityType.EARTH,
    description:
      "A heavy stomp that causes the ground to shake and destabilizes enemies.",
  },
  [CatAbilitySkill.ICECLAW]: {
    skill: CatAbilitySkill.ICECLAW,
    type: CatAbilityType.ICE,
    description: "A frigid swipe that slows opponents with a chilling touch.",
  },
  [CatAbilitySkill.LEAFPURR]: {
    skill: CatAbilitySkill.LEAFPURR,
    type: CatAbilityType.NATURE,
    description:
      "Emits a calming aura that restores a bit of health to allies.",
  },
  [CatAbilitySkill.SANDSWIPE]: {
    skill: CatAbilitySkill.SANDSWIPE,
    type: CatAbilityType.SAND,
    description: "Kicks up a cloud of sand, blinding and disorienting foes.",
  },
  [CatAbilitySkill.STELLARROAR]: {
    skill: CatAbilitySkill.STELLARROAR,
    type: CatAbilityType.LEGENDARY,
    description:
      "An otherworldly roar that inspires allies and intimidates all enemies.",
  },
  [CatAbilitySkill.TAILSPIN]: {
    skill: CatAbilitySkill.TAILSPIN,
    type: CatAbilityType.TAILS,
    description:
      "Rapid spin using the tail to dodge obstacles and gain extra speed.",
  },
};

export const cardsColor: Record<CatAbilityType, string> = {
  [CatAbilityType.AIR]: "#c3dacd",
  [CatAbilityType.DARK]: "#e7d6e4",
  [CatAbilityType.EARTH]: "#f28282",
  [CatAbilityType.ELECTRIC]: "#fdf599",
  [CatAbilityType.FIRE]: "#ff7f7f",
  [CatAbilityType.ICE]: "#d4e7f4",
  [CatAbilityType.LEGENDARY]: "#f2ab5c",
  [CatAbilityType.NATURE]: "#a0ca93",
  [CatAbilityType.SAND]: "#f5f0c5",
  [CatAbilityType.STORM]: "#e7eae9",
  [CatAbilityType.TAILS]: "#f3aea4",
  [CatAbilityType.WATER]: "#9fe1fb",
  [CatAbilityType.WIND]: "#f6c7ba",
};
