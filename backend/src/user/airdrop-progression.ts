import { Tier } from 'src/cat/cat.schema';
import { ISeasonTimes, seasonTimes } from './codex-reset';

/*
 * PROGRESS (plan G5 "Progression", decisions #34 and #36). Tails are rescue points: every threshold,
 * tier and score reads lifetime EARNED Tails (`tailsEarned`), so giving to a shelter goal never
 * costs progress. Purchases unlock nothing: the tier steps that needed a pack or portrait purchase
 * now need Tails given and goals helped, and `monetizationScore` is gone (its slot in the collectible
 * level is the giving-based `rescueScore`). The route keeps its old `/user/airdrop/...` paths for
 * shipped clients; the copy never says airdrop, token or allocation (F11 backend rule set).
 */

export interface IAirdropScoreBreakdown {
    catScore: number;
    questScore: number;
    streakScore: number;
    tailsScore: number;
    /** Giving to shelter goals: 6 per goal helped plus 2 per 1,000 Tails given, at most 60. */
    rescueScore: number;
}

export interface IAirdropMetrics {
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
    /** Lifetime earned Tails (same as `tailsEarned`; kept under this name for shipped clients). */
    tails: number;
    tailsEarned: number;
    tailsGiven: number;
    goalsHelped: number;
    monthTailsGiven: number;
    monthGoalsHelped: number;
    /** Informational only: purchases unlock nothing (decision #36). */
    packPurchases: number;
    portraitPurchases: number;
    totalPurchases: number;
    additionalLegendaryCards: number;
    legendaryStashBonusPercent: number;
    legendaryStashBonusMultiplier: number;
    collectibleLevel: number;
    scoreBreakdown: IAirdropScoreBreakdown;
}

export interface IAirdropCriterion {
    id: string;
    label: string;
    description: string;
    current: number;
    target: number;
    met: boolean;
}

export interface IAirdropTierRequirementProgress {
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
    requirements: IAirdropTierRequirementProgress[];
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

export interface IAirdropGamification {
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
}

export interface IAirdropProgressionResponse {
    eligible: boolean;
    eligibilityCriteria: IAirdropCriterion[];
    metrics: IAirdropMetrics;
    gamification: IAirdropGamification;
    tiers: IAirdropTierProgress[];
    currentTierId: string | null;
    nextTierId: string | null;
    unlockedUnlockables: string[];
    claimedUnlockables: string[];
    totalClaimedTiers: number;
    totalClaimedChallenges: number;
    totalClaimedMilestones: number;
    /** The current season (P6): freeze 22:00 UTC on the 8th, reset 23:00, next season at 00:00 on the 9th. */
    season: ISeasonTimes;
}

interface IAirdropTierRequirementConfig {
    id: string;
    label: string;
    target: number;
    getCurrent: (metrics: IAirdropMetrics) => number;
}

interface IAirdropTierConfig {
    id: string;
    name: string;
    description: string;
    reward: IAirdropTierReward;
    requirements: IAirdropTierRequirementConfig[];
}

interface IAirdropChallengeConfig {
    id: string;
    label: string;
    description: string;
    rewardTails: number;
    icon: string;
    target: number;
    getCurrent: (metrics: IAirdropMetrics) => number;
}

interface IAirdropMilestoneConfig {
    id: string;
    label: string;
    target: number;
    rewardTails: number;
    icon: string;
    unlockable: string;
}

const tierScoreWeight: Record<Tier, number> = {
    [Tier.COMMON]: 4,
    [Tier.RARE]: 10,
    [Tier.EPIC]: 24,
    [Tier.LEGENDARY]: 55,
};
const LEGENDARY_STASH_BONUS_PER_EXTRA = 0.1;

const applyLegendaryStashBonus = (baseTails: number, multiplier: number): number => Math.round(baseTails * multiplier);

const tierConfigs: IAirdropTierConfig[] = [
    {
        id: 'EXPLORER',
        name: 'Explorer Tier',
        description: 'Build your first collection and keep playing.',
        reward: {
            tails: 2500,
            unlockable: 'Explorer badge',
            revealTitle: 'Explorer Cache',
            revealTeaser: 'An Explorer badge for your profile.',
            image: 'codex/codex-1.webp',
        },
        requirements: [
            {
                id: 'COLLECTIBLE_LEVEL',
                label: 'Collectible level',
                target: 60,
                getCurrent: metrics => metrics.collectibleLevel,
            },
            {
                id: 'COLLECTIBLES_OWNED',
                label: 'Collectibles owned',
                target: 3,
                getCurrent: metrics => metrics.collectiblesOwned,
            },
            {
                id: 'QUESTS_COMPLETED',
                label: 'Quests completed',
                target: 5,
                getCurrent: metrics => metrics.questsCompleted,
            },
        ],
    },
    {
        id: 'RESCUER',
        name: 'Rescuer Tier',
        // claim:fiction progress label: a give spends Tails (points), no money moves
        description: 'Grow your collection and give your first Tails to a shelter goal.',
        reward: {
            tails: 7500,
            unlockable: 'Rescuer frame',
            revealTitle: 'Rescuer Chest',
            revealTeaser: 'A Rescuer frame for your profile.',
            image: 'codex/codex-2.webp',
        },
        requirements: [
            {
                id: 'COLLECTIBLE_LEVEL',
                label: 'Collectible level',
                target: 130,
                getCurrent: metrics => metrics.collectibleLevel,
            },
            {
                id: 'COLLECTIBLES_OWNED',
                label: 'Collectibles owned',
                target: 6,
                getCurrent: metrics => metrics.collectiblesOwned,
            },
            {
                id: 'RARE_OR_ABOVE',
                label: 'Rare+ collectibles',
                target: 2,
                getCurrent: metrics => metrics.rareOrAbove,
            },
            {
                id: 'TAILS_GIVEN',
                // claim:fiction progress label: a give spends Tails (points), no money moves
                label: 'Tails given to shelter goals',
                target: 500,
                getCurrent: metrics => metrics.tailsGiven,
            },
        ],
    },
    {
        id: 'CURATOR',
        name: 'Curator Tier',
        // claim:fiction progress label: a give spends Tails (points), no money moves
        description: 'Collect rarer cats and help shelter goals fill up.',
        reward: {
            tails: 20000,
            unlockable: 'Curator aura',
            revealTitle: 'Curator Relic',
            revealTeaser: 'An animated Curator aura.',
            image: 'codex/codex-7.webp',
        },
        requirements: [
            {
                id: 'COLLECTIBLE_LEVEL',
                label: 'Collectible level',
                target: 220,
                getCurrent: metrics => metrics.collectibleLevel,
            },
            {
                id: 'COLLECTIBLES_OWNED',
                label: 'Collectibles owned',
                target: 10,
                getCurrent: metrics => metrics.collectiblesOwned,
            },
            {
                id: 'EPIC_OR_ABOVE',
                label: 'Epic+ collectibles',
                target: 1,
                getCurrent: metrics => metrics.epicOrAbove,
            },
            {
                id: 'TAILS_GIVEN',
                // claim:fiction progress label: a give spends Tails (points), no money moves
                label: 'Tails given to shelter goals',
                target: 2500,
                getCurrent: metrics => metrics.tailsGiven,
            },
            {
                id: 'GOALS_HELPED',
                // claim:fiction progress label: a give spends Tails (points), no money moves
                label: 'Shelter goals helped',
                target: 2,
                getCurrent: metrics => metrics.goalsHelped,
            },
        ],
    },
    {
        id: 'LEGEND',
        name: 'Legend Tier',
        // claim:fiction progress label: a give spends Tails (points), no money moves
        description: 'A legendary collection and a long record of shelter goals helped.',
        reward: {
            tails: 50000,
            unlockable: 'Nine-lives crown',
            revealTitle: 'Legend Hoard',
            revealTeaser: 'The Nine-lives crown for your profile.',
            image: 'codex/codex-9.webp',
        },
        requirements: [
            {
                id: 'COLLECTIBLE_LEVEL',
                label: 'Collectible level',
                target: 340,
                getCurrent: metrics => metrics.collectibleLevel,
            },
            {
                id: 'COLLECTIBLES_OWNED',
                label: 'Collectibles owned',
                target: 15,
                getCurrent: metrics => metrics.collectiblesOwned,
            },
            {
                id: 'LEGENDARY_COUNT',
                label: 'Legendary collectibles',
                target: 1,
                getCurrent: metrics => metrics.tierCounts.legendary,
            },
            {
                id: 'TAILS_GIVEN',
                // claim:fiction progress label: a give spends Tails (points), no money moves
                label: 'Tails given to shelter goals',
                target: 10000,
                getCurrent: metrics => metrics.tailsGiven,
            },
            {
                id: 'GOALS_HELPED',
                // claim:fiction progress label: a give spends Tails (points), no money moves
                label: 'Shelter goals helped',
                target: 5,
                getCurrent: metrics => metrics.goalsHelped,
            },
        ],
    },
];

const challengeConfigs: IAirdropChallengeConfig[] = [
    {
        id: 'QUEST_SPRINT',
        label: 'Quest Sprint',
        description: 'Complete 12 quests this cycle.',
        rewardTails: 120,
        icon: 'icons/rocket.png',
        target: 12,
        getCurrent: metrics => metrics.questsCompleted,
    },
    {
        id: 'COLLECTOR_PUSH',
        label: 'Collector Push',
        description: 'Hold 8 collectibles to fill your chest.',
        rewardTails: 160,
        icon: 'logo/chest.webp',
        target: 8,
        getCurrent: metrics => metrics.collectiblesOwned,
    },
    {
        id: 'RARE_HUNT',
        label: 'Rare Hunt',
        description: 'Secure 3 rare-or-above collectibles.',
        rewardTails: 220,
        icon: 'cards/icons/power.webp',
        target: 3,
        getCurrent: metrics => metrics.rareOrAbove,
    },
    // BIG_HEART and GOAL_GETTER replace the wallet-balance and purchase challenges (plan G5). They
    // read this season's gives, which reset with the claims.
    {
        id: 'BIG_HEART',
        label: 'Big Heart',
        // claim:fiction progress label: a give spends Tails (points), no money moves
        description: 'Give 1,000 Tails to shelter goals this season.',
        rewardTails: 100,
        icon: 'logo/coin.webp',
        target: 1000,
        getCurrent: metrics => metrics.monthTailsGiven,
    },
    {
        id: 'GOAL_GETTER',
        label: 'Goal Getter',
        // claim:fiction progress label: a give spends Tails (points), no money moves
        description: 'Help 2 shelter goals this season.',
        rewardTails: 180,
        icon: 'icons/invites/gift-coin.png',
        target: 2,
        getCurrent: metrics => metrics.monthGoalsHelped,
    },
];

const milestoneConfigs: IAirdropMilestoneConfig[] = [
    {
        id: 'CACHE_BRONZE_1',
        label: 'Bronze Cache I',
        target: 90,
        rewardTails: 80,
        icon: 'logo/chest.webp',
        unlockable: 'Bronze cache sigil I',
    },
    {
        id: 'CACHE_BRONZE_2',
        label: 'Bronze Cache II',
        target: 120,
        rewardTails: 120,
        icon: 'logo/coin.webp',
        unlockable: 'Bronze cache sigil II',
    },
    {
        id: 'CACHE_BRONZE_3',
        label: 'Bronze Cache III',
        target: 150,
        rewardTails: 160,
        icon: 'icons/invites/gift-coin.png',
        unlockable: 'Bronze cache sigil III',
    },
    {
        id: 'CACHE_BRONZE_4',
        label: 'Bronze Cache IV',
        target: 180,
        rewardTails: 210,
        icon: 'cards/icons/power.webp',
        unlockable: 'Bronze cache sigil IV',
    },
    {
        id: 'CACHE_BRONZE_5',
        label: 'Bronze Cache V',
        target: 210,
        rewardTails: 260,
        icon: 'icons/rocket.png',
        unlockable: 'Bronze cache sigil V',
    },
    {
        id: 'CACHE_SILVER_1',
        label: 'Silver Vault I',
        target: 240,
        rewardTails: 320,
        icon: 'tail/guard.webp',
        unlockable: 'Silver vault crest I',
    },
    {
        id: 'CACHE_SILVER_2',
        label: 'Silver Vault II',
        target: 270,
        rewardTails: 390,
        icon: 'codex/codex-1.webp',
        unlockable: 'Silver vault crest II',
    },
    {
        id: 'CACHE_SILVER_3',
        label: 'Silver Vault III',
        target: 300,
        rewardTails: 470,
        icon: 'codex/codex-2.webp',
        unlockable: 'Silver vault crest III',
    },
    {
        id: 'CACHE_SILVER_4',
        label: 'Silver Vault IV',
        target: 330,
        rewardTails: 560,
        icon: 'codex/codex-7.webp',
        unlockable: 'Silver vault crest IV',
    },
    {
        id: 'CACHE_SILVER_5',
        label: 'Silver Vault V',
        target: 360,
        rewardTails: 660,
        icon: 'codex/codex-9.webp',
        unlockable: 'Silver vault crest V',
    },
    {
        id: 'CACHE_GOLD_1',
        label: 'Gold Relic I',
        target: 400,
        rewardTails: 780,
        icon: 'logo/chest.webp',
        unlockable: 'Gold relic mark I',
    },
    {
        id: 'CACHE_GOLD_2',
        label: 'Gold Relic II',
        target: 440,
        rewardTails: 910,
        icon: 'logo/coin.webp',
        unlockable: 'Gold relic mark II',
    },
    {
        id: 'CACHE_GOLD_3',
        label: 'Gold Relic III',
        target: 480,
        rewardTails: 1060,
        icon: 'icons/invites/gift-coin.png',
        unlockable: 'Gold relic mark III',
    },
    {
        id: 'CACHE_GOLD_4',
        label: 'Gold Relic IV',
        target: 520,
        rewardTails: 1230,
        icon: 'cards/icons/power.webp',
        unlockable: 'Gold relic mark IV',
    },
    {
        id: 'CACHE_GOLD_5',
        label: 'Gold Relic V',
        target: 560,
        rewardTails: 1410,
        icon: 'icons/rocket.png',
        unlockable: 'Gold relic mark V',
    },
    {
        id: 'CACHE_MYTHIC_1',
        label: 'Mythic Treasury I',
        target: 610,
        rewardTails: 1620,
        icon: 'tail/guard.webp',
        unlockable: 'Mythic treasury rune I',
    },
    {
        id: 'CACHE_MYTHIC_2',
        label: 'Mythic Treasury II',
        target: 660,
        rewardTails: 1850,
        icon: 'codex/codex-1.webp',
        unlockable: 'Mythic treasury rune II',
    },
    {
        id: 'CACHE_MYTHIC_3',
        label: 'Mythic Treasury III',
        target: 720,
        rewardTails: 2110,
        icon: 'codex/codex-2.webp',
        unlockable: 'Mythic treasury rune III',
    },
    {
        id: 'CACHE_MYTHIC_4',
        label: 'Mythic Treasury IV',
        target: 790,
        rewardTails: 2400,
        icon: 'codex/codex-7.webp',
        unlockable: 'Mythic treasury rune IV',
    },
    {
        id: 'CACHE_MYTHIC_5',
        label: 'Mythic Treasury V',
        target: 870,
        rewardTails: 2730,
        icon: 'codex/codex-9.webp',
        unlockable: 'Mythic treasury rune V',
    },
];

const getTierCounts = (catTiers: Tier[]) => {
    const counts = {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
    };

    for (const tier of catTiers) {
        if (tier === Tier.COMMON) {
            counts.common += 1;
        } else if (tier === Tier.RARE) {
            counts.rare += 1;
        } else if (tier === Tier.EPIC) {
            counts.epic += 1;
        } else if (tier === Tier.LEGENDARY) {
            counts.legendary += 1;
        }
    }

    return counts;
};

const getAverageProgress = (requirements: IAirdropTierRequirementProgress[]): number => {
    if (!requirements.length) {
        return 0;
    }
    const totalProgress = requirements.reduce((sum, requirement) => {
        if (requirement.target <= 0) {
            return sum + 1;
        }
        return sum + Math.min(requirement.current / requirement.target, 1);
    }, 0);

    return Math.round((totalProgress / requirements.length) * 100);
};

const RESCUE_SCORE_PER_GOAL = 6;
const RESCUE_SCORE_PER_1000_GIVEN = 2;
const RESCUE_SCORE_MAX = 60;

const count = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0);

export function buildAirdropProgression({
    catTiers,
    questsCompleted,
    streak,
    tailsEarned,
    tailsGiven = 0,
    goalsHelped = 0,
    monthTailsGiven = 0,
    monthGoalsHelped = 0,
    packPurchases = 0,
    portraitPurchases = 0,
    claimedRewards,
    claimedChallenges,
    claimedMilestones,
    now = new Date(),
}: {
    catTiers: Tier[];
    questsCompleted: number;
    streak: number;
    /** Lifetime earned Tails (`earnedTails(user)`), never the spendable balance. */
    tailsEarned: number;
    tailsGiven?: number;
    goalsHelped?: number;
    monthTailsGiven?: number;
    monthGoalsHelped?: number;
    packPurchases?: number;
    portraitPurchases?: number;
    claimedRewards: string[];
    claimedChallenges: string[];
    claimedMilestones: string[];
    now?: Date;
}): IAirdropProgressionResponse {
    const tails = count(tailsEarned);
    const given = count(tailsGiven);
    const helped = count(goalsHelped);
    const tierCounts = getTierCounts(catTiers);
    const collectibleScore = catTiers.reduce((sum, tier) => sum + tierScoreWeight[tier], 0);
    const totalPurchases = packPurchases + portraitPurchases;
    const additionalLegendaryCards = Math.max(0, tierCounts.legendary - 1);
    const legendaryStashBonusPercent = additionalLegendaryCards * 10;
    const legendaryStashBonusMultiplier = Number(
        (1 + additionalLegendaryCards * LEGENDARY_STASH_BONUS_PER_EXTRA).toFixed(2)
    );
    const scoreBreakdown: IAirdropScoreBreakdown = {
        catScore: collectibleScore,
        questScore: Math.min(questsCompleted * 2, 40),
        streakScore: Math.min(streak, 30),
        tailsScore: Math.min(Math.floor(tails / 1000), 25),
        rescueScore: Math.min(
            helped * RESCUE_SCORE_PER_GOAL + Math.floor(given / 1000) * RESCUE_SCORE_PER_1000_GIVEN,
            RESCUE_SCORE_MAX
        ),
    };

    const metrics: IAirdropMetrics = {
        collectiblesOwned: catTiers.length,
        tierCounts,
        rareOrAbove: tierCounts.rare + tierCounts.epic + tierCounts.legendary,
        epicOrAbove: tierCounts.epic + tierCounts.legendary,
        questsCompleted,
        streak,
        tails,
        tailsEarned: tails,
        tailsGiven: given,
        goalsHelped: helped,
        monthTailsGiven: count(monthTailsGiven),
        monthGoalsHelped: count(monthGoalsHelped),
        packPurchases,
        portraitPurchases,
        totalPurchases,
        additionalLegendaryCards,
        legendaryStashBonusPercent,
        legendaryStashBonusMultiplier,
        collectibleLevel:
            scoreBreakdown.catScore +
            scoreBreakdown.questScore +
            scoreBreakdown.streakScore +
            scoreBreakdown.tailsScore +
            scoreBreakdown.rescueScore,
        scoreBreakdown,
    };

    const eligibilityCriteria: IAirdropCriterion[] = [
        {
            id: 'COLLECTIBLES',
            label: 'Own collectibles',
            description: 'Hold at least 5 collectibles.',
            current: metrics.collectiblesOwned,
            target: 5,
            met: metrics.collectiblesOwned >= 5,
        },
        {
            id: 'RARE_PLUS',
            label: 'Collect rarity depth',
            description: 'Hold at least 2 rare-or-above collectibles.',
            current: metrics.rareOrAbove,
            target: 2,
            met: metrics.rareOrAbove >= 2,
        },
        {
            id: 'QUESTS',
            label: 'Complete quests',
            description: 'Complete at least 8 quests.',
            current: metrics.questsCompleted,
            target: 8,
            met: metrics.questsCompleted >= 8,
        },
        {
            id: 'STREAK',
            label: 'Sustain activity',
            description: 'Spin the daily wheel on 8 days.',
            current: metrics.streak,
            target: 8,
            met: metrics.streak >= 8,
        },
        {
            id: 'TAILS',
            label: 'Earn Tails',
            description: 'Earn at least 1,500 Tails by playing. Giving them away never lowers this.',
            current: metrics.tails,
            target: 1500,
            met: metrics.tails >= 1500,
        },
        {
            id: 'COLLECTIBLE_LEVEL',
            label: 'Reach collectible level',
            description: 'Reach collectible level 140.',
            current: metrics.collectibleLevel,
            target: 140,
            met: metrics.collectibleLevel >= 140,
        },
    ];

    const claimedChallengesSet = new Set(claimedChallenges);
    const claimedMilestonesSet = new Set(claimedMilestones);

    const dailyChallenges: IAirdropChallenge[] = challengeConfigs.map(challenge => {
        const current = challenge.getCurrent(metrics);
        const completed = current >= challenge.target;
        const claimed = claimedChallengesSet.has(challenge.id);
        const rewardTails = applyLegendaryStashBonus(challenge.rewardTails, legendaryStashBonusMultiplier);
        return {
            id: challenge.id,
            label: challenge.label,
            description: challenge.description,
            current,
            target: challenge.target,
            completed,
            claimed,
            claimable: completed && !claimed,
            rewardTails,
            icon: challenge.icon,
        };
    });

    const milestones: IAirdropMilestone[] = milestoneConfigs.map(milestone => {
        const reached = metrics.collectibleLevel >= milestone.target;
        const claimed = claimedMilestonesSet.has(milestone.id);
        const rewardTails = applyLegendaryStashBonus(milestone.rewardTails, legendaryStashBonusMultiplier);
        return {
            id: milestone.id,
            label: milestone.label,
            current: metrics.collectibleLevel,
            target: milestone.target,
            reached,
            claimed,
            claimable: reached && !claimed,
            rewardTails,
            icon: milestone.icon,
            unlockable: milestone.unlockable,
        };
    });

    const xp = metrics.collectibleLevel * 10;
    const xpPerLevel = 500;
    const level = Math.max(1, Math.floor(xp / xpPerLevel) + 1);
    const nextLevelXp = level * xpPerLevel;
    const levelProgress = Math.min(100, Math.floor(((xp % xpPerLevel) / xpPerLevel) * 100));
    const comboMultiplier = Number(
        (
            1 +
            Math.min(
                metrics.goalsHelped * 0.08 + Math.floor(metrics.streak / 7) * 0.05 + metrics.epicOrAbove * 0.03,
                0.75
            )
        ).toFixed(2)
    );
    const streakBonusTails = Math.min(Math.floor(metrics.streak / 3) * 20, 300);
    let title = 'Newcomer';
    if (level >= 20) {
        title = 'Mythic Guardian';
    } else if (level >= 14) {
        title = 'Elite Curator';
    } else if (level >= 9) {
        title = 'Rescue Strategist';
    } else if (level >= 5) {
        title = 'Collector Scout';
    }
    const challengePotentialBonusTails = dailyChallenges
        .filter(challenge => !challenge.claimed)
        .reduce((sum, challenge) => sum + challenge.rewardTails, 0);
    const milestonePotentialBonusTails = milestones
        .filter(milestone => !milestone.claimed)
        .reduce((sum, milestone) => sum + milestone.rewardTails, 0);
    const potentialBonusTails = challengePotentialBonusTails + milestonePotentialBonusTails;
    const nextMilestoneId = milestones.find(milestone => !milestone.reached)?.id || null;

    const gamification: IAirdropGamification = {
        xp,
        level,
        nextLevelXp,
        levelProgress,
        title,
        comboMultiplier,
        streakBonusTails,
        dailyChallenges,
        milestones,
        nextMilestoneId,
        potentialBonusTails,
    };
    const isEligible = eligibilityCriteria.every(criteria => criteria.met);

    const tiers = tierConfigs.map(tier => {
        const requirements = tier.requirements.map(requirement => {
            const current = requirement.getCurrent(metrics);
            return {
                id: requirement.id,
                label: requirement.label,
                current,
                target: requirement.target,
                met: current >= requirement.target,
            };
        });

        const unlocked = requirements.every(requirement => requirement.met);
        const claimed = claimedRewards.includes(tier.id);

        return {
            id: tier.id,
            name: tier.name,
            description: tier.description,
            requirements,
            reward: {
                ...tier.reward,
                tails: applyLegendaryStashBonus(tier.reward.tails, legendaryStashBonusMultiplier),
            },
            unlocked,
            claimed,
            claimable: isEligible && unlocked && !claimed,
            unlockProgress: getAverageProgress(requirements),
        };
    });

    const unlockedTiers = tiers.filter(tier => tier.unlocked);
    const currentTier = unlockedTiers.length ? unlockedTiers[unlockedTiers.length - 1] : null;
    const nextTier = tiers.find(tier => !tier.unlocked) || null;

    return {
        eligible: isEligible,
        eligibilityCriteria,
        metrics,
        gamification,
        tiers,
        currentTierId: currentTier?.id || null,
        nextTierId: nextTier?.id || null,
        unlockedUnlockables: tiers.filter(tier => tier.unlocked).map(tier => tier.reward.unlockable),
        claimedUnlockables: tiers.filter(tier => tier.claimed).map(tier => tier.reward.unlockable),
        totalClaimedTiers: tiers.filter(tier => tier.claimed).length,
        totalClaimedChallenges: dailyChallenges.filter(challenge => challenge.claimed).length,
        totalClaimedMilestones: milestones.filter(milestone => milestone.claimed).length,
        season: seasonTimes(now),
    };
}
