// copy-lint: web-only the crypto checkout renders only in WebPayment, which app builds replace with AppCheckoutNotice
/*
 * Crypto checkout logic (docs/API.md "Crypto checkout"), kept apart from the UI so it can be tested
 * without a browser. The wallet code is the donate rail's raw EIP-1193 code
 * (components/shelter-payouts/wallet.ts): no web3 dependency.
 *
 * The flow: the server prices an order and lists every accepted network and coin with ready-to-send
 * `steps`; the buyer's wallet sends them; the server checks the transaction on the chain and grants
 * the item exactly once. A buyer without a browser wallet pays by QR or by copying the address and
 * the exact amount, then pastes the transaction hash.
 */
import { CryptoPayApiError, CRYPTO_PAY_API } from "./api";
import {
  CryptoPayConfig,
  CryptoPayConfirmResult,
  CryptoPayErrorCode,
  CryptoPayOption,
  CryptoPayOrder,
  CryptoPaySku,
  CryptoPayToken,
} from "@/models/crypto-pay";
import { ChainInfo, SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import { encodeBalanceOfCall, toQuantity } from "@/components/shelter-payouts/calldata";
import { Eip1193, WrongNetworkError, connectWallet } from "@/components/shelter-payouts/wallet";

// ---------------------------------------------------------------- amounts

/** Base units ("5000137", 6) -> "5.000137"; trailing zeros dropped, at least `minFraction` digits. */
export function formatUnits(amount: string | bigint, decimals: number, minFraction = 0): string {
  const v = typeof amount === "bigint" ? amount : BigInt(amount);
  const neg = v < BigInt(0);
  const digits = (neg ? -v : v).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  let frac = decimals ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, "0");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * The price in a coin before an order exists (the order's `amount` is what counts): USDC is the USD
 * price, EURC uses the server's rate (a fixed euro price, or a dated rate). Rounded up to the cent like
 * the server, so the quote is never below what the order will ask.
 */
export function quoteAmount(priceUsd: number, token: CryptoPayToken, config: Pick<CryptoPayConfig, "fx"> | null): string {
  const perUsd = token === "EURC" ? Number(config?.fx?.EURC?.perUsd || "1") : 1;
  const v = priceUsd * (Number.isFinite(perUsd) && perUsd > 0 ? perUsd : 1);
  // Round away float noise (4.6000000000000005) before rounding up to the cent.
  const cents = Math.ceil(Math.round(v * 1e6) / 1e4);
  return (cents / 100).toFixed(2);
}

/** The EURC pricing line under the quote. */
export function eurcNote(config: Pick<CryptoPayConfig, "fx"> | null): string | null {
  const fx = config?.fx?.EURC;
  if (!fx) return null;
  if (fx.source === "fixed" || !fx.asOf) return "EURC is a fixed euro price: the same number of EURC as US dollars, not converted at a market rate.";
  return `EURC at ${fx.perUsd} EURC per US dollar (rate of ${fx.asOf}).`;
}

// ---------------------------------------------------------------- choices

export interface NetworkChoice {
  chainId: number;
  name: string;
  testnet: boolean;
  options: CryptoPayOption[];
}

/** The order's options grouped by network, in the server's order. */
export function networkChoices(accepted: CryptoPayOption[]): NetworkChoice[] {
  const out: NetworkChoice[] = [];
  accepted.forEach((option) => {
    let entry = out.find((c) => c.chainId === option.chainId);
    if (!entry) {
      entry = { chainId: option.chainId, name: option.chainName, testnet: !!option.testnet, options: [] };
      out.push(entry);
    }
    entry.options.push(option);
  });
  return out;
}

/** The option for a network and coin, falling back to the network's first coin, then the first option. */
export function pickOption(accepted: CryptoPayOption[], chainId: number | null, token: CryptoPayToken | null): CryptoPayOption | null {
  const onChain = accepted.filter((o) => o.chainId === chainId);
  return onChain.find((o) => o.token === token) || onChain[0] || accepted[0] || null;
}

/** The coins the checkout takes on any network right now. */
export function configTokens(config: CryptoPayConfig | null): CryptoPayToken[] {
  const seen: CryptoPayToken[] = [];
  (config?.chains || []).forEach((c) => c.tokens.forEach((t) => !seen.includes(t.token) && seen.push(t.token)));
  return seen;
}

/** The order's SKU for a Payment entity, or null when crypto does not sell it. */
export function skuFor(entityType: string, id: string | undefined): CryptoPaySku | null {
  if (entityType === "PACK" && (id === "STARTER" || id === "INFLUENCER" || id === "LEGENDARY")) {
    return { kind: "PACK", packType: id };
  }
  if (entityType === "CAT" && id && /^[0-9a-f]{24}$/i.test(id)) return { kind: "CAT", catId: id };
  if (entityType === "LOOT_BOX") return { kind: "LOOT_BOX" };
  return null;
}

export const skuKey = (sku: CryptoPaySku) =>
  sku.kind === "PACK" ? `PACK:${sku.packType}` : sku.kind === "CAT" ? `CAT:${sku.catId}` : "LOOT_BOX";

// ---------------------------------------------------------------- QR and manual payment

/**
 * The QR / deep-link form of a plain transfer (EIP-681): `ethereum:<coin>@<chainId>/transfer?...`.
 * Only `transfer` options can be paid this way; Tempo's memo transfer and the shelter split need a
 * browser wallet that sends the exact calldata.
 */
export function paymentUri(option: CryptoPayOption): string | null {
  if (option.route !== "transfer" || option.binding !== "amount") return null;
  return `ethereum:${option.tokenAddress}@${option.chainId}/transfer?address=${option.recipient}&uint256=${option.amount}`;
}

export const isTxHash = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value.trim());

// ---------------------------------------------------------------- steps check

const ERC20_TRANSFER = "0xa9059cbb";
const ERC20_APPROVE = "0x095ea7b3";
/** ShelterSplit `disburse(uint256 amount, string memo)`. */
const SPLIT_DISBURSE = "0xc950e7d9";
const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const uint = (v: string) => BigInt(v).toString(16).padStart(64, "0");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** ABI encoding of `disburse(amount, memo)` for an ASCII memo (every order memo is `tt:cat:<hex>`). */
export function encodeDisburse(amount: string, memo: string): string | null {
  if (!/^[\x20-\x7e]*$/.test(memo)) return null;
  const bytes = Array.from(memo, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return SPLIT_DISBURSE + uint(amount) + uint("64") + uint(String(memo.length)) + padded;
}

/**
 * Checks the server's ready-to-send steps against the option they belong to before a wallet sees
 * them: the right coin contract, the right recipient, the exact amount. Returns a reason or null.
 */
export function checkSteps(option: CryptoPayOption): string | null {
  const steps = option.steps || [];
  if (!steps.length) return "no steps";
  if (steps.some((s) => s.value !== "0" && s.value !== "0x0")) return "a step sends native coin";
  if (option.route === "transfer") {
    const [s] = steps;
    if (steps.length !== 1 || s.kind !== "transfer") return "a transfer is one step";
    if (!same(s.to, option.tokenAddress)) return "the transfer goes to another contract";
    const want = ERC20_TRANSFER + word(option.recipient) + uint(option.amount);
    if (s.data.toLowerCase() !== want) return "the transfer pays another wallet or amount";
    return null;
  }
  if (option.route === "transferWithMemo") {
    const [s] = steps;
    if (steps.length !== 1 || s.kind !== "transferWithMemo") return "a memo transfer is one step";
    if (!same(s.to, option.tokenAddress)) return "the transfer goes to another contract";
    // transferWithMemo(address,uint256,bytes32): recipient and amount are the first two words.
    const args = s.data.toLowerCase().slice(10);
    if (args.slice(0, 64) !== word(option.recipient) || args.slice(64, 128) !== uint(option.amount)) {
      return "the transfer pays another wallet or amount";
    }
    return null;
  }
  if (option.route === "split") {
    const [approve, disburse] = steps;
    if (steps.length !== 2 || approve.kind !== "approve" || disburse.kind !== "disburse") return "a split payment is approve, then disburse";
    if (!same(approve.to, option.tokenAddress) || !same(disburse.to, option.recipient)) return "the steps go to other contracts";
    if (approve.data.toLowerCase() !== ERC20_APPROVE + word(option.recipient) + uint(option.amount)) {
      return "the approval is for another contract or amount";
    }
    const want = option.memo ? encodeDisburse(option.amount, option.memo) : null;
    if (!want || disburse.data.toLowerCase() !== want) return "the payment is for another amount or order";
    return null;
  }
  return "unknown route";
}

// ---------------------------------------------------------------- messages

const MESSAGES: Partial<Record<CryptoPayErrorCode, string>> = {
  CRYPTO_PAY_DISABLED: "Crypto checkout is closed right now. Card payment still works.",
  CRYPTO_PAY_BAD_SKU: "This item can't be bought with crypto.",
  CRYPTO_PAY_NOT_FOR_SALE: "This cat is no longer looking for a home here.",
  CRYPTO_PAY_ALREADY_OWNED: "You already have this cat in your collection.",
  CRYPTO_PAY_BUSY: "The checkout is busy. Try again in a minute.",
  CRYPTO_PAY_NOT_FOUND: "This order was not found. Start a new one.",
  CRYPTO_PAY_WRONG_CHAIN: "That network is not part of this order.",
  CRYPTO_PAY_BAD_TX: "That does not look like a transaction hash (0x followed by 64 characters).",
  CRYPTO_PAY_TX_FAILED: "That transaction failed on the network, so nothing was paid.",
  CRYPTO_PAY_NO_MATCHING_TRANSFER:
    "That transaction does not send the exact amount of this order to its address. Check the network, the coin and the amount.",
  CRYPTO_PAY_UNDERPAID: "That payment is below the order amount.",
  CRYPTO_PAY_TX_BEFORE_ORDER: "That transaction is older than this order.",
  CRYPTO_PAY_TX_USED: "That transaction already paid another order.",
  CRYPTO_PAY_ALREADY_PAID: "This order is already paid.",
  CRYPTO_PAY_EXPIRED: "This order expired.",
  CRYPTO_PAY_RPC_UNAVAILABLE: "The network could not be read just now. Try again in a minute.",
  CRYPTO_PAY_TOO_MANY_ORDERS: "You have several open orders. Finish one or let it close, then try again.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof CryptoPayApiError) {
    if (err.code && MESSAGES[err.code]) return MESSAGES[err.code] as string;
    if (err.status === 401 || err.status === 403) return "Sign in again to finish this purchase.";
    if (err.status === 429) return "Too many tries. Wait a minute and try again.";
    return err.message || "Something went wrong. Try again.";
  }
  if (err instanceof CheckoutError || err instanceof WrongNetworkError) return err.message;
  const code = (err as { code?: number })?.code;
  if (code === 4001) return "No worries, nothing was sent.";
  if (code === -32002) return "Your wallet already has a request open. Open the wallet to answer it.";
  const m = (err as { message?: string })?.message;
  return m ? `Wallet said: ${m.slice(0, 160)}` : "The wallet could not send the payment.";
}

/** A refusal the page shows as it is. */
export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
    Object.setPrototypeOf(this, CheckoutError.prototype);
  }
}

// ---------------------------------------------------------------- unfinished payments

/**
 * A payment that was sent but not yet confirmed, kept per browser so a reload or a closed modal never
 * loses it: the next checkout of the same item offers to finish confirming it.
 */
export interface PendingPayment {
  orderId: string;
  sku: string;
  chainId: number;
  txHash: string;
  savedAt: number;
}

export const PENDING_KEY = "tt-crypto-pay:pending";

/** A pending payment stamped now. */
export const pendingPayment = (orderId: string, sku: string, chainId: number, txHash: string, now = Date.now()): PendingPayment => ({
  orderId,
  sku,
  chainId,
  txHash,
  savedAt: now,
});
/** A reserved amount lives until 24 hours after the order expires; older entries are dropped. */
export const PENDING_MAX_AGE_MS = 26 * 60 * 60 * 1000;

function readAll(storage: Storage | null): PendingPayment[] {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as PendingPayment[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.orderId === "string" && isTxHash(p.txHash || "")) : [];
  } catch {
    return [];
  }
}

const browserStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function loadPending(sku: string, now = Date.now(), storage = browserStorage()): PendingPayment | null {
  return readAll(storage).find((p) => p.sku === sku && now - p.savedAt < PENDING_MAX_AGE_MS) || null;
}

export function savePending(p: PendingPayment, storage = browserStorage()) {
  try {
    const rest = readAll(storage).filter((x) => x.orderId !== p.orderId && Date.now() - x.savedAt < PENDING_MAX_AGE_MS);
    storage?.setItem(PENDING_KEY, JSON.stringify([p, ...rest].slice(0, 10)));
  } catch {
    // Blocked storage: the payment can still be confirmed in this visit.
  }
}

export function clearPending(orderId: string, storage = browserStorage()) {
  try {
    const rest = readAll(storage).filter((x) => x.orderId !== orderId);
    if (rest.length) storage?.setItem(PENDING_KEY, JSON.stringify(rest));
    else storage?.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clean.
  }
}

// ---------------------------------------------------------------- wallet

/** What the wallet flow is doing, for the status line. */
export type WalletStage =
  | { kind: "connecting" }
  | { kind: "checking" }
  | { kind: "signing"; step: number; of: number; label: string }
  | { kind: "waiting-step"; step: number; of: number; txHash: string };

/**
 * Checkout networks the donate rail's list does not have yet, so a wallet can still add them (public
 * RPC, explorer, native gas coin). Monad testnet: chains.json and backend crypto-chains.ts.
 */
export const CHECKOUT_ONLY_CHAINS: Record<number, ChainInfo> = {
  10143: {
    name: "Monad Testnet",
    testnet: true,
    rpc: "https://testnet-rpc.monad.xyz",
    explorer: "https://testnet.monadvision.com",
    decimals: 6,
    symbol: "USDC",
    nativeDecimals: 18,
    nativeSymbol: "MON",
  },
};

/** ChainInfo for connectWallet: the donate rail's list where it knows the chain, else name and explorer only. */
export function chainInfoFor(option: Pick<CryptoPayOption, "chainId" | "chainName" | "explorer" | "symbol" | "decimals" | "testnet">): ChainInfo {
  const known = SHELTER_CHAINS[option.chainId] || CHECKOUT_ONLY_CHAINS[option.chainId];
  if (known) return known;
  return {
    name: option.chainName,
    rpc: option.chainId === 31337 ? "http://127.0.0.1:8545" : "",
    explorer: option.explorer || "",
    decimals: option.decimals,
    symbol: option.symbol,
    testnet: option.testnet,
  };
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitMined(
  eth: Eip1193,
  txHash: string,
  { sleep = sleepMs, timeoutMs = 180_000, intervalMs = 1500 }: { sleep?: (ms: number) => Promise<void>; timeoutMs?: number; intervalMs?: number } = {}
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] })) as { status?: string } | null;
    if (receipt) {
      if (receipt.status !== "0x1") throw new CheckoutError("The approval failed on the network, so nothing was paid.");
      return;
    }
    if (Date.now() > deadline) throw new CheckoutError("The approval is taking longer than usual. Check your wallet, then try again.");
    await sleep(intervalMs);
  }
}

/** Reads the coin balance of `from`; null when the network could not be read (the wallet then decides). */
export async function readBalance(eth: Eip1193, token: string, from: string): Promise<bigint | null> {
  try {
    const ret = await eth.request({ method: "eth_call", params: [{ to: token, data: encodeBalanceOfCall(from) }, "latest"] });
    return typeof ret === "string" && /^0x[0-9a-fA-F]+$/.test(ret) ? BigInt(ret.slice(0, 66)) : null;
  } catch {
    return null;
  }
}

export interface WalletPayResult {
  /** The transaction that pays the order (the last step). */
  txHash: string;
  from: string;
}

/**
 * Connects, switches to the option's network, checks the steps and the balance, then sends each step
 * from the buyer's wallet. With two steps (the shelter split: approve, then disburse) the approval is
 * mined before the second one is sent.
 */
export async function payWithWallet(
  eth: Eip1193,
  option: CryptoPayOption,
  onStage: (stage: WalletStage) => void = () => undefined,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<WalletPayResult> {
  const bad = checkSteps(option);
  if (bad) throw new CheckoutError(`This order looks wrong (${bad}), so nothing was sent. Start a new order.`);
  onStage({ kind: "connecting" });
  const from = await connectWallet(eth, option.chainId, chainInfoFor(option));
  onStage({ kind: "checking" });
  const balance = await readBalance(eth, option.tokenAddress, from);
  if (balance !== null && balance < BigInt(option.amount)) {
    throw new CheckoutError(
      `This wallet holds ${formatUnits(balance, option.decimals)} ${option.symbol} on ${option.chainName}; the order needs ${option.amountDisplay}. Nothing was sent.`
    );
  }
  const chainId = toQuantity(BigInt(option.chainId));
  let txHash = "";
  for (let i = 0; i < option.steps.length; i++) {
    const step = option.steps[i];
    const label = step.kind === "approve" ? "Approve the amount" : "Send the payment";
    onStage({ kind: "signing", step: i + 1, of: option.steps.length, label });
    const hash = await eth.request({
      method: "eth_sendTransaction",
      // chainId in the params: a wallet that ignored the switch refuses instead of paying on another network.
      params: [{ from, to: step.to, data: step.data, value: "0x0", chainId }],
    });
    if (typeof hash !== "string" || !isTxHash(hash)) throw new CheckoutError("The wallet did not return a transaction hash.");
    txHash = hash;
    if (i < option.steps.length - 1) {
      onStage({ kind: "waiting-step", step: i + 1, of: option.steps.length, txHash: hash });
      await waitMined(eth, hash, { sleep: opts.sleep });
    }
  }
  return { txHash, from };
}

// ---------------------------------------------------------------- confirming

export interface ConfirmProgress {
  confirmations: number;
  required: number;
}

/** Statuses that are not a final answer: keep asking (PAID means the item is still being added). */
const UNSETTLED = new Set(["CONFIRMING", "PAID", "OPEN", "EXPIRED"]);

/**
 * Asks the server to verify the payment until it settles: 202 (not mined yet, too few confirmations,
 * or the item still being added) and passing network trouble are retried; a refusal throws. Resolves
 * with the final body (`COMPLETE`, `FAILED_GRANT` or `LATE`).
 */
export async function confirmUntilSettled({
  orderId,
  chainId,
  txHash,
  onProgress = () => undefined,
  cancelled = () => false,
  sleep = sleepMs,
  intervalMs = 4000,
  timeoutMs = 20 * 60 * 1000,
  confirm = CRYPTO_PAY_API.confirm,
  now = Date.now,
}: {
  orderId: string;
  chainId: number;
  txHash: string;
  onProgress?: (p: ConfirmProgress) => void;
  cancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
  confirm?: typeof CRYPTO_PAY_API.confirm;
  now?: () => number;
}): Promise<CryptoPayConfirmResult> {
  const deadline = now() + timeoutMs;
  let flaky = 0;
  for (;;) {
    if (cancelled()) throw new CheckoutError("Stopped.");
    try {
      const res = await confirm(orderId, chainId, txHash);
      if (!UNSETTLED.has(res.status)) return res;
      flaky = 0;
      onProgress({ confirmations: Number(res.confirmations || 0), required: Number(res.required || 0) });
    } catch (err) {
      const retryable =
        err instanceof CryptoPayApiError &&
        (err.code === "CRYPTO_PAY_RPC_UNAVAILABLE" || err.status === 0 || err.status === 429 || (err.status >= 500 && err.code !== "CRYPTO_PAY_DISABLED"));
      if (!retryable || ++flaky > 8) throw err;
    }
    if (now() > deadline) {
      throw new CheckoutError("Confirming is taking longer than usual. Your payment is saved here; come back and tap CHECK AGAIN.");
    }
    await sleep(intervalMs * (flaky ? Math.min(4, flaky) : 1));
  }
}

/**
 * A wallet payment is not started with less than this left: the transaction may not be mined before
 * the order closes. The buyer starts a new order instead.
 */
export const MIN_SECONDS_TO_PAY = 120;

/** Seconds left on an order, never below zero. */
export const secondsLeft = (order: Pick<CryptoPayOrder, "expiresAt">, nowMs = Date.now()) =>
  Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - nowMs) / 1000));

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const explorerTxUrl = (explorer: string, txHash: string) => (explorer ? `${explorer.replace(/\/+$/, "")}/tx/${txHash}` : "");

export const shortHex = (hex: string, head = 6, tail = 4) => (hex.length > head + tail + 1 ? `${hex.slice(0, head)}…${hex.slice(-tail)}` : hex);
