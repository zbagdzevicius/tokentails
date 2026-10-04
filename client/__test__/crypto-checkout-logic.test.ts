import { CryptoPayApiError } from "@/components/web3/crypto/api";
import {
  CheckoutError,
  MIN_SECONDS_TO_PAY,
  PENDING_KEY,
  checkSteps,
  clearPending,
  configTokens,
  confirmUntilSettled,
  encodeDisburse,
  errorMessage,
  eurcNote,
  formatUnits,
  isTxHash,
  loadPending,
  mmss,
  networkChoices,
  payWithWallet,
  paymentUri,
  pickOption,
  quoteAmount,
  savePending,
  secondsLeft,
  skuFor,
  skuKey,
} from "@/components/web3/crypto/checkout";
import { qrPath } from "@/components/web3/crypto/PaymentQr";
import type { Eip1193 } from "@/components/shelter-payouts/wallet";
import { create } from "qrcode";
import {
  APPROVE_TX,
  DATA,
  RECIPIENT,
  TX,
  USDC,
  config,
  eurcOption,
  memoOption,
  order,
  splitOption,
  transferOption,
} from "./crypto-pay-fixtures";

class MemoryStorage {
  data: Record<string, string> = {};
  getItem(k: string) {
    return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null;
  }
  setItem(k: string, v: string) {
    this.data[k] = v;
  }
  removeItem(k: string) {
    delete this.data[k];
  }
}
const storage = () => new MemoryStorage() as unknown as Storage;

describe("crypto checkout amounts", () => {
  it("formats base units without floats", () => {
    expect(formatUnits("5000137", 6)).toBe("5.000137");
    expect(formatUnits("5000000", 6)).toBe("5");
    expect(formatUnits("5000000", 6, 2)).toBe("5.00");
    expect(formatUnits("1", 6)).toBe("0.000001");
    expect(formatUnits(BigInt("1234567890123456789"), 18)).toBe("1.234567890123456789");
  });

  it("quotes USDC at the USD price and EURC at the server rate", () => {
    expect(quoteAmount(5, "USDC", config())).toBe("5.00");
    expect(quoteAmount(5, "EURC", config())).toBe("4.50");
    expect(quoteAmount(5, "EURC", null)).toBe("5.00");
  });

  it("rounds a quote up to the cent like the server, never down, and ignores float noise", () => {
    const at = (perUsd: string) => config({ fx: { EURC: { perUsd, asOf: "2026-10-01", source: "dated" } } });
    // 5 x 0.861 = 4.305: the server asks 4.305 EURC, so the quote is 4.31, not 4.30 or 4.31 by luck.
    expect(quoteAmount(5, "EURC", at("0.861"))).toBe("4.31");
    // 5 x 0.92 is 4.6000000000000005 in floats: still 4.60.
    expect(quoteAmount(5, "EURC", at("0.92"))).toBe("4.60");
    expect(quoteAmount(1, "EURC", at("0.333333"))).toBe("0.34");
  });

  it("explains how EURC is priced: a fixed euro price, or a dated rate", () => {
    expect(eurcNote(config({ fx: { EURC: { perUsd: "1", asOf: null, source: "fixed" } } }))).toMatch(/fixed euro price/);
    expect(eurcNote(config())).toBe("EURC at 0.9 EURC per US dollar (rate of 2026-10-04).");
    expect(eurcNote(null)).toBeNull();
  });
});

describe("crypto checkout choices", () => {
  it("groups the order's options by network, in the server's order", () => {
    const choices = networkChoices(order().accepted);
    expect(choices.map((c) => c.chainId)).toEqual([84532, 42431]);
    expect(choices[0].options.map((o) => o.token)).toEqual(["USDC", "EURC"]);
  });

  it("picks the option for a network and coin, or falls back", () => {
    const accepted = order().accepted;
    expect(pickOption(accepted, 84532, "EURC")?.token).toBe("EURC");
    expect(pickOption(accepted, 42431, "EURC")?.symbol).toBe("pathUSD");
    expect(pickOption(accepted, 1, "USDC")?.chainId).toBe(84532);
    expect(pickOption([], 1, "USDC")).toBeNull();
  });

  it("lists the coins of the config", () => {
    expect(configTokens(config())).toEqual(["USDC", "EURC"]);
    expect(configTokens(null)).toEqual([]);
  });

  it("maps Payment entities to SKUs", () => {
    expect(skuFor("PACK", "STARTER")).toEqual({ kind: "PACK", packType: "STARTER" });
    expect(skuFor("PACK", "MEGA")).toBeNull();
    expect(skuFor("CAT", "67b48fafd6c26c6cd40bfec6")).toEqual({ kind: "CAT", catId: "67b48fafd6c26c6cd40bfec6" });
    expect(skuFor("CAT", "nope")).toBeNull();
    expect(skuFor("LOOT_BOX", undefined)).toEqual({ kind: "LOOT_BOX" });
    expect(skuFor("IMAGE", "x")).toBeNull();
    expect(skuKey({ kind: "CAT", catId: "a" })).toBe("CAT:a");
  });
});

describe("paying without a browser wallet", () => {
  it("builds an EIP-681 link for plain transfers only", () => {
    expect(paymentUri(transferOption())).toBe(`ethereum:${USDC}@84532/transfer?address=${RECIPIENT}&uint256=5000137`);
    expect(paymentUri(memoOption())).toBeNull();
    expect(paymentUri(splitOption())).toBeNull();
  });

  it("draws the same QR modules as the qrcode library", () => {
    const uri = paymentUri(transferOption())!;
    const { size, d } = qrPath(uri);
    const { modules } = create(uri, { errorCorrectionLevel: "M" });
    expect(size).toBe(modules.size + 8);
    let dark = 0;
    for (let r = 0; r < modules.size; r++) for (let c = 0; c < modules.size; c++) if (modules.get(r, c)) dark++;
    expect(d.split("M").length - 1).toBe(dark);
    expect(d).toContain(`M4 4h1v1h-1z`); // the finder pattern's corner
  });

  it("knows a transaction hash", () => {
    expect(isTxHash(TX)).toBe(true);
    expect(isTxHash(` ${TX} `)).toBe(true);
    expect(isTxHash("0x1234")).toBe(false);
  });
});

describe("checking the server's steps", () => {
  it("accepts the backend's encodings", () => {
    expect(checkSteps(transferOption())).toBeNull();
    expect(checkSteps(eurcOption())).toBeNull();
    expect(checkSteps(memoOption())).toBeNull();
    expect(checkSteps(splitOption())).toBeNull();
  });

  it("refuses steps that pay another wallet, amount or contract", () => {
    expect(checkSteps(transferOption({ amount: "5000138" }))).toMatch(/another wallet or amount/);
    expect(checkSteps(transferOption({ recipient: "0x3333333333333333333333333333333333333333" }))).toMatch(/another wallet/);
    expect(checkSteps(transferOption({ tokenAddress: "0x3333333333333333333333333333333333333333" }))).toMatch(/another contract/);
    expect(checkSteps(transferOption({ steps: [{ kind: "transfer", to: USDC, data: DATA.transfer, value: "1" as "0" }] }))).toMatch(/native/);
    const split = splitOption();
    split.steps = [split.steps[1], split.steps[0]];
    expect(checkSteps(split)).toMatch(/approve, then disburse/);
    expect(checkSteps(transferOption({ steps: [] }))).toBe("no steps");
  });

  it("checks the split payment's disburse amount and memo, not only the approval", () => {
    expect(encodeDisburse("5000000", "tt:cat:9f2c4e1a7b3d5e60")).toBe(DATA.disburse);
    const otherMemo = splitOption();
    otherMemo.steps[1] = { ...otherMemo.steps[1], data: encodeDisburse("5000000", "tt:cat:0000000000000000")! };
    expect(checkSteps(otherMemo)).toMatch(/another amount or order/);
    const lessPaid = splitOption();
    lessPaid.steps[1] = { ...lessPaid.steps[1], data: encodeDisburse("1", "tt:cat:9f2c4e1a7b3d5e60")! };
    expect(checkSteps(lessPaid)).toMatch(/another amount or order/);
    expect(checkSteps({ ...splitOption(), memo: null })).toMatch(/another amount or order/);
  });
});

describe("error messages", () => {
  it("explains every server code", () => {
    expect(errorMessage(new CryptoPayApiError(409, "CRYPTO_PAY_ALREADY_OWNED"))).toMatch(/already have this cat/);
    expect(errorMessage(new CryptoPayApiError(400, "CRYPTO_PAY_NO_MATCHING_TRANSFER"))).toMatch(/exact amount/);
    expect(errorMessage(new CryptoPayApiError(401, null))).toMatch(/Sign in/);
    expect(errorMessage(new CryptoPayApiError(429, "CRYPTO_PAY_TOO_MANY_ORDERS"))).toMatch(/several open orders/);
    expect(errorMessage({ code: 4001 })).toBe("No worries, nothing was sent.");
    expect(errorMessage(new CheckoutError("Nope."))).toBe("Nope.");
    expect(errorMessage({ message: "boom" })).toBe("Wallet said: boom");
  });
});

describe("unfinished payments", () => {
  it("are saved per item and cleared once settled", () => {
    const s = storage();
    savePending({ orderId: "co_1", sku: "PACK:STARTER", chainId: 84532, txHash: TX, savedAt: Date.now() }, s);
    expect(loadPending("PACK:STARTER", Date.now(), s)?.orderId).toBe("co_1");
    expect(loadPending("CAT:x", Date.now(), s)).toBeNull();
    expect(loadPending("PACK:STARTER", Date.now() + 27 * 3600 * 1000, s)).toBeNull();
    clearPending("co_1", s);
    expect(s.getItem(PENDING_KEY)).toBeNull();
  });

  it("survive a corrupt store", () => {
    const s = storage();
    s.setItem(PENDING_KEY, "{not json");
    expect(loadPending("PACK:STARTER", Date.now(), s)).toBeNull();
  });
});

describe("timing", () => {
  it("counts down to the order's expiry", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(secondsLeft({ expiresAt: "2026-10-04T12:30:00Z" }, now)).toBe(1800);
    expect(secondsLeft({ expiresAt: "2026-10-04T11:00:00Z" }, now)).toBe(0);
    expect(mmss(1800)).toBe("30:00");
    expect(mmss(61)).toBe("1:01");
    expect(MIN_SECONDS_TO_PAY).toBe(120);
  });
});

// ---------------------------------------------------------------- wallet

const BUYER = "0x9999999999999999999999999999999999999999";

function fakeWallet({
  chainId = "0x14a34",
  balance = BigInt(10_000_000),
  reject = false,
  switchFails = false,
}: { chainId?: string; balance?: bigint; reject?: boolean; switchFails?: boolean } = {}) {
  let current = chainId;
  const sent: { to: string; data: string; chainId: string }[] = [];
  let receipts = 0;
  const eth: Eip1193 = {
    request: jest.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_requestAccounts") return [BUYER];
      if (method === "eth_chainId") return current;
      if (method === "wallet_switchEthereumChain") {
        if (!switchFails) current = (params![0] as { chainId: string }).chainId;
        return null;
      }
      if (method === "eth_call") return "0x" + balance.toString(16).padStart(64, "0");
      if (method === "eth_sendTransaction") {
        if (reject) throw Object.assign(new Error("User rejected"), { code: 4001 });
        const tx = params![0] as { to: string; data: string; chainId: string };
        sent.push(tx);
        return sent.length === 1 && tx.data.startsWith("0x095ea7b3") ? APPROVE_TX : TX;
      }
      if (method === "eth_getTransactionReceipt") {
        receipts++;
        return receipts > 1 ? { status: "0x1" } : null;
      }
      throw new Error(`unexpected ${method}`);
    }),
  };
  return { eth, sent };
}

describe("paying from a browser wallet", () => {
  const noSleep = () => Promise.resolve();

  it("switches the network and sends the exact transfer", async () => {
    const { eth, sent } = fakeWallet({ chainId: "0x1" });
    const stages: string[] = [];
    const res = await payWithWallet(eth, transferOption(), (s) => stages.push(s.kind));
    expect(res).toEqual({ txHash: TX, from: BUYER });
    expect(sent).toEqual([{ from: BUYER, to: USDC, data: DATA.transfer, value: "0x0", chainId: "0x14a34" }]);
    expect(stages).toEqual(["connecting", "checking", "signing"]);
  });

  it("waits for the approval before the split payment", async () => {
    const { eth, sent } = fakeWallet({ chainId: "0x4cef52" });
    const stages: string[] = [];
    const res = await payWithWallet(eth, splitOption(), (s) => stages.push(s.kind), { sleep: noSleep });
    expect(sent.map((t) => t.data)).toEqual([DATA.approve, DATA.disburse]);
    expect(res.txHash).toBe(TX);
    expect(stages).toEqual(["connecting", "checking", "signing", "waiting-step", "signing"]);
  });

  it("refuses before sending when the balance is short", async () => {
    const { eth, sent } = fakeWallet({ balance: BigInt(4_000_000) });
    await expect(payWithWallet(eth, transferOption())).rejects.toThrow(/holds 4 USDC on Base Sepolia; the order needs 5.000137/);
    expect(sent).toEqual([]);
  });

  it("never sends on another network", async () => {
    const { eth, sent } = fakeWallet({ chainId: "0x1", switchFails: true });
    await expect(payWithWallet(eth, transferOption())).rejects.toThrow(/still on another network/);
    expect(sent).toEqual([]);
  });

  it("refuses steps that do not match the order", async () => {
    const { eth, sent } = fakeWallet();
    await expect(payWithWallet(eth, transferOption({ amount: "1" }))).rejects.toThrow(/looks wrong/);
    expect(sent).toEqual([]);
  });

  it("passes a rejection through", async () => {
    const { eth } = fakeWallet({ reject: true });
    const err = await payWithWallet(eth, transferOption()).catch((e) => e);
    expect(errorMessage(err)).toBe("No worries, nothing was sent.");
  });
});

describe("confirming", () => {
  const sleep = () => Promise.resolve();

  it("polls through 202 until the server settles", async () => {
    const confirm = jest
      .fn()
      .mockResolvedValueOnce({ orderId: "co_1", status: "CONFIRMING", confirmations: 0, required: 2 })
      .mockResolvedValueOnce({ orderId: "co_1", status: "CONFIRMING", confirmations: 1, required: 2 })
      .mockResolvedValueOnce({ orderId: "co_1", status: "COMPLETE", success: true, message: "ok" });
    const progress: number[] = [];
    const res = await confirmUntilSettled({ orderId: "co_1", chainId: 84532, txHash: TX, confirm, sleep, onProgress: (p) => progress.push(p.confirmations) });
    expect(res.status).toBe("COMPLETE");
    expect(progress).toEqual([0, 1]);
    expect(confirm).toHaveBeenCalledWith("co_1", 84532, TX);
  });

  it("keeps polling while a paid order's item is still being added (PAID), never showing a refund", async () => {
    const confirm = jest
      .fn()
      .mockResolvedValueOnce({ orderId: "co_1", status: "PAID", success: false, replay: true })
      .mockResolvedValueOnce({ orderId: "co_1", status: "CONFIRMING", replay: true })
      .mockResolvedValueOnce({ orderId: "co_1", status: "COMPLETE", success: true, message: "ok" });
    const res = await confirmUntilSettled({ orderId: "co_1", chainId: 84532, txHash: TX, confirm, sleep });
    expect(res.status).toBe("COMPLETE");
    expect(confirm).toHaveBeenCalledTimes(3);
  });

  it("retries a network hiccup, not a refusal", async () => {
    const flaky = jest
      .fn()
      .mockRejectedValueOnce(new CryptoPayApiError(503, "CRYPTO_PAY_RPC_UNAVAILABLE"))
      .mockResolvedValueOnce({ orderId: "co_1", status: "FAILED_GRANT", success: false, refund: "due" });
    expect((await confirmUntilSettled({ orderId: "co_1", chainId: 1, txHash: TX, confirm: flaky, sleep })).status).toBe("FAILED_GRANT");

    const refused = jest.fn().mockRejectedValue(new CryptoPayApiError(410, "CRYPTO_PAY_EXPIRED"));
    await expect(confirmUntilSettled({ orderId: "co_1", chainId: 1, txHash: TX, confirm: refused, sleep })).rejects.toMatchObject({ code: "CRYPTO_PAY_EXPIRED" });
    expect(refused).toHaveBeenCalledTimes(1);

    const closed = jest.fn().mockRejectedValue(new CryptoPayApiError(503, "CRYPTO_PAY_DISABLED"));
    await expect(confirmUntilSettled({ orderId: "co_1", chainId: 1, txHash: TX, confirm: closed, sleep })).rejects.toMatchObject({ code: "CRYPTO_PAY_DISABLED" });
  });

  it("gives up after its deadline and keeps the payment for later", async () => {
    let t = 0;
    const confirm = jest.fn().mockResolvedValue({ orderId: "co_1", status: "CONFIRMING", confirmations: 0, required: 2 });
    await expect(
      confirmUntilSettled({ orderId: "co_1", chainId: 1, txHash: TX, confirm, sleep, now: () => (t += 60_000), timeoutMs: 120_000 })
    ).rejects.toThrow(/CHECK AGAIN/);
  });
});
