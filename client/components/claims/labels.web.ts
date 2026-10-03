// copy-lint: web-only the web label set; Claim picks labels.app.ts under isApp (plan F7.2)
import type { LabelSet } from "./tiers";

/** Web labels (plan F7.2). App builds use labels.app.ts, which has no chain words. */
export const WEB_LABELS: LabelSet = {
  chip: {
    "onchain-shelter-held": "ON-CHAIN · SHELTER-HELD",
    "onchain-custodial": "ON-CHAIN · CUSTODIAL",
    "shelter-signed": "SHELTER-SIGNED",
    "shelter-confirmed": "SHELTER-CONFIRMED",
    pledged: "PLEDGED",
    "shelter-reported": "SHELTER-REPORTED",
    "in-game": "IN-GAME",
    verified: "VERIFIED",
    "company-reported": "COMPANY-REPORTED",
    "sei-era": "SEI ERA · HISTORICAL",
    live: "LIVE",
    stale: "STALE",
  },
  explain: {
    "onchain-shelter-held":
      "Indexed on-chain payout to a shelter wallet that the shelter itself holds the key to.",
    "onchain-custodial":
      "Indexed on-chain payout to a shelter wallet that Token Tails still holds the key for, until the handover.",
    "shelter-signed": "Off-chain payout the shelter signed with its own key.",
    "shelter-confirmed":
      "Off-chain payout a shelter member confirmed; the receipt's SHA-256 is stored.",
    pledged: "Committed by Token Tails but not paid yet.",
    "shelter-reported": "The shelter's own figure, with its source and date.",
    "in-game": "Paws, Tails and runs inside the game. Never money.",
    verified: "Checked at a public source on the date shown.",
    "company-reported":
      "Token Tails' own figure. No outside source has confirmed it.",
    "sei-era":
      "True, but from the retired SEI deployment. History, not today's activity.",
    live: "Read from the hourly impact snapshot.",
    stale:
      "Past its check-by date. It is shown with its date until someone checks it again.",
  },
};
