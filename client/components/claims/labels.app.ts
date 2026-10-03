import type { LabelSet } from "./tiers";

/**
 * App-build labels (plan F7.2 app-build rendering rule): no chain words. The on-chain tiers say who
 * holds the money; the other tiers keep their web labels. Tapping a chip opens web /impact.
 */
export const APP_LABELS: LabelSet = {
  chip: {
    "onchain-shelter-held": "HELD BY SHELTER",
    "onchain-custodial": "HELD BY TOKEN TAILS",
    "shelter-signed": "SHELTER-SIGNED",
    "shelter-confirmed": "SHELTER-CONFIRMED",
    pledged: "PLEDGED",
    "shelter-reported": "SHELTER-REPORTED",
    "in-game": "IN-GAME",
    verified: "VERIFIED",
    "company-reported": "COMPANY-REPORTED",
    "sei-era": "HISTORICAL",
    live: "LIVE",
    stale: "STALE",
  },
  explain: {
    "onchain-shelter-held": "Held by the shelter itself.",
    "onchain-custodial":
      "Held by Token Tails for the shelter until the shelter takes it over.",
    "shelter-signed": "A payout the shelter signed with its own key.",
    "shelter-confirmed":
      "A payout a shelter member confirmed, with a stored receipt.",
    pledged: "Committed by Token Tails but not paid yet.",
    "shelter-reported": "The shelter's own figure, with its source and date.",
    "in-game": "Paws, Tails and runs inside the game. Never money.",
    verified: "Checked at a public source on the date shown.",
    "company-reported":
      "Token Tails' own figure. No outside source has confirmed it.",
    "sei-era":
      "From an earlier version of Token Tails. History, not today's activity.",
    live: "Read from the hourly impact snapshot.",
    stale:
      "Past its check-by date. It is shown with its date until someone checks it again.",
  },
};
