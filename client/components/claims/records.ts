import type { PublicFact } from "@/lib/facts.generated";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * Where a reader asks for the records behind a company-reported number (the receipts, transfer
 * records and invoices Token Tails holds). The same inbox as account support (AuthSheet).
 */
export const RECORDS_EMAIL = SUPPORT_EMAIL;

/**
 * Whether the page may offer a records request for an entry. Opt-in per registry entry
 * (`recordsOnRequest`), set only once Token Tails has confirmed the inbox answers such requests.
 */
export function offersRecords(
  fact: Pick<PublicFact, "recordsOnRequest">
): boolean {
  return fact.recordsOnRequest === true;
}

/** A mailto link that names the claim, so the request arrives with its registry id. */
export function recordsMailto(id: string): string {
  const subject = encodeURIComponent(`Records for claim ${id}`);
  const body = encodeURIComponent(
    `Hi Token Tails,\n\nPlease send me the records behind claim ${id} on tokentails.com/impact.\n`
  );
  return `mailto:${RECORDS_EMAIL}?subject=${subject}&body=${body}`;
}
