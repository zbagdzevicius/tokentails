import { AirdropUser } from "@/api/ai-api";

export interface AirdropTableProps {
  scores: AirdropUser[];
  loaderRef: (node?: Element | null) => void;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
  onSearch: (username: string) => void;
  isSearching: boolean;
  phase: number;
  setPhase: (phase: number) => void;
}

export interface IAirdropCriterion {
  id: string;
  label: string;
  description: string;
  current: number;
  target: number;
  met: boolean;
}

export interface IAirdropTierRequirement {
  id: string;
  label: string;
  current: number;
  target: number;
  met: boolean;
}

export interface IAirdropTierReward {
  tails: number;
  unlockable: string;
  revealTitle: string;
  revealTeaser: string;
  image: string;
}

export interface IAirdropTierProgress {
  id: string;
  name: string;
  description: string;
  requirements: IAirdropTierRequirement[];
  reward: IAirdropTierReward;
  unlocked: boolean;
  claimed: boolean;
  claimable: boolean;
  unlockProgress: number;
}

export interface IAirdropChallenge {
  id: string;
  label: string;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
  rewardTails: number;
  icon: string;
}

export interface IAirdropMilestone {
  id: string;
  label: string;
  current: number;
  target: number;
  reached: boolean;
  claimed: boolean;
  claimable: boolean;
  rewardTails: number;
  icon: string;
  unlockable: string;
}

export interface IAirdropProgression {
  eligible: boolean;
  eligibilityCriteria: IAirdropCriterion[];
  metrics: {
    collectiblesOwned: number;
    tierCounts: {
      common: number;
      rare: number;
      epic: number;
      legendary: number;
    };
    rareOrAbove: number;
    epicOrAbove: number;
    questsCompleted: number;
    streak: number;
    tails: number;
    packPurchases: number;
    portraitPurchases: number;
    totalPurchases: number;
    additionalLegendaryCards: number;
    legendaryStashBonusPercent: number;
    legendaryStashBonusMultiplier: number;
    collectibleLevel: number;
    scoreBreakdown: {
      catScore: number;
      questScore: number;
      streakScore: number;
      tailsScore: number;
      monetizationScore: number;
    };
  };
  gamification: {
    xp: number;
    level: number;
    nextLevelXp: number;
    levelProgress: number;
    title: string;
    comboMultiplier: number;
    streakBonusTails: number;
    dailyChallenges: IAirdropChallenge[];
    milestones: IAirdropMilestone[];
    nextMilestoneId: string | null;
    potentialBonusTails: number;
  };
  tiers: IAirdropTierProgress[];
  currentTierId: string | null;
  nextTierId: string | null;
  unlockedUnlockables: string[];
  claimedUnlockables: string[];
  totalClaimedTiers: number;
  totalClaimedChallenges: number;
  totalClaimedMilestones: number;
}

export interface IAirdropTierClaimResponse {
  success: boolean;
  message?: string;
  tails?: number;
  tierId?: string;
  challengeId?: string;
  milestoneId?: string;
  progression?: IAirdropProgression;
}
