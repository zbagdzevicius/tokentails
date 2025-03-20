export const ONBOARDING_MODAL_IDS = {
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
    target: ONBOARDING_MODAL_SELECTORS.ABOUT_ME,
    content:
      "Find details about your achievements, change settings and see custodial wallet addresses",
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
