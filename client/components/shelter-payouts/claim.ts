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

/** personal_sign wants the message as 0x-hex UTF-8 (some wallets also take plain text). */
export function utf8ToHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
