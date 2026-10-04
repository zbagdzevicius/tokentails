/**
 * Wallet gifts through the DonateRouter with a mocked EIP-1193 provider: nothing is signed for real
 * and nothing leaves this process.
 */
import {
  AUTHORIZATION_STATE_SELECTOR,
  CAN_DONATE_SELECTOR,
  DECIMALS_SELECTOR,
  DOMAIN_SEPARATOR_SELECTOR,
  NAME_SELECTOR,
  PREVIEW_SELECTOR,
  RECIPIENTS_HASH_SELECTOR,
  SPLIT_SELECTOR,
  VERSION_SELECTOR,
  authNonce,
  encodeDonateNativeCalldata,
  encodeDonateWithAuthorizationCalldata,
  eip712DomainSeparator,
  recipientsHashOf,
} from "@/components/shelter-payouts/calldata";
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import { toChecksumAddress } from "@/components/shelter-payouts/keccak";
import type { RelayBody, RelayResult } from "@/components/shelter-payouts/relayApi";
import { ROUTER_DONATION_TOPIC } from "@/components/shelter-payouts/receipt";
import {
  Eip1193,
  GiftError,
  RelayRefusedError,
  WALLET_MEMO_RE,
  addChainParams,
  readUsdcDomain,
  CustodyError,
  RevertedError,
  SmartAccountError,
  WrongNetworkError,
  findSettledGift,
  giveNative,
  isUsdcNative,
  randomSalt,
  selfSubmitGift,
  signAndGive,
  signedGiftExpired,
  signedGiftNonce,
  waitForReceipt,
  walletErrorMessage,
  walletMemo,
} from "@/components/shelter-payouts/wallet";

const ARC_TEST = SHELTER_CHAINS[5042002];
const BASE = SHELTER_CHAINS[8453];
const FROM = "0x" + "33".repeat(20);
const ROUTER = "0x" + "44".repeat(20);
const USDC = "0x3600000000000000000000000000000000000000";
const RECIPIENTS = "0x" + "5e".repeat(32);
const TX = "0x" + "ab".repeat(32);
const SPLIT = "0x" + "66".repeat(20);
const SHELTER = "0x" + "77".repeat(20);
const HELD = "0x" + "e2".repeat(20);

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const abiString = (s: string) =>
  "0x" + word(32) + word(s.length) + Buffer.from(s).toString("hex").padEnd(64, "0");

function provider(
  opts: {
    toTreasury?: bigint;
    paused?: boolean;
    chainId?: string;
    /** No version(): the domain comes from DOMAIN_SEPARATOR() (USDG signs with "1"). */
    domainSeparator?: string;
    /** The token has no EIP-3009 (Tempo TIP-20, Robinhood testnet mUSDC). */
    no3009?: boolean;
    /** eth_call of the gift transaction itself reverts with this message. */
    revert?: string;
    /** Code at the donor's address (a smart account, or 0xef0100… for an EIP-7702 delegation). */
    fromCode?: string;
    /** No code at the router (a wrong network or a wrong address). */
    noRouter?: boolean;
    /** The wallets split.preview pays (amount 1 each). */
    payees?: string[];
    /** eth_chainId answers after the first one (a wallet that ignores the switch). */
    chainAfterSwitch?: string;
    /** router.recipientsHash answers this instead of RECIPIENTS (e.g. the honest hash of the preview). */
    recipients?: string;
  } = {}
) {
  let chainCalls = 0;
  const calls: { method: string; params?: unknown[] }[] = [];
  const eth: Eip1193 = {
    request: jest.fn(async (args) => {
      calls.push(args);
      switch (args.method) {
        case "eth_requestAccounts":
          return [FROM];
        case "eth_chainId":
          return chainCalls++ > 0 && opts.chainAfterSwitch ? opts.chainAfterSwitch : opts.chainId || "0x4cef52"; // 5042002
        case "wallet_switchEthereumChain":
          return null;
        case "eth_getCode": {
          const addr = String(args.params?.[0]).toLowerCase();
          if (addr === FROM) return opts.fromCode || "0x";
          if (addr === ROUTER) return opts.noRouter ? "0x" : "0x6080";
          return "0x";
        }
        case "eth_call": {
          const data = (args.params?.[0] as { data: string }).data;
          const sel = data.slice(0, 10);
          if (sel === DECIMALS_SELECTOR) return "0x" + word(6);
          if (sel === NAME_SELECTOR) return abiString("USDC");
          if (sel === VERSION_SELECTOR) {
            if (opts.domainSeparator) throw Object.assign(new Error("execution reverted"), { code: 3 });
            return abiString("2");
          }
          if (sel === DOMAIN_SEPARATOR_SELECTOR && opts.domainSeparator) return opts.domainSeparator;
          if (sel === AUTHORIZATION_STATE_SELECTOR) {
            if (opts.no3009) throw Object.assign(new Error("execution reverted"), { code: 3 });
            return "0x" + word(0);
          }
          if ((args.params?.[0] as { from?: string }).from) {
            // The pre-flight of the gift transaction itself.
            if (opts.revert) throw Object.assign(new Error("execution reverted: " + opts.revert), { code: 3 });
            return "0x";
          }
          if (sel === RECIPIENTS_HASH_SELECTOR) return opts.recipients || RECIPIENTS;
          if (sel === SPLIT_SELECTOR) return "0x" + word(BigInt(SPLIT));
          if (sel === PREVIEW_SELECTOR) {
            const ws = opts.payees || [SHELTER];
            return (
              "0x" + word(96) + word(128 + ws.length * 32) + word(0) +
              word(ws.length) + ws.map((w) => word(BigInt(w))).join("") +
              word(ws.length) + ws.map(() => word(1)).join("")
            );
          }
          if (sel === CAN_DONATE_SELECTOR) {
            const t = opts.toTreasury || BigInt(0);
            return "0x" + word(t === BigInt(0) && !opts.paused ? 1 : 0) + word(t);
          }
          throw new Error("unexpected eth_call " + sel);
        }
        case "eth_signTypedData_v4":
          return "0x" + "cd".repeat(65);
        case "eth_sendTransaction":
          return TX;
      }
      throw new Error("unexpected " + args.method);
    }),
  };
  return { eth, calls };
}

// Deterministic "random" bytes: 0x01 0x02 ...
const rand = (n: number) => Uint8Array.from({ length: n }, (_, i) => i + 1);
const NOW = Date.parse("2026-10-04T12:00:00Z");

describe("memo and salt", () => {
  it("memo is tt:wallet:<8 lowercase hex>, never personal data", () => {
    expect(walletMemo(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))).toBe("tt:wallet:deadbeef");
    expect(walletMemo()).toMatch(WALLET_MEMO_RE);
    expect(walletMemo()).not.toBe(walletMemo());
  });

  it("salt is 32 random bytes", () => {
    expect(randomSalt()).toMatch(/^0x[0-9a-f]{64}$/);
    expect(randomSalt(rand(32))).toBe("0x" + Array.from(rand(32), (b) => b.toString(16).padStart(2, "0")).join(""));
  });
});

describe("signAndGive", () => {
  it("checks the guard, signs one ReceiveWithAuthorization to the router and hands it to the relay", async () => {
    const { eth, calls } = provider();
    const relayed: RelayBody[] = [];
    const relay = async (b: RelayBody): Promise<RelayResult> => {
      relayed.push(b);
      return { ok: true, txHash: TX, status: "submitted" };
    };
    const res = await signAndGive({
      provider: eth,
      chainId: 5042002,
      chain: ARC_TEST,
      router: ROUTER,
      usdc: USDC,
      amount: "0.5",
      relay,
      now: () => NOW,
      rand,
    });
    expect(res).toEqual({ txHash: TX, from: FROM, memo: "tt:wallet:01020304", relayed: true });
    // The guard is read before the wallet is asked to sign.
    const methods = calls.map((c) => c.method);
    expect(methods.indexOf("eth_signTypedData_v4")).toBeGreaterThan(
      calls.findIndex((c) => c.method === "eth_call" && (c.params?.[0] as { data: string }).data.startsWith(CAN_DONATE_SELECTOR))
    );
    expect(methods).not.toContain("eth_sendTransaction");

    const sign = calls.find((c) => c.method === "eth_signTypedData_v4")!;
    expect(sign.params?.[0]).toBe(FROM);
    const typed = JSON.parse(sign.params?.[1] as string);
    const salt = randomSalt(rand(32));
    expect(typed.domain).toEqual({ name: "USDC", version: "2", chainId: 5042002, verifyingContract: USDC });
    expect(typed.message).toEqual({
      from: toChecksumAddress(FROM),
      to: toChecksumAddress(ROUTER),
      value: "500000",
      validAfter: "0",
      validBefore: String(NOW / 1000 + 300),
      nonce: authNonce(ROUTER, salt, "tt:wallet:01020304", RECIPIENTS),
    });

    expect(relayed).toEqual([
      {
        chainId: 5042002,
        from: FROM,
        value: "500000",
        validAfter: "0",
        validBefore: String(NOW / 1000 + 300),
        salt,
        memo: "tt:wallet:01020304",
        recipients: RECIPIENTS,
        signature: "0x" + "cd".repeat(65),
      },
    ]);
  });

  it("refuses before signing when part of the gift would reach the treasury", async () => {
    const { eth, calls } = provider({ toTreasury: BigInt(1) });
    await expect(
      signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", rand })
    ).rejects.toThrow(/would not reach the shelter/);
    expect(calls.map((c) => c.method)).not.toContain("eth_signTypedData_v4");
  });

  it("refuses while the split is paused", async () => {
    const { eth } = provider({ paused: true });
    await expect(
      signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", rand })
    ).rejects.toBeInstanceOf(GiftError);
  });

  it("offers a self-submit when the relay is off, and sends the same signed gift", async () => {
    const { eth, calls } = provider();
    const relay = async (): Promise<RelayResult> => ({
      ok: false,
      code: "RELAY_WRONG_CHAIN",
      message: "This gift was signed for a different network.",
      httpStatus: 400,
    });
    let refused: RelayRefusedError | null = null;
    try {
      await signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", relay, now: () => NOW, rand });
    } catch (err) {
      refused = err as RelayRefusedError;
    }
    expect(refused).toBeInstanceOf(RelayRefusedError);
    expect(walletErrorMessage(refused)).toBe("This gift was signed for a different network.");

    const res = await selfSubmitGift(eth, ARC_TEST, refused!.signed);
    expect(res.relayed).toBe(false);
    const send = calls.find((c) => c.method === "eth_sendTransaction")!;
    expect(send.params?.[0]).toEqual({
      from: FROM,
      to: ROUTER,
      data: encodeDonateWithAuthorizationCalldata(refused!.signed.auth, refused!.signed.signature),
      chainId: "0x4cef52",
    });
  });

  it("shows a hard relay refusal as it is, with no self-submit", async () => {
    const { eth } = provider();
    const relay = async (): Promise<RelayResult> => ({ ok: false, code: "RELAY_BAD_SIGNATURE", message: "The signature does not match the gift.", httpStatus: 400 });
    const err = await signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", relay, rand }).catch((e) => e);
    expect(err).toBeInstanceOf(GiftError);
    expect(err).not.toBeInstanceOf(RelayRefusedError);
  });
});

describe("token checks before the wallet opens", () => {
  it("recovers the EIP-712 version from DOMAIN_SEPARATOR when version() is missing (USDG signs with 1)", async () => {
    const chainId = 4663;
    const sep1 = eip712DomainSeparator({ name: "USDC", version: "1", chainId, verifyingContract: USDC });
    const { eth } = provider({ domainSeparator: sep1 });
    await expect(readUsdcDomain(eth, USDC, chainId)).resolves.toEqual({ name: "USDC", version: "1" });
    // A separator matching neither version refuses instead of signing with a guess.
    const { eth: odd } = provider({ domainSeparator: "0x" + "77".repeat(32) });
    await expect(readUsdcDomain(odd, USDC, chainId)).rejects.toBeInstanceOf(GiftError);
  });

  it("refuses a token without EIP-3009 before anything is signed", async () => {
    const { eth, calls } = provider({ no3009: true });
    await expect(
      signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", rand })
    ).rejects.toThrow(/one-signature gift/);
    expect(calls.map((c) => c.method)).not.toContain("eth_signTypedData_v4");
  });

  it("a gift that would revert never reaches eth_sendTransaction", async () => {
    const { eth, calls } = provider({ revert: "RecipientsChanged" });
    await expect(giveNative({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, amount: "0.5", rand })).rejects.toThrow(
      /would refuse this gift \(RecipientsChanged\)/
    );
    expect(calls.map((c) => c.method)).not.toContain("eth_sendTransaction");
  });

  it("adds Tempo with a USD fee coin, never a coin called 'native'", () => {
    expect(addChainParams(4217, SHELTER_CHAINS[4217]).nativeCurrency).toEqual({ name: "USD", symbol: "USD", decimals: 18 });
    expect(addChainParams(5042002, ARC_TEST).nativeCurrency).toEqual({ name: "USDC", symbol: "USDC", decimals: 18 });
  });
});

describe("native gifts", () => {
  it("Arc: router.donateNative(memo, recipients) with the amount at 18 decimals", async () => {
    const { eth, calls } = provider();
    const res = await giveNative({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, amount: "0.5", rand });
    expect(res.memo).toBe("tt:wallet:01020304");
    expect(calls.find((c) => c.method === "eth_sendTransaction")?.params?.[0]).toEqual({
      from: FROM,
      to: ROUTER,
      value: "0x6f05b59d3b20000",
      data: encodeDonateNativeCalldata("tt:wallet:01020304", RECIPIENTS),
      chainId: "0x4cef52",
    });
  });

  it("never sends ETH, AVAX or MON as a gift: the native path refuses before the wallet opens", async () => {
    for (const id of [8453, 84532, 42161, 43114, 143]) {
      const chain = SHELTER_CHAINS[id];
      expect(isUsdcNative(chain)).toBe(false);
      const { eth, calls } = provider();
      await expect(giveNative({ provider: eth, chainId: id, chain, router: ROUTER, amount: "1" })).rejects.toThrow(/USDC-only/);
      expect(calls).toEqual([]);
    }
    expect(isUsdcNative(BASE)).toBe(false);
    expect(isUsdcNative(SHELTER_CHAINS[5042])).toBe(true);
  });
});

describe("waitForReceipt", () => {
  it("polls until mined, and reports a revert", async () => {
    let n = 0;
    const eth: Eip1193 = {
      request: jest.fn(async () => (++n < 3 ? null : { status: "0x1", blockNumber: "0x10" })),
    };
    const r = await waitForReceipt(eth, TX, { sleep: async () => undefined });
    expect(r.blockNumber).toBe("0x10");
    expect(n).toBe(3);
    const reverted: Eip1193 = { request: jest.fn(async () => ({ status: "0x0" })) };
    await expect(waitForReceipt(reverted, TX, { sleep: async () => undefined })).rejects.toBeInstanceOf(RevertedError);
  });
});

describe("fund safety before the wallet opens", () => {
  const ARC = SHELTER_CHAINS[5042];
  const guard = { shelterWallets: [SHELTER], heldWallets: [HELD] };

  it("real money: refuses unless every payee is a shelter-claimed wallet, none held by Token Tails", async () => {
    // No guard at all: closed.
    const a = provider({ chainId: "0x13b2" });
    await expect(giveNative({ provider: a.eth, chainId: 5042, chain: ARC, router: ROUTER, amount: "1", rand })).rejects.toBeInstanceOf(CustodyError);
    // The split still pays the held wallet (the JSON flag was flipped before the on-chain rotation).
    const b = provider({ chainId: "0x13b2", payees: [HELD] });
    await expect(
      giveNative({ provider: b.eth, chainId: 5042, chain: ARC, router: ROUTER, amount: "1", rand, custody: { shelterWallets: [HELD, SHELTER], heldWallets: [HELD] } })
    ).rejects.toBeInstanceOf(CustodyError);
    expect(b.calls.map((c) => c.method)).not.toContain("eth_sendTransaction");
    // A second, unclaimed payee: closed too.
    const c = provider({ chainId: "0x13b2", payees: [SHELTER, "0x" + "88".repeat(20)] });
    await expect(giveNative({ provider: c.eth, chainId: 5042, chain: ARC, router: ROUTER, amount: "1", rand, custody: guard })).rejects.toBeInstanceOf(
      CustodyError
    );
    // The router's payout list differs from the preview the guard checked (it changed between the
    // two reads, or the router reads another split): closed, nothing is sent.
    const e = provider({ chainId: "0x13b2" });
    await expect(giveNative({ provider: e.eth, chainId: 5042, chain: ARC, router: ROUTER, amount: "1", rand, custody: guard })).rejects.toBeInstanceOf(
      CustodyError
    );
    expect(e.calls.map((x) => x.method)).not.toContain("eth_sendTransaction");
    // The claimed shelter wallet only, and the router signs that same list: open.
    const d = provider({ chainId: "0x13b2", recipients: recipientsHashOf([SHELTER], [BigInt(1)]) });
    await expect(giveNative({ provider: d.eth, chainId: 5042, chain: ARC, router: ROUTER, amount: "1", rand, custody: guard })).resolves.toMatchObject({
      txHash: TX,
    });
    expect(d.calls.find((x) => x.method === "eth_sendTransaction")?.params?.[0]).toMatchObject({ chainId: "0x13b2" });
  });

  it("the testnet needs no custody guard (test USDC)", async () => {
    const { eth } = provider({ payees: [HELD] });
    await expect(giveNative({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, amount: "0.5", rand })).resolves.toMatchObject({ txHash: TX });
  });

  it("never sends when the wallet ignored the network switch", async () => {
    const { eth, calls } = provider({ chainId: "0x1", chainAfterSwitch: "0x1" });
    await expect(giveNative({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, amount: "0.5", rand })).rejects.toBeInstanceOf(
      WrongNetworkError
    );
    expect(calls.map((c) => c.method)).not.toContain("eth_sendTransaction");
  });

  it("refuses to sign when the router has no code on the wallet's network", async () => {
    const { eth, calls } = provider({ noRouter: true });
    await expect(
      signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", rand })
    ).rejects.toThrow(/not on Arc Testnet/);
    expect(calls.map((c) => c.method)).not.toContain("eth_signTypedData_v4");
  });

  it("explains that smart accounts and EIP-7702 delegated wallets cannot sign the gift yet", async () => {
    const { eth, calls } = provider({ fromCode: "0xef0100" + "99".repeat(20) });
    const err = await signAndGive({ provider: eth, chainId: 5042002, chain: ARC_TEST, router: ROUTER, usdc: USDC, amount: "1", rand }).catch((e) => e);
    expect(err).toBeInstanceOf(SmartAccountError);
    expect(walletErrorMessage(err)).toMatch(/Smart-account wallets can't sign this gift yet/);
    expect(calls.map((c) => c.method)).not.toContain("eth_signTypedData_v4");
  });
});

describe("a signed gift someone else submitted first", () => {
  const signed = {
    chainId: 5042002,
    router: ROUTER,
    auth: { from: FROM, value: "500000", validAfter: "0", validBefore: String(NOW / 1000 + 300), salt: "0x" + "01".repeat(32), memo: "tt:wallet:01020304", recipients: RECIPIENTS },
    signature: "0x" + "cd".repeat(65),
  };

  it("finds the paying transaction by the signed nonce in RouterDonation", async () => {
    const other = "0x" + "ef".repeat(32);
    const seen: unknown[][] = [];
    const rpc = async <T,>(method: string, params: unknown[]): Promise<T> => {
      seen.push([method, params]);
      if (method === "eth_blockNumber") return "0x2000" as T;
      return [{ transactionHash: other, topics: [ROUTER_DONATION_TOPIC, "0x0", "0x1", signedGiftNonce(signed)] }] as T;
    };
    await expect(findSettledGift(rpc, signed)).resolves.toBe(other);
    expect((seen[1][1] as { topics: unknown[] }[])[0].topics).toEqual([ROUTER_DONATION_TOPIC, null, null, signedGiftNonce(signed)]);
    const none = async <T,>(method: string): Promise<T> => (method === "eth_blockNumber" ? "0x10" : []) as T;
    await expect(findSettledGift(none, signed)).resolves.toBeNull();
  });

  it("stops offering a self-submit 15 s before the signature expires", () => {
    expect(signedGiftExpired(signed, NOW)).toBe(false);
    expect(signedGiftExpired(signed, NOW + 286_000)).toBe(true);
  });
});
