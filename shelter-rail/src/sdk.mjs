// ShelterSplit Rail SDK. MIT. No dependencies.
//
// Works in browsers and Node 18+. Talks to ShelterSplit through plain JSON-RPC
// (for reads) and an EIP-1193 provider or your own signer callback (for writes).

// keccak256("donate(string)") first 4 bytes.
export const DONATE_SELECTOR = "0xb5aebc80";

export const TOPICS = Object.freeze({
  // NativeDisbursed(address indexed shelter, uint256 amount, string memo). Native coin units
  // (on Arc: USDC with 18 decimals).
  NativeDisbursed: "0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef",
  // Disbursed(address indexed shelter, uint256 amount, string memo). ERC-20 units (USDC: 6 decimals).
  Disbursed: "0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a",
  NativeDisbursementBatch: "0x78a8efdcf36fe135a2e17504fdd3d62c603422ba58646612f6f08bcc67d459d9",
});

// Arc: gas and the native coin are USDC with 18 decimals.
export const CHAINS = Object.freeze({
  5042: {
    name: "Arc",
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    nativeSymbol: "USDC",
    nativeDecimals: 18,
  },
  5042002: {
    name: "Arc Testnet",
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.arc.io",
    nativeSymbol: "USDC",
    nativeDecimals: 18,
  },
});

export const MAX_MEMO_BYTES = 256;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;

// ------------------------------------------------------------------ small helpers

const enc = new TextEncoder();
const dec = new TextDecoder();

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const word = (n) => BigInt(n).toString(16).padStart(64, "0");

function fromHex(hex) {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(str) {
  if (typeof Buffer !== "undefined") return Buffer.from(str, "utf8").toString("base64");
  let bin = "";
  for (const b of enc.encode(str)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64) {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  const bin = atob(b64);
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function explorerTxUrl(chainId, txHash) {
  const chain = CHAINS[Number(chainId)];
  return chain ? `${chain.explorer}/tx/${txHash}` : null;
}

/** Formats a bigint amount with `decimals` places, trimming trailing zeros. */
export function formatUnits(value, decimals = 18, maxFraction = 4) {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

// ------------------------------------------------------------------ encoding

/** Calldata for ShelterSplit.donate(string memo). Send it with value = the donation in wei. */
export function encodeDonate(memo = "") {
  const bytes = enc.encode(String(memo));
  if (bytes.length > MAX_MEMO_BYTES) throw new Error(`memo is ${bytes.length} bytes; the contract allows ${MAX_MEMO_BYTES}`);
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  return DONATE_SELECTOR + word(32) + word(bytes.length) + toHex(padded);
}

/** Decodes a NativeDisbursed or Disbursed log. Returns null for any other log. */
export function decodePayoutLog(log) {
  const topic = (log.topics?.[0] || "").toLowerCase();
  const kind = topic === TOPICS.NativeDisbursed ? "native" : topic === TOPICS.Disbursed ? "token" : null;
  if (!kind) return null;
  const data = fromHex(log.data || "0x");
  const readWord = (offset) => BigInt("0x" + (toHex(data.slice(offset, offset + 32)) || "0"));
  const amount = readWord(0);
  const strOffset = Number(readWord(32));
  const len = Number(readWord(strOffset));
  const memo = dec.decode(data.slice(strOffset + 32, strOffset + 32 + len));
  return {
    kind,
    shelter: "0x" + (log.topics[1] || "").slice(-40),
    amount,
    memo,
    address: (log.address || "").toLowerCase(),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber ? parseInt(log.blockNumber, 16) : null,
  };
}

// ------------------------------------------------------------------ reads

let rpcId = 0;
export async function rpc(fetchFn, url, method, params = []) {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message || "RPC error"}`);
  return body.result;
}

/**
 * Sums every payout ShelterSplit emitted.
 *
 * `deployments` is the parsed deployments.json array (entries need `chainId` and `address`;
 * `rpc` and `fromBlock` are optional), or a URL string to fetch it from.
 * Native (18-decimal) and token (6-decimal) totals stay separate so the scales never mix.
 */
export async function readTotals(deployments, fetchFn = globalThis.fetch) {
  if (typeof fetchFn !== "function") throw new Error("readTotals needs a fetch function");
  let list = deployments;
  if (typeof list === "string") {
    const res = await fetchFn(list, { cache: "no-store" });
    if (!res.ok) throw new Error(`deployments: HTTP ${res.status}`);
    list = await res.json();
  }
  if (!Array.isArray(list)) throw new Error("deployments must be an array");

  const totals = { nativeWei: 0n, tokenUnits: 0n, payouts: 0, byDeployment: [] };
  for (const d of list) {
    if (!d || !ADDRESS_RE.test(d.address || "")) continue;
    const chainId = Number(d.chainId);
    const url = d.rpc || CHAINS[chainId]?.rpc;
    const row = { chainId, address: d.address, nativeWei: 0n, tokenUnits: 0n, payouts: 0, error: null };
    totals.byDeployment.push(row);
    if (!url) {
      row.error = `no RPC known for chain ${chainId}`;
      continue;
    }
    try {
      const logs = await rpc(fetchFn, url, "eth_getLogs", [
        {
          address: d.address,
          topics: [[TOPICS.NativeDisbursed, TOPICS.Disbursed]],
          fromBlock: "0x" + Number(d.fromBlock || 0).toString(16),
          toBlock: "latest",
        },
      ]);
      for (const log of logs || []) {
        const p = decodePayoutLog(log);
        if (!p) continue;
        row.payouts++;
        if (p.kind === "native") row.nativeWei += p.amount;
        else row.tokenUnits += p.amount;
      }
    } catch (err) {
      row.error = err.message;
    }
    totals.nativeWei += row.nativeWei;
    totals.tokenUnits += row.tokenUnits;
    totals.payouts += row.payouts;
  }
  return totals;
}

// ------------------------------------------------------------------ writes

const hexChain = (id) => "0x" + Number(id).toString(16);

async function ensureChain(provider, chainId) {
  const current = parseInt(await provider.request({ method: "eth_chainId" }), 16);
  if (current === Number(chainId)) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain(chainId) }] });
  } catch (err) {
    const chain = CHAINS[Number(chainId)];
    if (err?.code !== 4902 || !chain) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChain(chainId),
          chainName: chain.name,
          rpcUrls: [chain.rpc],
          blockExplorerUrls: [chain.explorer],
          nativeCurrency: { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: chain.nativeDecimals },
        },
      ],
    });
  }
}

/**
 * Donates through an injected EIP-1193 wallet (window.ethereum or any compatible provider).
 * Asks for the account, switches to `chainId` (adding Arc if the wallet lacks it), then sends
 * donate(memo) with value = amountWei. Resolves once the wallet returns the tx hash.
 */
export async function donateWithInjected(provider, { chainId, split, amountWei, memo = "" }) {
  if (!provider?.request) throw new Error("no wallet provider found");
  if (!ADDRESS_RE.test(split || "")) throw new Error("ShelterSplit address is not set yet");
  const value = BigInt(amountWei);
  if (value <= 0n) throw new Error("amount must be above zero");
  const [from] = await provider.request({ method: "eth_requestAccounts" });
  if (!from) throw new Error("the wallet returned no account");
  await ensureChain(provider, chainId);
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: split, value: "0x" + value.toString(16), data: encodeDonate(memo) }],
  });
  return { txHash, chainId: Number(chainId), from, explorerUrl: explorerTxUrl(chainId, txHash) };
}

/** Polls eth_getTransactionReceipt through an EIP-1193 provider until the tx is mined. */
export async function waitForReceipt(provider, txHash, { intervalMs = 1500, timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error(`transaction ${txHash} reverted`);
      return receipt;
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${txHash}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ------------------------------------------------------------------ x402 (onchain-receipt scheme)

/** Picks the first 'onchain-receipt' offer from a 402 body, or throws with a clear reason. */
export function pickOffer(body) {
  if (!body || body.x402Version !== 1 || !Array.isArray(body.accepts)) throw new Error("not an x402 v1 response");
  const offer = body.accepts.find((a) => a && a.scheme === "onchain-receipt");
  if (!offer) throw new Error("the server offers no 'onchain-receipt' payment");
  const m = /^eip155:(\d+)$/.exec(offer.network || "");
  if (!m) throw new Error(`unsupported network ${offer.network}`);
  if (offer.asset !== "native") throw new Error(`unsupported asset ${offer.asset}`);
  if (!ADDRESS_RE.test(offer.payTo || "")) throw new Error("offer has no valid payTo address");
  const nonce = offer.extra?.nonce;
  const memo = offer.extra?.memo;
  if (!nonce || memo !== `x402:${nonce}`) throw new Error("offer memo must be 'x402:<nonce>'");
  return { ...offer, chainId: Number(m[1]), amountWei: BigInt(offer.maxAmountRequired), nonce, memo };
}

export function encodePaymentHeader({ chainId, txHash, nonce }) {
  return toBase64(
    JSON.stringify({
      x402Version: 1,
      scheme: "onchain-receipt",
      network: `eip155:${chainId}`,
      payload: { txHash, nonce },
    })
  );
}

/**
 * Fetches an x402-paywalled URL. On HTTP 402 with an 'onchain-receipt' offer it pays
 * donate('x402:<nonce>') to the offer's payTo (the ShelterSplit contract), waits for the
 * receipt, and retries with the X-PAYMENT header.
 *
 * Options:
 *   maxAmountWei  required spending cap; the call refuses any offer above it.
 *   provider      an EIP-1193 provider (the SDK sends and waits for the tx), or
 *   pay           async ({chainId, to, valueWei, data, memo}) => txHash, resolving after the tx is mined.
 *   fetch         fetch implementation (default globalThis.fetch).
 *   init          extra fetch init (headers etc.) for both requests.
 *   retries       how many times to retry the paid request while the server still answers 402 (default 3).
 *   retryDelayMs  wait between those retries (default 2000).
 *
 * Returns { response, paid: null | {txHash, chainId, amountWei}, receipt: decoded X-PAYMENT-RESPONSE | null }.
 */
export async function payAndFetch(url, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function") throw new Error("payAndFetch needs a fetch function");
  if (opts.maxAmountWei === undefined) throw new Error("set maxAmountWei: the most you allow one call to pay");
  if (!opts.provider && typeof opts.pay !== "function") throw new Error("pass a provider or a pay callback");
  const cap = BigInt(opts.maxAmountWei);
  const init = opts.init || {};

  const first = await fetchFn(url, init);
  if (first.status !== 402) return { response: first, paid: null, receipt: null };

  const offer = pickOffer(await first.json());
  if (offer.amountWei > cap) throw new Error(`price ${offer.amountWei} wei is above your cap of ${cap} wei`);

  const data = encodeDonate(offer.memo);
  let txHash;
  if (typeof opts.pay === "function") {
    txHash = await opts.pay({ chainId: offer.chainId, to: offer.payTo, valueWei: offer.amountWei, data, memo: offer.memo });
  } else {
    ({ txHash } = await donateWithInjected(opts.provider, {
      chainId: offer.chainId,
      split: offer.payTo,
      amountWei: offer.amountWei,
      memo: offer.memo,
    }));
    await waitForReceipt(opts.provider, txHash, opts.receiptOptions);
  }
  if (!TX_RE.test(txHash || "")) throw new Error("payment did not return a transaction hash");

  const header = encodePaymentHeader({ chainId: offer.chainId, txHash, nonce: offer.nonce });
  const retries = opts.retries ?? 3;
  const delay = opts.retryDelayMs ?? 2000;
  let response;
  for (let attempt = 0; ; attempt++) {
    response = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), "X-PAYMENT": header } });
    if (response.status !== 402 || attempt >= retries) break;
    await new Promise((r) => setTimeout(r, delay));
  }

  let receipt = null;
  const raw = response.headers?.get?.("x-payment-response");
  if (raw) {
    try {
      receipt = JSON.parse(fromBase64(raw));
    } catch {
      receipt = null;
    }
  }
  return { response, paid: { txHash, chainId: offer.chainId, amountWei: offer.amountWei }, receipt };
}
