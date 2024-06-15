import { IStatusValue, StatusType } from "./status";

export enum CatAbilitySkill {
  FURSHADOW = "FURSHADOW",
  PURRSTORM = "PURRSTORM",
  WHISKERFLAME = "WHISKERFLAME",
  TAILWIND = "TAILWIND",
  SHADOWPOUNCE = "SHADOWPOUNCE",
  AQUAWHISKER = "AQUAWHISKER",
}

export enum CatAbilityType {
  ELECTRIC = "ELECTRIC",
  STORM = "STORM",
  FIRE = "FIRE",
  WIND = "WIND",
  DARK = "DARK",
  WATER = "WATER",
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

export interface ICat {
  _id: string | number;
  name: string;
  img: string;
  ability: CatAbilitySkill;
  isPlayable?: boolean;
  resqueStory: string;
  hp: number;
  status: Partial<Record<StatusType, IStatusValue>>;
}

export interface IProfileCat {
  _id: string | number;
  name: string;
  ability: CatAbilitySkill;
  resqueStory: string;
  status: Partial<Record<StatusType, IStatusValue>>;
  spriteImg: string;
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
};

const status: Partial<Record<StatusType, IStatusValue>> = {
  [StatusType.EAT]: 0,
  [StatusType.PLAY]: 0,
};

export const assignAbilitiesToCats = (): ICat[] => {
  return [
    {
      _id: 1,
      img: "/catgame/cat.gif",
      name: names[0],
      ability: CatAbilitySkill.WHISKERFLAME,
      resqueStory: resqueStory(names[0]),
      isPlayable: true,
      hp: 100,
      status,
    },
    {
      _id: 2,
      img: "/cats/grey/Running-Clothed-Grey.gif",
      name: names[1],
      ability: CatAbilitySkill.PURRSTORM,
      resqueStory: resqueStory(names[1]),
      hp: 100,
      status,
    },
    {
      _id: 3,
      img: "/cats/pinkie/pink-corriendo-ropa.gif",
      name: names[2],
      ability: CatAbilitySkill.FURSHADOW,
      resqueStory: resqueStory(names[2]),
      hp: 100,
      status,
    },
    {
      _id: 4,
      img: "/cats/siamese/siames saltando .gif",
      name: names[3],
      ability: CatAbilitySkill.SHADOWPOUNCE,
      resqueStory: resqueStory(names[3]),
      hp: 100,
      status,
    },
    {
      _id: 5,
      img: "/cats/yellow/Jump-Hat-Yellow.gif",
      name: names[4],
      ability: CatAbilitySkill.AQUAWHISKER,
      resqueStory: resqueStory(names[4]),
      hp: 100,
      status,
    },
    {
      _id: 6,
      img: "/cats/grey/digging.gif",
      name: names[5],
      ability: CatAbilitySkill.TAILWIND,
      resqueStory: resqueStory(names[5]),
      hp: 100,
      status,
    },
    {
      _id: 7,
      img: "/cats/black/dig.gif",
      name: names[6],
      ability: CatAbilitySkill.TAILWIND,
      resqueStory: resqueStory(names[6]),
      hp: 100,
      status,
    },
  ];
};

export const CatConsts = assignAbilitiesToCats();

export const CatsMap = {
  [names[0]?.toLowerCase()]: CatConsts[0],
  [names[1]?.toLowerCase()]: CatConsts[1],
  [names[2]?.toLowerCase()]: CatConsts[2],
  [names[3]?.toLowerCase()]: CatConsts[3],
  [names[4]?.toLowerCase()]: CatConsts[4],
  [names[5]?.toLowerCase()]: CatConsts[5],
  [names[6]?.toLowerCase()]: CatConsts[6],
};
