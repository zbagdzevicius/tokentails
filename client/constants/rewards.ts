import { REWARDS as SHARED_REWARDS } from "@/shared-contracts/caps";

// The fixed amounts come from the generated copy of shared/caps.ts (plan F2), shared with the backend.
// The daily wheel bounds are display-only and exist on the client alone.
export const REWARDS = {
  ...SHARED_REWARDS,
  DAILY_REWARD_MIN: 1,
  DAILY_REWARD_MAX: 1000,
};
