import type { Custody } from "@/api/impact-api";
import type { MoneyTier } from "./tiers";

/**
 * The tier of an indexed on-chain payout (plan F7.2): shelter-held only when the shelter has the
 * key (`handed-over`); otherwise custodial. The snapshot's `money.custody` is already the
 * conservative answer across every paid wallet.
 */
export function moneyTierFor(custody: Custody): MoneyTier {
  return custody === "handed-over"
    ? "onchain-shelter-held"
    : "onchain-custodial";
}
