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

export const resqueStory = (name: string) => {
  const stories = [
    `Found wandering near an ancient temple, ${name} now uses its mystical powers to help lost and scared kittens find their way.`,
    `Once caught in a fierce storm, ${name} now harnesses the power of thunder to protect its companions from danger.`,
    `Found in a cold, abandoned building, ${name}'s fiery spirit helped her survive and now inspires resilience in others.`,
    `Once a shy, elusive shadow, ${name} now uses its speed to deliver messages and help between shelters.`,
    `Emerging from the shadows of the streets, ${name} now uses its stealth to protect the shelter from threats unseen.`,
    `Once adrift and alone, ${name} now soothes troubled spirits with its serene presence.`,
  ];

  return stories[Math.floor(Math.random() * stories.length)];
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
  img: string;
  ability: CatAbility;
  rescueStory: string;
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
