/**
 * The shelter claim message is built on both sides (client claim.ts, backend
 * shelter-claim.service.ts shelterClaimMessage). This pins it byte for byte.
 */
import { claimMessage, claimMessageV2, utf8ToHex } from "@/components/shelter-payouts/claim";
import { chainClaimCopy, claimStatusCopy, onboardMessage } from "@/components/shelter-payouts/ShelterOnboard";
import { getClaimChains } from "@/components/shelter-payouts/relayApi";

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

describe("claimMessageV2 (one signature, several chains)", () => {
  const wallet = "0xe299299b846ba629f5a591dbf4f562bcc07a0f37";
  it("is the exact shared v2 text: chain ids ascending, deduplicated", () => {
    expect(claimMessageV2({ wallet, chains: [42161, 5042, 8453, 5042], issued: new Date("2026-10-04T10:00:00Z") })).toBe(
      "Token Tails shelter payout wallet (v2)\n" +
        "Shelter: Pink Paw (Rozine pedute)\n" +
        "Wallet: 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37\n" +
        "Chains: 5042, 8453, 42161\n" +
        "Issued: 2026-10-04"
    );
  });

  it("names every chain where Pink Paw is listed", () => {
    expect(claimMessageV2({ wallet, chains: "all", issued: "2026-10-04" })).toContain(
      "\nChains: all chains where Pink Paw is listed\nIssued: 2026-10-04"
    );
  });

  it("the onboard page signs v2 for several chains and keeps v1 for one", () => {
    const issued = new Date("2026-10-04T10:00:00Z");
    const one = [{ chainId: 5042, testnet: false, main: true, claim: null }];
    const two = [...one, { chainId: 8453, testnet: false, main: false, claim: null }];
    expect(onboardMessage(wallet, 5042, one, issued)).toBe(claimMessage({ wallet, chainId: 5042, issued }));
    expect(onboardMessage(wallet, 5042, undefined, issued)).toBe(claimMessage({ wallet, chainId: 5042, issued }));
    expect(onboardMessage(wallet, 5042, two, issued)).toBe(claimMessageV2({ wallet, chains: "all", issued }));
  });

  it("says where the claim stands on each chain", () => {
    expect(chainClaimCopy({ chainId: 8453, testnet: false, main: false, claim: null })).toBe("Base: not registered yet");
    expect(
      chainClaimCopy({ chainId: 84532, testnet: true, main: false, claim: { wallet, chainId: 84532, status: "rotated" } })
    ).toMatch(/^Base Sepolia.*registered, payouts go to this wallet$/);
  });

  it("reads GET /shelter/claim/chains, and undefined from an older backend", async () => {
    const ok = (body: unknown, status = 200) =>
      (async () => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;
    await expect(
      getClaimChains(ok([{ chainId: 5042, testnet: false, main: true, claim: { wallet, chainId: 5042, status: "approved" } }]))
    ).resolves.toEqual([{ chainId: 5042, testnet: false, main: true, claim: { wallet, chainId: 5042, status: "approved" } }]);
    await expect(getClaimChains(ok({ message: "nope" }, 404))).resolves.toBeUndefined();
  });
});
