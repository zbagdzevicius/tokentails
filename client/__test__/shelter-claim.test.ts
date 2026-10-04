/**
 * The shelter claim message is built on both sides (client claim.ts, backend
 * shelter-claim.service.ts shelterClaimMessage). This pins it byte for byte.
 */
import { claimMessage, utf8ToHex } from "@/components/shelter-payouts/claim";
import { claimStatusCopy } from "@/components/shelter-payouts/ShelterOnboard";

describe("claimMessage", () => {
  it("is the exact shared text, with a checksummed wallet and the UTC day", () => {
    expect(
      claimMessage({
        wallet: "0xe299299b846ba629f5a591dbf4f562bcc07a0f37",
        chainId: 5042,
        issued: new Date("2026-10-04T23:30:00Z"),
      })
    ).toBe(
      "Token Tails shelter payout wallet\n" +
        "Shelter: Pink Paw (Rozine pedute)\n" +
        "Wallet: 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37\n" +
        "Chain: 5042\n" +
        "Issued: 2026-10-04"
    );
  });

  it("accepts an ISO string and keeps only the day", () => {
    expect(claimMessage({ wallet: "0x" + "ab".repeat(20), chainId: 1, issued: "2026-12-31T00:00:01.000Z" })).toMatch(
      /\nIssued: 2026-12-31$/
    );
  });

  it("encodes UTF-8 for personal_sign", () => {
    expect(utf8ToHex("é")).toBe("0xc3a9");
  });
});

describe("claimStatusCopy", () => {
  it("says what happens next", () => {
    expect(claimStatusCopy({ wallet: "0x1", chainId: 5042, status: "pending-rotation" })).toBe(
      "Waiting for Token Tails to register this wallet on-chain."
    );
    expect(claimStatusCopy({ wallet: "0x1", chainId: 5042, status: "rotated" })).toMatch(/^Registered/);
    expect(claimStatusCopy(null)).toMatch(/No wallet/);
    // Right after sending: the backend keeps an unconfirmed claim private, so the page says it arrived.
    expect(claimStatusCopy(null, true)).toBe(
      "Claim received. Token Tails will confirm it with the shelter by a separate channel, then register it on-chain."
    );
    expect(claimStatusCopy(undefined)).toMatch(/Could not reach/);
  });
});
