import { allPublicFacts, factText, type FactValues, type PublicFact } from "@/components/claims/facts";

/**
 * The public fact registered under a `key` (funding/framework/facts/facts.json), or null. Only
 * published facts are in the generated list, so an unverified entry is never found here.
 */
export function factByKey(key: string, facts: PublicFact[] = allPublicFacts()): PublicFact | null {
  return facts.find((f) => (f as PublicFact & { key?: string }).key === key) || null;
}

/**
 * The words of a public fact, or null. A missing fact, or one that is not verified (or live), hides
 * the line: wallet-giving claims (router guard, gasless gift, match cap) are never hardcoded.
 */
export function factLine(key: string, values: FactValues = {}, facts?: PublicFact[]): string | null {
  const fact = factByKey(key, facts);
  if (!fact) return null;
  if (fact.status !== "verified" && fact.status !== "live") return null;
  return factText(fact, values);
}

/** Fact keys added by the router feature (F1). Until `fund facts build` publishes them, lines hide. */
export const FACT = {
  routerGuard: "router_guard",
  gaslessGive: "gasless_give",
  matchCap: "match_cap",
  matchState: "match_state",
} as const;
