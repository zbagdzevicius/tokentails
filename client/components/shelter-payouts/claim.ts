// copy-lint: web-only used only by the web onboarding page (app builds render AppProofNotice)
// The message a shelter signs to claim its payout wallet (POST /shelter/claim). The backend builds
// and checks the same string; __test__/shelter-claim.test.ts pins it byte for byte, so a change on
// either side shows up as a failing test.
import { toChecksumAddress } from "./keccak";

/** The shelter name as it appears in the claim message (ASCII-folded, fixed by the shared spec). */
export const CLAIM_SHELTER = "Pink Paw (Rozine pedute)";

/** `Issued:` is the UTC day, `YYYY-MM-DD` (the backend also accepts yesterday's, around midnight). */
export function claimMessage(opts: { wallet: string; chainId: number; issued: Date | string }): string {
  const issued = (typeof opts.issued === "string" ? opts.issued : opts.issued.toISOString()).slice(0, 10);
  return [
    "Token Tails shelter payout wallet",
    `Shelter: ${CLAIM_SHELTER}`,
    `Wallet: ${toChecksumAddress(opts.wallet)}`,
    `Chain: ${opts.chainId}`,
    `Issued: ${issued}`,
  ].join("\n");
}

/** The v2 `Chains:` line for every chain where the shelter is listed (the backend's CLAIM_ALL_CHAINS). */
export const CLAIM_ALL_CHAINS = "all chains where Pink Paw is listed";

/**
 * The v2 message: one signature names several chains (ascending, ", "-separated) or every chain where
 * the shelter is listed; the backend records one claim per chain. Pinned with the backend's
 * shelterClaimMessageV2 by __test__/shelter-claim.test.ts.
 */
export function claimMessageV2(opts: { wallet: string; chains: number[] | "all"; issued: Date | string }): string {
  const issued = (typeof opts.issued === "string" ? opts.issued : opts.issued.toISOString()).slice(0, 10);
  const chains =
    opts.chains === "all"
      ? CLAIM_ALL_CHAINS
      : opts.chains
          .map(Number)
          .filter((n, i, all) => Number.isSafeInteger(n) && n > 0 && all.indexOf(n) === i)
          .sort((a, b) => a - b)
          .join(", ");
  return [
    "Token Tails shelter payout wallet (v2)",
    `Shelter: ${CLAIM_SHELTER}`,
    `Wallet: ${toChecksumAddress(opts.wallet)}`,
    `Chains: ${chains}`,
    `Issued: ${issued}`,
  ].join("\n");
}

/** personal_sign wants the message as 0x-hex UTF-8 (some wallets also take plain text). */
export function utf8ToHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
