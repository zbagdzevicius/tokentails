import { IStatusValue, StatusType } from "./status";

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
];

export const getCatAbility = () =>
  catAbilitiesSkills[Math.floor(Math.random() * catAbilitiesSkills.length)];

export type ICatStatus = Partial<Record<StatusType, IStatusValue>>;

export interface ICat {
  _id?: string;
  name: string;
  ability: CatAbilitySkill;
  type: CatAbilityType;
  resqueStory: string;
  status: ICatStatus;
  spriteImg: string;
  catImg: string;
  cardImg: string;
  lives: number;
  expiresAt?: string;
  price: number;
  catpoints: number;
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
    description: "A gusty strike that can disorient foes.",
  },
  [CatAbilitySkill.PAWSQUAKE]: {
    skill: CatAbilitySkill.PAWSQUAKE,
    type: CatAbilityType.EARTH,
    description: "A ground-shaking stomp that can cause tremors.",
  },
  [CatAbilitySkill.ICECLAW]: {
    skill: CatAbilitySkill.ICECLAW,
    type: CatAbilityType.ICE,
    description: "A chilling swipe that can freeze the ground beneath.",
  },
  [CatAbilitySkill.LEAFPURR]: {
    skill: CatAbilitySkill.LEAFPURR,
    type: CatAbilityType.NATURE,
    description:
      "A soothing purr that encourages nearby plants to grow rapidly.",
  },
  [CatAbilitySkill.SANDSWIPE]: {
    skill: CatAbilitySkill.SANDSWIPE,
    type: CatAbilityType.SAND,
    description:
      "A swift strike that kicks up a cloud of sand to obscure vision.",
  },
  [CatAbilitySkill.STELLARROAR]: {
    skill: CatAbilitySkill.STELLARROAR,
    type: CatAbilityType.LEGENDARY,
    description:
      "A roar that echoes through the cosmos, unleashing starry power.",
  },
};
