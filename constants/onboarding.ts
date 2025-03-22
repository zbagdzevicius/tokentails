export const ONBOARDING_MODAL_IDS = {
  CAT: "cat",
  ABOUT_ME: "about-me",
  MY_CATS: "my-cats",
  CLAIM_REWARDS: "claim-rewards",
  GIFTS: "gifts",
  QUESTS: "quests",
  HOME: "home",
  TO_THE_GAME_ZONE: "to-the-game-zone",
  SHELTER: "shelter",
  CATBASSADORS: "catbassadors",
};

const ONBOARDING_MODAL_SELECTORS: Record<
  keyof typeof ONBOARDING_MODAL_IDS,
  string
> = Object.entries(ONBOARDING_MODAL_IDS).reduce(
  (acc, [key, value]) => ({
    ...acc,
    [key]: `#${value}`,
  }),
  {} as Record<keyof typeof ONBOARDING_MODAL_IDS, string>
);

export const onboardingSteps = [
  {
    target: ONBOARDING_MODAL_SELECTORS.CAT,
    content:
      "Welcome to the Token Tails! We are happy to have you here and we are ready to help you get started.",
  },
  {
    target: ONBOARDING_MODAL_SELECTORS.MY_CATS,
    content:
      "See all your cats, generate new ones and stake them to earn coins!",
  },
  {
    target: ONBOARDING_MODAL_SELECTORS.CLAIM_REWARDS,
    content:
      "Claim daily rewards! Keep stacking them up to increase daily allowance each day!",
  },
  {
    target: ONBOARDING_MODAL_SELECTORS.GIFTS,
    content:
      "Get gifts for performing on-chain actions and invite friends to get commissions of their earnings!",
  },
  {
    target: ONBOARDING_MODAL_SELECTORS.QUESTS,
    content:
      "Complete quests to get immediate rewards and unlock new achievements!",
  },
  {
    target: ONBOARDING_MODAL_SELECTORS.SHELTER,
    content:
      "Adopt your playable cat linked with a real cat in shelter and become eligible for airdrops!",
  },
  {
    target: ONBOARDING_MODAL_SELECTORS.CATBASSADORS,
    content:
      "Earn coins by playing with your virtual cat to boost your airdrop earnings!",
  },
];

export const CAT_CARD_ONBOARDING_MODAL_IDS = {
  MULTIPLIER: "multiplier",
  BENEFITS: "BENEFITS",
  STORY: "STORY",
  ABILITY: "ABILITY",
};

const CAT_CARD_MODAL_SELECTORS: Record<
  keyof typeof CAT_CARD_ONBOARDING_MODAL_IDS,
  string
> = Object.entries(CAT_CARD_ONBOARDING_MODAL_IDS).reduce(
  (acc, [key, value]) => ({
    ...acc,
    [key]: `#${value}`,
  }),
  {} as Record<keyof typeof CAT_CARD_ONBOARDING_MODAL_IDS, string>
);

export const catCardOnboardingSteps = [
  {
    target: CAT_CARD_MODAL_SELECTORS.MULTIPLIER,
    content:
      "Cat multiplier elevates earnings on every step of your play to earn journey!",
  },
  {
    target: CAT_CARD_MODAL_SELECTORS.BENEFITS,
    content:
      "Explore cat benefits, each cat is individual and might even be linked with a real cat in a shelter!",
  },
  {
    target: CAT_CARD_MODAL_SELECTORS.STORY,
    content:
      "Each cat it's own unique story to tell, while linked ones have a special story to tell resembling it's needs!",
  },
  {
    target: CAT_CARD_MODAL_SELECTORS.ABILITY,
    content: "Have fun using your cat ability in-game to stop the bad guys!",
  },
];

export const ABOUT_ME_ONBOARDING_MODAL_IDS = {
  COINS: "coins",
  WALLETS: "WALLETS",
  OPTIONS: "OPTIONS",
  MUSIC: "MUSIC",
  TWITTER: "twitter",
};

const ABOUT_ME_MODAL_SELECTORS: Record<
  keyof typeof ABOUT_ME_ONBOARDING_MODAL_IDS,
  string
> = Object.entries(ABOUT_ME_ONBOARDING_MODAL_IDS).reduce(
  (acc, [key, value]) => ({
    ...acc,
    [key]: `#${value}`,
  }),
  {} as Record<keyof typeof ABOUT_ME_ONBOARDING_MODAL_IDS, string>
);

export const aboutMeOnboardingSteps = [
  {
    target: ABOUT_ME_MODAL_SELECTORS.COINS,
    content:
      "See your earned in-game coins! Stack them to increase your airdrop rewards!",
  },
  {
    target: ABOUT_ME_MODAL_SELECTORS.WALLETS,
    content:
      "Click here to see your custodial wallets addresses linked with your account!",
  },
  {
    target: ABOUT_ME_MODAL_SELECTORS.OPTIONS,
    content:
      "Play everyday to stack your playing streak, own cats to increase your level and invite friends to get commissions of their earnings!",
  },
  {
    target: ABOUT_ME_MODAL_SELECTORS.MUSIC,
    content: "Got tired of the music? Click here to turn it off!",
  },
  {
    target: ABOUT_ME_MODAL_SELECTORS.TWITTER,
    content:
      "Link your X handle if you want to get AI cat companion which is going to interact with you on socials!",
  },
];

export const CATS_ONBOARDING_MODAL_IDS = {
  SELECT: "select",
  CRAFT: "craft",
  GENERATE: "generate",
};

export const CATS_MODAL_SELECTORS: Record<
  keyof typeof CATS_ONBOARDING_MODAL_IDS,
  string
> = Object.entries(CATS_ONBOARDING_MODAL_IDS).reduce(
  (acc, [key, value]) => ({
    ...acc,
    [key]: `#${value}`,
  }),
  {} as Record<keyof typeof CATS_ONBOARDING_MODAL_IDS, string>
);

export const catsOnboardingSteps = [
  {
    target: CATS_MODAL_SELECTORS.SELECT,
    content:
      "Click select to choose your cat and start playing! See which cat you've selected as your playable hero!",
  },
  {
    target: CATS_MODAL_SELECTORS.CRAFT,
    content:
      "Craft coins and redeem crafted coins on weekly basis! The higher cats multiplier, the more coins you can craft!",
  },
  {
    target: CATS_MODAL_SELECTORS.GENERATE,
    content:
      "Do you have a cat in real life? Generate your cat and see it in-game, make it playable and earn more coins!",
  },
];
