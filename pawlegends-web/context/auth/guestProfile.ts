import { CatAbilityType, type ICat, Tier } from "@/models/cats";
import type { SessionProfile } from "./types";

/**
 * The transient template profile (plan F5.5): what a guest sees before the backend answers and
 * before the guest document exists. Nothing is written for it. It mirrors the backend's
 * `transientGuestProfile` (backend/src/user/guest/starter.ts): starter cat `_id: 'guest-starter'`,
 * `onboarding: pending` so Meet your cat (G3) still shows. The art matches the backend's SCOUT
 * placeholder; G3 owns the final look.
 */
export const GUEST_STARTER_ID = "guest-starter";
export const GUEST_NAME = "Guest";

const SCOUT_ART = {
  name: "Scout",
  spriteImg: "https://tokentails.com/cats/yellow/sprites/hat-wizard-blue.png",
  catImg: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/hat-wizard-blue/GROOMING.gif",
  resqueStory: "The cat from the altar. Scout loves long walks and never forgets a friend.",
};

export function guestTemplateProfile(): SessionProfile {
  const cat = {
    _id: GUEST_STARTER_ID,
    isStarter: true,
    isGuestStarter: true,
    starterBreed: "SCOUT",
    name: SCOUT_ART.name,
    type: CatAbilityType.GRASS,
    tier: Tier.COMMON,
    spriteImg: SCOUT_ART.spriteImg,
    catImg: SCOUT_ART.catImg,
    resqueStory: SCOUT_ART.resqueStory,
    status: { EAT: 0 },
  } as unknown as ICat;

  return {
    _id: "",
    isGuest: true,
    transient: true,
    name: GUEST_NAME,
    onboarding: { state: "pending" },
    tails: 0,
    pendingTails: 0,
    streak: 0,
    discount: "",
    affiliated: 0,
    spent: 0,
    codex: [],
    boxes: 0,
    cat,
    cats: [],
    score: 0,
    wallets: undefined as unknown as SessionProfile["wallets"],
    catnipChaos: [],
    catnipChaosCount: 0,
    catnipCount: 0,
    seasonEvent: [],
    seasonEventCount: 0,
    match3: [],
    match3Count: 0,
    match3Score: [],
    match3ScoreCount: 0,
    referralsCount: 0,
    quests: [],
    monthTails: 0,
    monthSpent: 0,
    canRedeemLives: false,
    monthCatsAdopted: 0,
    monthBoxes: 0,
    monthPacks: 0,
    monthFeeded: 0,
    monthStreak: 0,
    monthReferrals: 0,
    monthTicketCount: 0,
    monthTailsCrafted: 0,
    portraitPurchases: 0,
    monthPortraitPurchases: 0,
    airdropRewardsClaimed: [],
    airdropChallengesClaimed: [],
    airdropMilestonesClaimed: [],
  };
}

/**
 * Fills the fields a server profile may leave out (the backend's transient profile carries only a
 * few), so lobby code that reads `profile.codex.length` never meets `undefined`.
 */
export function withProfileDefaults(profile: SessionProfile): SessionProfile {
  // Identity fields never come from the template: a pre-backfill document without `isGuest` is a
  // registered account, not a guest.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { _id, name, isGuest, transient, onboarding, pendingTails, cat, wallets, ...defaults } =
    guestTemplateProfile();
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const merged = { ...profile } as unknown as Record<string, unknown>;
  Object.entries(defaults).forEach(([key, value]) => {
    const current = merged[key];
    if (current === undefined || current === null || (Array.isArray(value) && !Array.isArray(current))) {
      merged[key] = value;
    }
  });
  if (!merged.cat) merged.cat = cat;
  return merged as unknown as SessionProfile;
}
