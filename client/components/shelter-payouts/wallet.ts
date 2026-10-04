// copy-lint: web-only used only by WalletDonate and the onboarding page, which app builds never render
import { ChainInfo, SHELTER_CHAINS } from "./chains";
import {
  DECIMALS_SELECTOR,
  DOMAIN_SEPARATOR_SELECTOR,
  NAME_SELECTOR,
  RouterAuthorization,
  VERSION_SELECTOR,
  decodeAbiString,
  decodeBytes32,
  decodeAddress,
  decodeCanDonate,
  decodePreview,
  encodePreviewCall,
  SPLIT_SELECTOR,
  authNonce,
  eip712DomainSeparator,
  encodeAuthorizationStateCall,
  encodeCanDonateCall,
  encodeRecipientsHashCall,
  encodeDonateNativeCalldata,
  encodeDonateWithAuthorizationCalldata,
  parseUnits,
  receiveWithAuthorizationTypedData,
  recipientsHashOf,
  toQuantity,
  TOKEN_SELECTOR,
  PAUSED_SELECTOR,
  decodeBool,
  decodeUint,
  encodeAllowanceCall,
  encodeApproveCalldata,
  encodeBalanceOfCall,
  encodeDisburseCalldata,
  encodeDisburseWithMemoCalldata,
  encodeDonateCalldata,
  memoToBytes32,
} from "./calldata";
import { RelayBody, RelayResult, SELF_SUBMIT_CODES, postRelay } from "./relayApi";
import { ROUTER_DONATION_TOPIC } from "./receipt";

// Raw EIP-1193 flows for giving from your own wallet. No web3 dependency.
// - signAndGive: one EIP-712 signature (EIP-3009 ReceiveWithAuthorization to the DonateRouter), which
//   the Token Tails relay submits and pays the gas for. The USDC goes donor -> router -> ShelterSplit
//   -> shelter in that one transaction.
// - giveNative: router.donateNative(memo), only where the native coin is USDC (Arc).
// - giveToSplit / giveNativeToSplit (multi-chain, decision "B"): chains with no router, or whose token
//   has no EIP-3009, give straight into ShelterSplit (approve + disburse, disburseWithMemo on Tempo, or
//   donate(memo) with Arc's native USDC). There is no router guard there, so assertSplitTakes does its
//   job before the wallet opens: no part of a gift may reach the treasury.

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export function getInjectedProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

/** The nativeCurrency name a wallet shows for Tempo, which has no native coin. */
export const NO_NATIVE_COIN_NAME = "No native coin (fees in USD stablecoins)";

export function addChainParams(chainId: number, chain: ChainInfo) {
  // A chain with no native coin (Tempo: fees are paid in a USD stablecoin) is added as "USD", the
  // symbol Tempo documents; wallets require 18 decimals here, and its eth_getBalance is a placeholder.
  // The name says so, so the wallet's own screen does not suggest a coin to buy.
  const symbol = chain.nativeSymbol || (chain.balanceToken ? "USD" : "ETH");
  return {
    chainId: toQuantity(BigInt(chainId)),
    chainName: chain.name,
    nativeCurrency: {
      name: !chain.nativeSymbol && chain.balanceToken ? NO_NATIVE_COIN_NAME : symbol,
      symbol,
      decimals: chain.nativeDecimals ?? 18,
    },
    rpcUrls: [chain.rpc],
    blockExplorerUrls: [chain.explorer],
  };
}

/**
 * True where the chain's native coin is USDC (Arc). Elsewhere the native coin is ETH, AVAX or MON,
 * and a native gift would send that coin, not USDC, so the native path is never offered there.
 */
export const isUsdcNative = (chain: Pick<ChainInfo, "nativeSymbol">) => chain.nativeSymbol === "USDC";

const code = (err: unknown) => (err as { code?: number })?.code;

/** Asks for the account and switches to (or adds) the chain. Returns the account. */
export async function connectWallet(eth: Eip1193, chainId: number, chain: ChainInfo): Promise<string> {
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error("No wallet account was shared.");

  const want = toQuantity(BigInt(chainId));
  const current = String(await eth.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== want) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
    } catch (err) {
      // 4902: the wallet does not know this chain yet. Adding it also switches to it.
      if (code(err) !== 4902) throw err;
      await eth.request({ method: "wallet_addEthereumChain", params: [addChainParams(chainId, chain)] });
    }
    // Some wallets (WalletConnect bridges, a few mobile ones) resolve the switch without switching:
    // never send or sign on whatever network happens to be active.
    const after = String(await eth.request({ method: "eth_chainId" })).toLowerCase();
    if (after !== want) throw new WrongNetworkError(chain.name);
  }
  return from;
}

/** The wallet stayed on another network after the switch request. Nothing was signed or sent. */
export class WrongNetworkError extends Error {
  constructor(chainName: string) {
    super(`Your wallet is still on another network. Switch it to ${chainName} and try again. Nothing was sent.`);
    this.name = "WrongNetworkError";
    Object.setPrototypeOf(this, WrongNetworkError.prototype);
  }
}

/** Contract code at `address` on the wallet's network ("0x" when there is none). */
export async function getCode(eth: Eip1193, address: string): Promise<string> {
  const c = await eth.request({ method: "eth_getCode", params: [address, "latest"] });
  return typeof c === "string" ? c.toLowerCase() : "0x";
}

/** The router must exist on the wallet's network: a gift is never signed for an empty address. */
export async function assertContract(eth: Eip1193, address: string, chainName: string): Promise<void> {
  let c = "0x";
  try {
    c = await getCode(eth, address);
  } catch {
    throw new GiftError("Could not reach the network to check the gift. Nothing was sent; try again in a minute.");
  }
  if (c === "0x" || c === "0x0" || /^0x0*$/.test(c)) {
    // claim: fiction a refusal message about this gift, not an impact figure
    throw new GiftError(`The donation contract is not on ${chainName} in your wallet's network. Nothing was sent.`);
  }
}

export function walletErrorMessage(err: unknown): string {
  if (code(err) === 4001) return "No worries, nothing was sent.";
  if (err instanceof GiftError || err instanceof WrongNetworkError) return err.message;
  const m = (err as { message?: string })?.message;
  return m ? `Wallet said: ${m}` : "The wallet could not complete the transfer.";
}

// ---------------------------------------------------------------- DonateRouter gifts

/** A refusal the page can show as it is (no "Wallet said:" prefix). */
export class GiftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiftError";
    Object.setPrototypeOf(this, GiftError.prototype);
  }
}

/**
 * The relay refused a signed gift in a way the donor can work around (relay off, other network,
 * daily budget spent): the page offers to send the same signed gift from the donor's own wallet.
 */
export class RelayRefusedError extends GiftError {
  constructor(message: string, public code: string | null, public signed: SignedGift) {
    super(message);
    this.name = "RelayRefusedError";
    Object.setPrototypeOf(this, RelayRefusedError.prototype);
  }
}

/**
 * The donor's account has contract code: a smart account, or an EOA delegated with EIP-7702 (code
 * 0xef0100…). USDC checks such a signer with ERC-1271, so a one-signature gift would fail at the relay.
 * On Arc the page offers the one-transaction native gift instead.
 */
export class SmartAccountError extends GiftError {
  constructor() {
    super("Smart-account wallets can't sign this gift yet. Nothing was signed.");
    this.name = "SmartAccountError";
    Object.setPrototypeOf(this, SmartAccountError.prototype);
  }
}

/** The transaction was mined and reverted (status 0x0). */
export class RevertedError extends GiftError {
  constructor(public txHash: string) {
    super("The network refused the gift, so the amount stayed in your wallet.");
    this.name = "RevertedError";
    Object.setPrototypeOf(this, RevertedError.prototype);
  }
}

/**
 * The payout list would pay a wallet Token Tails holds, or one the shelter never claimed. Real-money
 * gifts are refused before the wallet opens: a public gift must only land in a shelter-held wallet.
 */
export class CustodyError extends GiftError {
  constructor() {
    // claim: fiction a refusal message about this gift, not an impact figure
    super("Gifts from your wallet are closed: the payout list does not point to a wallet the shelter holds. Nothing was sent.");
    this.name = "CustodyError";
    Object.setPrototypeOf(this, CustodyError.prototype);
  }
}

export interface SignedGift {
  chainId: number;
  router: string;
  auth: RouterAuthorization & { from: string };
  signature: string;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) throw new Error("This browser has no secure random source.");
  c.getRandomValues(out);
  return out;
}

/** Memo of a wallet gift: `tt:wallet:<8 lowercase hex>`, random, never personal data. */
export const walletMemo = (rand: Uint8Array = randomBytes(4)) => `tt:wallet:${hex(rand.slice(0, 4))}`;
export const WALLET_MEMO_RE = /^tt:wallet:[0-9a-f]{8}$/;

/** 32 fresh random bytes; with the memo they make the EIP-3009 nonce unique per gift. */
export const randomSalt = (rand: Uint8Array = randomBytes(32)) => "0x" + hex(rand.slice(0, 32));

/** How long a signed gift stays valid: the relay accepts 30 s to 10 min. */
export const AUTH_VALIDITY_S = 300;

async function call(eth: Eip1193, to: string, data: string): Promise<string> {
  const ret = await eth.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  if (typeof ret !== "string") throw new Error("eth_call returned no data");
  return ret;
}

/**
 * The USDC EIP-712 domain fields, read on-chain: name() and version(). A token without version()
 * (USDG on Robinhood Chain signs with "1") gets the version whose separator matches its
 * DOMAIN_SEPARATOR(); if none matches, the gift is refused before the wallet is asked to sign.
 */
export async function readUsdcDomain(eth: Eip1193, usdc: string, chainId?: number): Promise<{ name: string; version: string }> {
  const name = decodeAbiString(await call(eth, usdc, NAME_SELECTOR));
  try {
    return { name, version: decodeAbiString(await call(eth, usdc, VERSION_SELECTOR)) };
  } catch {
    // No version(): recover it from DOMAIN_SEPARATOR() below.
  }
  let separator: string | null = null;
  try {
    separator = decodeBytes32(await call(eth, usdc, DOMAIN_SEPARATOR_SELECTOR));
  } catch {
    separator = null;
  }
  if (separator && chainId) {
    for (const version of ["2", "1"]) {
      if (eip712DomainSeparator({ name, version, chainId, verifyingContract: usdc }) === separator) return { name, version };
    }
  }
  throw new GiftError("Could not read how this stablecoin expects gifts to be signed, so nothing was signed.");
}

const ZERO_BYTES32 = "0x" + "0".repeat(64);

/**
 * Gasless gifts need EIP-3009 (receiveWithAuthorization). Tempo's TIP-20 tokens and test tokens such
 * as Robinhood testnet's mUSDC lack it: refuse before the wallet is asked to sign anything.
 */
export async function assertEip3009(eth: Eip1193, token: string, from: string): Promise<void> {
  let ok = false;
  try {
    ok = /^0x[0-9a-fA-F]{64}/.test(await call(eth, token, encodeAuthorizationStateCall(from, ZERO_BYTES32)));
  } catch {
    ok = false;
  }
  if (!ok) throw new GiftError("The stablecoin on this network cannot take a one-signature gift yet, so nothing was signed.");
}

/**
 * Runs the transaction as an eth_call before the wallet opens, so a gift that would revert (a changed
 * payout list, a signature the token rejects) never costs the donor a network fee. Only a revert
 * blocks the gift; a flaky RPC does not (the wallet estimates the fee itself).
 */
export async function preflight(eth: Eip1193, tx: { from: string; to: string; data: string; value?: string }): Promise<void> {
  try {
    await eth.request({ method: "eth_call", params: [tx, "latest"] });
  } catch (err) {
    const m = String((err as { message?: string })?.message || "");
    if (code(err) === 3 || /revert/i.test(m)) {
      const reason = m.replace(/^.*?execution reverted:?\s*/i, "").slice(0, 120);
      throw new GiftError(`The network would refuse this gift${reason ? ` (${reason})` : ""}. Nothing was sent.`);
    }
  }
}

export async function readDecimals(eth: Eip1193, token: string): Promise<number> {
  const n = Number(BigInt(await call(eth, token, DECIMALS_SELECTOR)));
  if (!Number.isInteger(n) || n < 0 || n > 36) throw new Error("the token reported odd decimals");
  return n;
}

/**
 * The router's guard, asked before the wallet opens: a gift goes through only when no part of it
 * would reach the ShelterSplit treasury and the split is not paused.
 */
export async function assertCanDonate(eth: Eip1193, router: string, amount: bigint): Promise<void> {
  let res: { ok: boolean; toTreasury: bigint };
  try {
    res = decodeCanDonate(await call(eth, router, encodeCanDonateCall(amount)));
  } catch {
    throw new GiftError("Could not check the gift with the router. Nothing was sent; try again in a minute.");
  }
  if (res.toTreasury > BigInt(0)) {
    // claim: fiction a refusal message about this gift, not an impact figure
    throw new GiftError(
      "The router refused this gift: part of it would not reach the shelter right now. Nothing was sent."
    );
  }
  if (!res.ok) throw new GiftError("Gifts are paused on the contract right now. Nothing was sent.");
}

/** The payout list a gift of `amount` would pay right now (router.recipientsHash), signed by the donor. */
export async function readRecipientsHash(eth: Eip1193, router: string, amount: bigint): Promise<string> {
  try {
    return decodeBytes32(await call(eth, router, encodeRecipientsHashCall(amount)));
  } catch {
    throw new GiftError("Could not read the payout list from the router. Your wallet was not charged; try again in a minute.");
  }
}

/** One preview read: every wallet and amount, and the recipientsHash of exactly that list. */
export async function readPayoutPreview(
  eth: Eip1193,
  router: string,
  amount: bigint
): Promise<{ wallets: string[]; amounts: bigint[]; recipients: string }> {
  const split = decodeAddress(await call(eth, router, SPLIT_SELECTOR));
  const { wallets, amounts } = decodePreview(await call(eth, split, encodePreviewCall(amount)));
  return { wallets, amounts, recipients: recipientsHashOf(wallets, amounts) };
}

/** The wallets a gift of `amount` would pay now (router.split().preview(amount), amount > 0), lowercase. */
export async function readPayoutWallets(eth: Eip1193, router: string, amount: bigint): Promise<string[]> {
  const { wallets, amounts } = await readPayoutPreview(eth, router, amount);
  return wallets.filter((_, i) => amounts[i] > BigInt(0)).map((w) => w.toLowerCase());
}

/**
 * Who may receive a real-money gift: `shelterWallets` are the wallets the shelter claimed and Token
 * Tails registered on-chain (GET /shelter/claim, status "rotated"); `heldWallets` are wallets Token
 * Tails holds (Pink Paw's before the handover). Read from the chain, not from a JSON flag.
 */
export interface CustodyGuard {
  shelterWallets: string[];
  heldWallets: string[];
}

/** Real money needs a guard; only a built-in testnet (test USDC) goes without one. */
export const needsCustodyGuard = (chainId: number) => !SHELTER_CHAINS[chainId]?.testnet;

/**
 * Refuses unless every wallet the gift would pay is a shelter-claimed wallet and none is held by Token
 * Tails. Several shelters are fine only when each of them claimed its own wallet.
 */
export async function assertShelterHeld(
  eth: Eip1193,
  router: string,
  amount: bigint,
  guard: CustodyGuard | null
): Promise<{ wallets: string[]; recipients: string }> {
  if (!guard) throw new CustodyError();
  let preview: { wallets: string[]; amounts: bigint[]; recipients: string };
  try {
    preview = await readPayoutPreview(eth, router, amount);
  } catch {
    throw new GiftError("Could not read who this gift would pay. Nothing was sent; try again in a minute.");
  }
  const wallets = preview.wallets.filter((_, i) => preview.amounts[i] > BigInt(0)).map((w) => w.toLowerCase());
  const held = new Set(guard.heldWallets.map((w) => w.toLowerCase()));
  const claimed = new Set(guard.shelterWallets.map((w) => w.toLowerCase()));
  if (wallets.length === 0 || wallets.some((w) => held.has(w) || !claimed.has(w))) throw new CustodyError();
  return { wallets, recipients: preview.recipients };
}

/**
 * The payout list the donor signs (router.recipientsHash). With a custody guard it must be the very list
 * that passed the guard: if the router's hash differs from the hash of the guarded preview (the list
 * changed between the two reads, or the router reads another split), the gift is refused.
 */
async function signedRecipients(eth: Eip1193, router: string, value: bigint, chainId: number, custody: CustodyGuard | null | undefined) {
  const guarded = needsCustodyGuard(chainId) ? await assertShelterHeld(eth, router, value, custody ?? null) : null;
  await assertCanDonate(eth, router, value);
  const recipients = await readRecipientsHash(eth, router, value);
  if (guarded && guarded.recipients.toLowerCase() !== recipients.toLowerCase()) throw new CustodyError();
  return recipients;
}

/**
 * A plain account only: a signer with code (a smart account, or an EIP-7702 delegated EOA, 0xef0100…)
 * is checked by USDC through ERC-1271, so its one-signature gift would fail.
 */
export async function assertPlainAccount(eth: Eip1193, from: string): Promise<void> {
  let c = "0x";
  try {
    c = await getCode(eth, from);
  } catch {
    return; // An RPC hiccup is not a smart account; the relay's simulation still catches a bad signature.
  }
  if (c !== "0x" && !/^0x0*$/.test(c)) throw new SmartAccountError();
}

export interface GiveOptions {
  provider: Eip1193;
  chainId: number;
  chain: ChainInfo;
  router: string;
  usdc: string;
  /** Human amount in USDC, e.g. "5". */
  amount: string;
  /** Required on every chain that is not a built-in testnet (see assertShelterHeld). */
  custody?: CustodyGuard | null;
  relay?: (body: RelayBody) => Promise<RelayResult>;
  now?: () => number;
  rand?: (n: number) => Uint8Array;
}

export interface GiveResult {
  txHash: string;
  from: string;
  memo: string;
  /** True when Token Tails' relay paid the gas, false when the donor's wallet sent it. */
  relayed: boolean;
}

/**
 * Gasless gift: connect, switch chain, check the guard, sign one ReceiveWithAuthorization for the
 * router, and hand it to the relay. Resolves with the relay's tx hash. A relay refusal the donor can
 * work around throws RelayRefusedError carrying the signed gift (see selfSubmitGift).
 */
export async function signAndGive(opts: GiveOptions): Promise<GiveResult> {
  const { provider: eth, chainId, chain, router, usdc } = opts;
  const rand = opts.rand || randomBytes;
  const from = await connectWallet(eth, chainId, chain);
  await assertContract(eth, router, chain.name);
  await assertPlainAccount(eth, from);
  await assertEip3009(eth, usdc, from);
  const decimals = await readDecimals(eth, usdc);
  const value = parseUnits(opts.amount, decimals);
  if (value <= BigInt(0)) throw new GiftError("Pick an amount above zero.");
  const recipients = await signedRecipients(eth, router, value, chainId, opts.custody);
  const domain = await readUsdcDomain(eth, usdc, chainId);

  const nowS = Math.floor((opts.now ? opts.now() : Date.now()) / 1000);
  const auth = {
    from,
    value: value.toString(),
    validAfter: "0",
    validBefore: String(nowS + AUTH_VALIDITY_S),
    salt: randomSalt(rand(32)),
    memo: walletMemo(rand(4)),
    recipients,
  };
  const typed = receiveWithAuthorizationTypedData({ ...domain, chainId, verifyingContract: usdc }, router, auth);
  const signature = await eth.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typed)] });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error("The wallet did not return a signature.");
  }

  const relay = opts.relay || ((b: RelayBody) => postRelay(b));
  const res = await relay({ chainId, ...auth, signature });
  if (res.ok) return { txHash: res.txHash, from, memo: auth.memo, relayed: true };
  const signed: SignedGift = { chainId, router, auth, signature };
  if (res.code === null || SELF_SUBMIT_CODES.has(res.code)) throw new RelayRefusedError(res.message, res.code, signed);
  throw new GiftError(res.message);
}

/**
 * Sends a signed gift from the donor's own wallet (the donor pays the network fee). Same calldata the
 * relay would send; the router only lets the signed amount go to the shelters.
 */
export async function selfSubmitGift(eth: Eip1193, chain: ChainInfo, signed: SignedGift): Promise<GiveResult> {
  const from = await connectWallet(eth, signed.chainId, chain);
  const tx = { from, to: signed.router, data: encodeDonateWithAuthorizationCalldata(signed.auth, signed.signature) };
  await preflight(eth, tx);
  const hash = await eth.request({
    method: "eth_sendTransaction",
    params: [{ ...tx, chainId: toQuantity(BigInt(signed.chainId)) }],
  });
  if (typeof hash !== "string") throw new Error("The wallet did not return a transaction hash.");
  return { txHash: hash, from, memo: signed.auth.memo, relayed: false };
}

/**
 * Arc only: router.donateNative(memo, recipients) with the amount as the native value (USDC, 18
 * decimals). One transaction from the donor's wallet; it reverts if the shelter list changed after the
 * page read it. Refuses on every chain whose native coin is not USDC.
 */
export async function giveNative(opts: Omit<GiveOptions, "usdc" | "relay" | "now">): Promise<GiveResult> {
  const { provider: eth, chainId, chain, router } = opts;
  if (!isUsdcNative(chain)) throw new GiftError(`Native gifts are USDC-only; ${chain.name} is not.`);
  const from = await connectWallet(eth, chainId, chain);
  await assertContract(eth, router, chain.name);
  const value = parseUnits(opts.amount, chain.nativeDecimals ?? 18);
  if (value <= BigInt(0)) throw new GiftError("Pick an amount above zero.");
  const recipients = await signedRecipients(eth, router, value, chainId, opts.custody);
  const memo = walletMemo((opts.rand || randomBytes)(4));
  const tx = { from, to: router, value: toQuantity(value), data: encodeDonateNativeCalldata(memo, recipients) };
  await preflight(eth, tx);
  // chainId in the params: a wallet that ignored the switch refuses instead of sending on another chain.
  const hash = await eth.request({ method: "eth_sendTransaction", params: [{ ...tx, chainId: toQuantity(BigInt(chainId)) }] });
  if (typeof hash !== "string") throw new Error("The wallet did not return a transaction hash.");
  return { txHash: hash, from, memo, relayed: false };
}

export interface TxReceipt {
  status?: string;
  blockNumber?: string;
  logs?: unknown[];
}

/**
 * Polls eth_getTransactionReceipt until the tx is mined (ported from shelter-rail/src/sdk.mjs).
 * Throws when the tx reverted or the wait runs out.
 */
export async function waitForReceipt(
  eth: Eip1193,
  txHash: string,
  { intervalMs = 1500, timeoutMs = 120_000, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {}
): Promise<TxReceipt> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] })) as TxReceipt | null;
    if (receipt) {
      if (receipt.status !== "0x1") throw new RevertedError(txHash);
      return receipt;
    }
    if (Date.now() > deadline) throw new GiftError("The gift is taking longer than usual. Check the receipt link in a minute.");
    await sleep(intervalMs);
  }
}

/** A signed gift's EIP-3009 nonce (the RouterDonation log's third indexed topic). */
export const signedGiftNonce = (signed: SignedGift) =>
  authNonce(signed.router, signed.auth.salt, signed.auth.memo, signed.auth.recipients);

/** How far back the settle lookup reads RouterDonation logs (a signed gift lives 5 minutes). */
export const SETTLE_LOOKBACK_BLOCKS = 5_000;

type RpcFn = <T>(method: string, params: unknown[]) => Promise<T>;

/**
 * Whether a signed gift was paid by some transaction, read from the chain: the router's RouterDonation
 * log carries the signed nonce. Someone who saw the signature may have submitted it first (the relay's
 * own transaction then reverts), or the relay may have broadcast it before the page lost the answer.
 * Returns that transaction's hash, or null when no such log exists. Throws when the chain cannot be read.
 */
export async function findSettledGift(rpc: RpcFn, signed: SignedGift): Promise<string | null> {
  const head = Number(BigInt(await rpc<string>("eth_blockNumber", [])));
  const fromBlock = "0x" + Math.max(0, head - SETTLE_LOOKBACK_BLOCKS).toString(16);
  const logs = await rpc<{ transactionHash?: string; topics?: string[] }[]>("eth_getLogs", [
    { address: signed.router, fromBlock, toBlock: "latest", topics: [ROUTER_DONATION_TOPIC, null, null, signedGiftNonce(signed)] },
  ]);
  const hit = (logs || []).find((l) => l.topics?.[3]?.toLowerCase() === signedGiftNonce(signed).toLowerCase() && l.transactionHash);
  return hit?.transactionHash || null;
}

/** Seconds of slack before validBefore: a self-submit this close to expiry would likely revert. */
export const SELF_SUBMIT_MARGIN_S = 15;
export const signedGiftExpired = (signed: SignedGift, nowMs: number = Date.now()) =>
  Math.floor(nowMs / 1000) > Number(signed.auth.validBefore) - SELF_SUBMIT_MARGIN_S;

// ---------------------------------------------------------------- direct ShelterSplit gifts
// The split path (giveRails "split"): chains without a router, or whose token has no EIP-3009. The
// split has no router guard, so the page does the guard's job before the wallet opens: the split is not
// paused, it pays at least one wallet, and no part of the gift would reach the treasury
// (preview(amount).toTreasury == 0); on a real-money chain every wallet it pays must be a wallet the
// shelter claimed (CustodyGuard). The giver then approves the split for exactly this amount and calls
// disburse(amount, memo), or disburseWithMemo(amount, bytes32 memo) on Tempo.

/** The split's payout list for `amount`: wallets, amounts and what would reach the treasury. */
export async function readSplitPreview(
  eth: Eip1193,
  split: string,
  amount: bigint
): Promise<{ wallets: string[]; amounts: bigint[]; toTreasury: bigint }> {
  return decodePreview(await call(eth, split, encodePreviewCall(amount)));
}

/** The wallets a gift of `amount` straight into the split would pay now (amount > 0), lowercase. */
export async function readSplitPayoutWallets(eth: Eip1193, split: string, amount: bigint): Promise<string[]> {
  const { wallets, amounts } = await readSplitPreview(eth, split, amount);
  return wallets.filter((_, i) => amounts[i] > BigInt(0)).map((w) => w.toLowerCase());
}

/**
 * The router guard's checks, run by the page for a gift straight into the split. Refuses a paused
 * split, a split that pays nobody, any part of the gift reaching the treasury, and (real money only)
 * any wallet the shelter did not claim or Token Tails holds.
 */
export async function assertSplitTakes(
  eth: Eip1193,
  split: string,
  amount: bigint,
  chainId: number,
  guard: CustodyGuard | null | undefined
): Promise<string[]> {
  let preview: { wallets: string[]; amounts: bigint[]; toTreasury: bigint };
  let paused = false;
  try {
    preview = await readSplitPreview(eth, split, amount);
    paused = decodeBool(await call(eth, split, PAUSED_SELECTOR));
  } catch {
    throw new GiftError("Could not read who this gift would pay. Nothing was sent; try again in a minute.");
  }
  if (paused) throw new GiftError("Gifts are paused on the contract right now. Nothing was sent.");
  const wallets = preview.wallets.filter((_, i) => preview.amounts[i] > BigInt(0)).map((w) => w.toLowerCase());
  if (preview.toTreasury > BigInt(0) || wallets.length === 0) {
    // claim: fiction a refusal message about this gift, not an impact figure
    throw new GiftError("The contract refused this gift: part of it would not reach the shelter right now. Nothing was sent.");
  }
  if (needsCustodyGuard(chainId)) {
    if (!guard) throw new CustodyError();
    const held = new Set(guard.heldWallets.map((w) => w.toLowerCase()));
    const claimed = new Set(guard.shelterWallets.map((w) => w.toLowerCase()));
    if (wallets.some((w) => held.has(w) || !claimed.has(w))) throw new CustodyError();
  }
  return wallets;
}

/** Sends one transaction from the giver's wallet, pinned to the chain id. Returns its hash. */
async function sendTx(eth: Eip1193, chainId: number, tx: { from: string; to: string; data: string; value?: string }): Promise<string> {
  const hash = await eth.request({ method: "eth_sendTransaction", params: [{ ...tx, chainId: toQuantity(BigInt(chainId)) }] });
  if (typeof hash !== "string") throw new Error("The wallet did not return a transaction hash.");
  return hash;
}

/** "1.5" from 1500000 with 6 decimals; for messages only. */
function formatAmount(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export type SplitStep = "check" | "approve" | "give";

export interface SplitGiveOptions {
  provider: Eip1193;
  chainId: number;
  chain: ChainInfo;
  /** The ShelterSplit address. */
  split: string;
  /** Human amount, e.g. "0.5". */
  amount: string;
  /** The coin's symbol, for messages. */
  symbol: string;
  /** Tempo: disburseWithMemo with the memo as bytes32. */
  memo32?: boolean;
  custody?: CustodyGuard | null;
  rand?: (n: number) => Uint8Array;
  /** Called as the gift moves: reading the chain, waiting for the approval, sending the gift. */
  onStep?: (step: SplitStep) => void;
  /** How long to wait for the approval to be mined before giving up (ms). */
  approveTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Reads after an approval until the allowance shows: load-balanced RPCs can lag a block behind. */
export const ALLOWANCE_POLLS = 8;
export const ALLOWANCE_POLL_MS = 1500;

/**
 * Approve + disburse: connect, check the split (guard above), check the balance, approve the split for
 * exactly this amount when the allowance is short (and wait for it), then call disburse straight on
 * ShelterSplit. The giver's wallet pays both network fees.
 */
export async function giveToSplit(opts: SplitGiveOptions): Promise<GiveResult> {
  const { provider: eth, chainId, chain, split } = opts;
  const step = opts.onStep || (() => undefined);
  step("check");
  const from = await connectWallet(eth, chainId, chain);
  await assertContract(eth, split, chain.name);
  let token: string;
  let decimals: number;
  try {
    token = decodeAddress(await call(eth, split, TOKEN_SELECTOR));
    decimals = await readDecimals(eth, token);
  } catch {
    throw new GiftError("Could not read which coin the contract takes. Nothing was sent; try again in a minute.");
  }
  const value = parseUnits(opts.amount, decimals);
  if (value <= BigInt(0)) throw new GiftError("Pick an amount above zero.");
  await assertSplitTakes(eth, split, value, chainId, opts.custody);

  let balance: bigint | null = null;
  let allowance = BigInt(0);
  try {
    balance = decodeUint(await call(eth, token, encodeBalanceOfCall(from)));
    allowance = decodeUint(await call(eth, token, encodeAllowanceCall(from, split)));
  } catch {
    balance = null; // An RPC hiccup: the wallet and the preflight below still catch a short balance.
  }
  if (balance !== null && balance < value) {
    throw new GiftError(
      `Your wallet holds ${formatAmount(balance, decimals)} ${opts.symbol} on ${chain.name}, less than this gift. Nothing was sent.`
    );
  }

  const memo = walletMemo((opts.rand || randomBytes)(4));
  const data = opts.memo32 ? encodeDisburseWithMemoCalldata(value, memoToBytes32(memo)) : encodeDisburseCalldata(value, memo);
  if (allowance < value) {
    step("approve");
    const approveHash = await sendTx(eth, chainId, { from, to: token, data: encodeApproveCalldata(split, value) });
    const sleep = opts.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    try {
      await waitForReceipt(eth, approveHash, { timeoutMs: opts.approveTimeoutMs ?? 120_000, sleep });
    } catch (err) {
      if (err instanceof RevertedError) {
        throw new GiftError(`The network refused the ${opts.symbol} approval, so nothing was given.`);
      }
      throw err;
    }
    // The approval is mined, but the node answering the next call may not have that block yet: a
    // check run there would revert for a short allowance (seen on Base Sepolia's public RPC).
    for (let i = 0; i < ALLOWANCE_POLLS; i++) {
      let seen = BigInt(0);
      try {
        seen = decodeUint(await call(eth, token, encodeAllowanceCall(from, split)));
      } catch {
        seen = BigInt(0);
      }
      if (seen >= value) break;
      await sleep(ALLOWANCE_POLL_MS);
    }
  }
  step("give");
  const tx = { from, to: split, data };
  await preflight(eth, tx);
  const hash = await sendTx(eth, chainId, tx);
  return { txHash: hash, from, memo, relayed: false };
}

/**
 * ShelterSplit.donate(memo) with the amount as the native value, where the native coin is the gift
 * coin (Arc: USDC, 18 decimals). One transaction; same split checks as giveToSplit.
 */
export async function giveNativeToSplit(
  opts: Omit<SplitGiveOptions, "symbol" | "memo32" | "onStep" | "approveTimeoutMs">
): Promise<GiveResult> {
  const { provider: eth, chainId, chain, split } = opts;
  if (!isUsdcNative(chain)) throw new GiftError(`Native gifts are USDC-only; ${chain.name} is not.`);
  const from = await connectWallet(eth, chainId, chain);
  await assertContract(eth, split, chain.name);
  const value = parseUnits(opts.amount, chain.nativeDecimals ?? 18);
  if (value <= BigInt(0)) throw new GiftError("Pick an amount above zero.");
  await assertSplitTakes(eth, split, value, chainId, opts.custody);
  const memo = walletMemo((opts.rand || randomBytes)(4));
  const tx = { from, to: split, value: toQuantity(value), data: encodeDonateCalldata(memo) };
  await preflight(eth, tx);
  const hash = await sendTx(eth, chainId, tx);
  return { txHash: hash, from, memo, relayed: false };
}
