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
  // DisbursementBatch(uint256 indexed batchId, address indexed payer, uint256 amount, uint256 toShelters,
  // uint256 toTreasury, uint256 sheltersPaid, string memo): one per disburse()/disburseWithMemo().
  DisbursementBatch: "0x485615214cb30802281e3bce3cf20125c9f665162a889b1a53eec118dd58f603",
});

/** The name a wallet shows for the native coin of a chain that has none (Tempo pays fees in USD stablecoins). */
export const NO_NATIVE_COIN_NAME = "No native coin (fees in USD stablecoins)";

const coin = (symbol, address, eip3009, decimals = 6) => Object.freeze({ symbol, address, decimals, eip3009 });

/**
 * The seven ShelterSplit chains, mainnet and testnet. RPCs are the keyless public ones the backend
 * uses (backend/src/shelter/onchain/shelter-onchain.config.ts); chain ids, explorers and coin
 * addresses mirror funding/framework/tracks/a-build/chains.json.
 *
 *   nativeSymbol / nativeDecimals  the gas coin. Arc's is USDC itself (18 decimals natively, 6 through
 *                                  its ERC-20 interface), so only Arc takes a native donate() gift.
 *   noNativeCoin                   Tempo: no gas coin; fees are paid in a TIP-20 USD stablecoin. Wallets
 *                                  still need a nativeCurrency to add the chain, so it reads "USD".
 *   memo32                         Tempo: TIP-20 tokens carry a bytes32 memo; ShelterSplit's
 *                                  disburseWithMemo(amount, bytes32) passes it on.
 *   coins                          payout tokens, the chain's own coin first. eip3009: the token has
 *                                  receiveWithAuthorization / transferWithAuthorization, so a
 *                                  DonateRouter (one signature) or x402 `exact` can use it. Without it,
 *                                  the gift is approve + ShelterSplit.disburse from the giver's wallet.
 *   logRpc / maxLogRange           a keyless RPC that serves wide eth_getLogs ranges, and the widest
 *                                  range the default RPC takes, where known.
 *
 * Not listed (no address in the repo's tables yet): EURC on Arbitrum, Tempo, Robinhood and Monad.
 * Robinhood Chain has no USDC: mainnet pays USDG (Paxos); its testnet uses a test MockUSDC (mUSDC).
 */
export const CHAINS = Object.freeze({
  5042: Object.freeze({
    name: "Arc",
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    nativeSymbol: "USDC",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x3600000000000000000000000000000000000000", true), coin("EURC", "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", true)],
  }),
  5042002: Object.freeze({
    name: "Arc Testnet",
    testnet: true,
    rpc: "https://rpc.testnet.arc.io",
    logRpc: "https://rpc.blockdaemon.testnet.arc.network",
    maxLogRange: 100000,
    explorer: "https://explorer.testnet.arc.io",
    nativeSymbol: "USDC",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x3600000000000000000000000000000000000000", true), coin("EURC", "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", true)],
  }),
  4217: Object.freeze({
    name: "Tempo",
    rpc: "https://rpc.tempo.xyz",
    // eth_getLogs answers spans below 100,000 blocks ("query exceeds max block range 100000"; checked 2026-10-05).
    maxLogRange: 99999,
    explorer: "https://explore.tempo.xyz",
    nativeSymbol: "USD",
    nativeDecimals: 18,
    noNativeCoin: true,
    memo32: true,
    coins: [coin("USDC.e", "0x20C000000000000000000000b9537d11c60E8b50", false)],
  }),
  42431: Object.freeze({
    name: "Tempo Testnet",
    testnet: true,
    rpc: "https://rpc.moderato.tempo.xyz",
    explorer: "https://explore.testnet.tempo.xyz",
    nativeSymbol: "USD",
    nativeDecimals: 18,
    noNativeCoin: true,
    memo32: true,
    coins: [coin("pathUSD", "0x20c0000000000000000000000000000000000000", false)],
  }),
  42161: Object.freeze({
    name: "Arbitrum One",
    rpc: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    coins: [coin("USDC", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", true)],
  }),
  421614: Object.freeze({
    name: "Arbitrum Sepolia",
    testnet: true,
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", true)],
  }),
  43114: Object.freeze({
    name: "Avalanche C-Chain",
    rpc: "https://api.avax.network/ext/bc/C/rpc",
    explorer: "https://subnets.avax.network/c-chain",
    nativeSymbol: "AVAX",
    nativeDecimals: 18,
    coins: [coin("USDC", "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", true), coin("EURC", "0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD", true)],
  }),
  43113: Object.freeze({
    name: "Avalanche Fuji",
    testnet: true,
    rpc: "https://api.avax-test.network/ext/bc/C/rpc",
    explorer: "https://subnets-test.avax.network/c-chain",
    nativeSymbol: "AVAX",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x5425890298aed601595a70AB815c96711a31Bc65", true), coin("EURC", "0x5E44db7996c682E92a960b65AC713a54AD815c6B", true)],
  }),
  8453: Object.freeze({
    name: "Base",
    rpc: "https://mainnet.base.org",
    maxLogRange: 2000,
    explorer: "https://basescan.org",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", true), coin("EURC", "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", true)],
  }),
  84532: Object.freeze({
    name: "Base Sepolia",
    testnet: true,
    rpc: "https://sepolia.base.org",
    logRpc: "https://base-sepolia-rpc.publicnode.com",
    maxLogRange: 1000,
    explorer: "https://sepolia.basescan.org",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x036CbD53842c5426634e7929541eC2318f3dCF7e", true), coin("EURC", "0x808456652fdb597867f38412077A9182bf77359F", true)],
  }),
  4663: Object.freeze({
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    coins: [coin("USDG", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", false)],
  }),
  46630: Object.freeze({
    name: "Robinhood Chain Testnet",
    testnet: true,
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    // Test MockUSDC deployed by the testnet wave (deployments.json tokenAddress): not a real dollar.
    coins: [coin("mUSDC", "0x457c89e10a6e66633eda5bf82fd086febb5db147", false)],
  }),
  143: Object.freeze({
    name: "Monad",
    rpc: "https://rpc.monad.xyz",
    // The public RPC answers eth_getLogs over at most 100 blocks (HTTP 413 beyond; checked 2026-10-04), so
    // logs come from rpc1.monad.xyz, which serves 100,000-block spans in one call (checked 2026-10-05).
    logRpc: "https://rpc1.monad.xyz",
    maxLogRange: 100000,
    explorer: "https://monadvision.com",
    nativeSymbol: "MON",
    nativeDecimals: 18,
    // Native Circle USDC (FiatToken, EIP-3009).
    coins: [coin("USDC", "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", true)],
  }),
  10143: Object.freeze({
    name: "Monad Testnet",
    testnet: true,
    rpc: "https://testnet-rpc.monad.xyz",
    // Same 100-block cap; OnFinality's keyless endpoint takes 10,000-block windows (as the client page).
    logRpc: "https://monad-testnet.api.onfinality.io/public",
    maxLogRange: 10000,
    explorer: "https://testnet.monadvision.com",
    nativeSymbol: "MON",
    nativeDecimals: 18,
    coins: [coin("USDC", "0x534b2f3A21130d7a60830c2Df862319e593943A3", true)],
  }),
});

/** The chain's own payout coin (USDC, USDC.e, pathUSD, USDG, mUSDC), or the coin named `symbol`. Null when unknown. */
export function coinFor(chainId, symbol) {
  const coins = CHAINS[Number(chainId)]?.coins || [];
  if (!symbol) return coins[0] || null;
  return coins.find((c) => c.symbol.toLowerCase() === String(symbol).toLowerCase()) || null;
}

/** The coin of `chainId` at `address` (case-insensitive), or null. */
export function coinByAddress(chainId, address) {
  const a = String(address || "").toLowerCase();
  return (CHAINS[Number(chainId)]?.coins || []).find((c) => c.address.toLowerCase() === a) || null;
}

/** True where the native coin is USDC (Arc), so ShelterSplit.donate() with value is a USDC gift. */
export const isUsdcNative = (chainId) => CHAINS[Number(chainId)]?.nativeSymbol === "USDC";

/** wallet_addEthereumChain params for a known chain, or null. */
export function addChainParams(chainId) {
  const chain = CHAINS[Number(chainId)];
  if (!chain) return null;
  return {
    chainId: "0x" + Number(chainId).toString(16),
    chainName: chain.name,
    rpcUrls: [chain.rpc],
    blockExplorerUrls: [chain.explorer],
    nativeCurrency: {
      name: chain.noNativeCoin ? NO_NATIVE_COIN_NAME : chain.nativeSymbol,
      symbol: chain.nativeSymbol,
      decimals: chain.nativeDecimals,
    },
  };
}

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
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** One JSON-RPC call. Public RPCs rate-limit bursts: HTTP 429 is retried with backoff (`retries`, default 4). */
export async function rpc(fetchFn, url, method, params = [], { retries = 4, retryDelayMs = 700 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    });
    if (res.status === 429 && attempt < retries) {
      await pause(retryDelayMs * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message || "RPC error"}`);
    return body.result;
  }
}

/** Default eth_getLogs window when the whole range is refused, and the most windows one scan may use. */
export const LOG_WINDOW = 10000;
export const MAX_LOG_REQUESTS = 400;

/**
 * eth_getLogs over [fromBlock, latest]: the whole range in one call, else (public RPCs cap the range)
 * windows of `window` blocks, at most `maxRequests` of them.
 */
export async function getLogsWindowed(fetchFn, url, { address, topics, fromBlock = 0, window = LOG_WINDOW, maxRequests = MAX_LOG_REQUESTS, concurrency = 4 }) {
  const filter = (from, to) => [{ address, topics, fromBlock: "0x" + Number(from).toString(16), toBlock: to }];
  try {
    // A chain known to take only small ranges (Monad: 100 blocks) goes straight to windows.
    if (window < 1000) throw new Error("small range");
    return (await rpc(fetchFn, url, "eth_getLogs", filter(fromBlock, "latest"))) || [];
  } catch (err) {
    const latest = parseInt(await rpc(fetchFn, url, "eth_blockNumber", []), 16);
    const windows = Math.ceil((latest - fromBlock + 1) / window);
    if (!(windows > 0)) throw err;
    if (windows > maxRequests) throw new Error(`log range of ${latest - fromBlock + 1} blocks needs ${windows} requests; set fromBlock`);
    const starts = [];
    for (let s = Number(fromBlock); s <= latest; s += window) starts.push(s);
    const parts = new Array(starts.length);
    let next = 0;
    const worker = async () => {
      while (next < starts.length) {
        const i = next++;
        parts[i] = (await rpc(fetchFn, url, "eth_getLogs", filter(starts[i], "0x" + Math.min(starts[i] + window - 1, latest).toString(16)))) || [];
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, starts.length)) }, worker));
    return parts.flat();
  }
}

/**
 * Sums every payout ShelterSplit emitted.
 *
 * `deployments` is the parsed deployments.json array (entries need `chainId` and `address`;
 * `rpc`, `fromBlock`, `tx` (the deploy transaction: its block is the scan start when `fromBlock` is
 * absent), `symbol`/`token` and `decimals` are optional), or a URL string to fetch it from.
 *
 * Native (18-decimal) and token (6-decimal) totals stay separate so the scales never mix
 * (`nativeWei`, `tokenUnits`; kept for older callers, but they add every chain's coins together).
 * `byCoin` is the honest view: { [symbol]: amount scaled to 18 decimals }, where Arc's native USDC
 * counts as USDC and every other native coin (ETH, AVAX, MON) under its own symbol. Each
 * `byDeployment` row has its `symbol`, `nativeSymbol`, `decimals` and `testnet` flag. USDC, USDG,
 * mUSDC, pathUSD and EURC are different coins and are never summed together.
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

  const totals = { nativeWei: 0n, tokenUnits: 0n, payouts: 0, byCoin: {}, byDeployment: [] };
  const addCoin = (symbol, wei18) => {
    if (wei18 === 0n) return;
    totals.byCoin[symbol] = (totals.byCoin[symbol] || 0n) + wei18;
  };
  for (const d of list) {
    if (!d || !ADDRESS_RE.test(d.address || "")) continue;
    const chainId = Number(d.chainId);
    const chain = CHAINS[chainId];
    const url = d.rpc || chain?.logRpc || chain?.rpc;
    const own = coinFor(chainId);
    const symbol = String(d.symbol || d.token || own?.symbol || "token");
    const decimals = Number.isInteger(d.decimals) ? d.decimals : coinFor(chainId, symbol)?.decimals ?? 6;
    const row = {
      chainId,
      address: d.address,
      symbol,
      decimals,
      nativeSymbol: chain?.nativeSymbol || null,
      testnet: d.network ? d.network === "testnet" : !!chain?.testnet,
      nativeWei: 0n,
      tokenUnits: 0n,
      payouts: 0,
      error: null,
    };
    totals.byDeployment.push(row);
    if (!url) {
      row.error = `no RPC known for chain ${chainId}`;
      continue;
    }
    try {
      let fromBlock = Number(d.fromBlock || 0);
      if (!d.fromBlock && TX_RE.test(d.tx || "")) {
        // The chain's default RPC: a wide-range log RPC may not keep old receipts (Arc testnet's does not).
        const receipt = await rpc(fetchFn, d.rpc || chain?.rpc || url, "eth_getTransactionReceipt", [d.tx]).catch(() => null);
        if (receipt?.blockNumber) fromBlock = parseInt(receipt.blockNumber, 16);
      }
      const logs = await getLogsWindowed(fetchFn, url, {
        address: d.address,
        topics: [[TOPICS.NativeDisbursed, TOPICS.Disbursed]],
        fromBlock,
        window: chain?.logRpc && !d.rpc ? Math.max(chain?.maxLogRange || 0, LOG_WINDOW) : chain?.maxLogRange || LOG_WINDOW,
      });
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
    addCoin(row.nativeSymbol === "USDC" ? "USDC" : row.nativeSymbol || "native", row.nativeWei * 10n ** BigInt(18 - (chain?.nativeDecimals ?? 18)));
    addCoin(symbol, row.tokenUnits * 10n ** BigInt(Math.max(0, 18 - decimals)));
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
    const params = addChainParams(chainId);
    if (err?.code !== 4902 || !params) throw err;
    await provider.request({ method: "wallet_addEthereumChain", params: [params] });
  }
}

/**
 * Donates through an injected EIP-1193 wallet (window.ethereum or any compatible provider).
 * Asks for the account, switches to `chainId` (adding Arc if the wallet lacks it), then sends
 * donate(memo) with value = amountWei. Resolves once the wallet returns the tx hash.
 */
export async function donateWithInjected(provider, { chainId, split, amountWei, memo = "" }) {
  if (!provider?.request) throw new Error("no wallet provider found");
  // amountWei is sent as the chain's native coin. Only where that coin is USDC (Arc) is it a USDC gift;
  // elsewhere it would send ETH, AVAX or MON. Use signAndRelay (USDC through a DonateRouter) there.
  if (CHAINS[Number(chainId)]?.nativeSymbol !== "USDC") {
    throw new Error(`native gifts are USDC-only; chain ${chainId} is not a USDC-native chain (use signAndRelay)`);
  }
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

// ------------------------------------------------------------------ token gifts (approve + disburse)

/** Selectors of the token path (keccak256 of the signatures; pinned by tests against `cast sig`). */
export const TOKEN_SELECTORS = Object.freeze({
  approve: "0x095ea7b3", // approve(address,uint256)
  allowance: "0xdd62ed3e", // allowance(address,address)
  disburse: "0xc950e7d9", // ShelterSplit.disburse(uint256,string)
  disburseWithMemo: "0x970a3255", // ShelterSplit.disburseWithMemo(uint256,bytes32): Tempo TIP-20 only
  token: "0xfc0c546a", // ShelterSplit.token()
});

/** ERC-20 approve(spender, amount) calldata. */
export function encodeApprove(spender, amount) {
  return TOKEN_SELECTORS.approve + addrWord(spender) + word(BigInt(amount));
}

/** ERC-20 allowance(owner, spender) calldata, for an eth_call. */
export function encodeAllowanceCall(owner, spender) {
  return TOKEN_SELECTORS.allowance + addrWord(owner) + addrWord(spender);
}

/** ShelterSplit.disburse(uint256 amount, string memo): pulls `amount` of the split's token from the caller. */
export function encodeDisburse(amount, memo = "") {
  const bytes = enc.encode(String(memo));
  if (bytes.length > MAX_MEMO_BYTES) throw new Error(`memo is ${bytes.length} bytes; the contract allows ${MAX_MEMO_BYTES}`);
  return TOKEN_SELECTORS.disburse + word(BigInt(amount)) + word(64) + encodeStringArg(memo);
}

/**
 * A memo as bytes32: a 0x-prefixed 32-byte hex value as it is, else its UTF-8 bytes right-padded with
 * zeros (at most 32 bytes; longer throws: hash it, as the x402 offers do with `memo32`).
 */
export function memoToBytes32(memo) {
  const s = String(memo ?? "");
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  const bytes = enc.encode(s);
  if (bytes.length > 32) throw new Error(`memo is ${bytes.length} bytes; a bytes32 memo holds 32 (pass keccak256 of it)`);
  return "0x" + toHex(bytes).padEnd(64, "0");
}

/**
 * ShelterSplit.disburseWithMemo(uint256 amount, bytes32 memo) (Tempo TIP-20): every payout carries the
 * memo in the token's TransferWithMemo; the split's events carry it as a 0x-prefixed hex string.
 */
export function encodeDisburseWithMemo(amount, memo32) {
  return TOKEN_SELECTORS.disburseWithMemo + word(BigInt(amount)) + memoToBytes32(memo32).slice(2);
}

const readWord = (ret) => (/^0x[0-9a-fA-F]{64}/.test(String(ret)) ? BigInt(String(ret).slice(0, 66)) : null);

/**
 * Gives `amount` (token base units) straight into ShelterSplit from an injected wallet, for coins
 * without EIP-3009 (Tempo's TIP-20 pathUSD / USDC.e, Robinhood's USDG and test mUSDC) or a chain with
 * no DonateRouter. Switches (or adds) the chain, reads split.token() when `token` is omitted, approves
 * the split for exactly `amount` when the allowance is short and waits for that approval, then calls
 * disburse(amount, memo) — or disburseWithMemo(amount, memo32) on Tempo (`method` overrides the
 * chain default; `memo32` defaults to memoToBytes32(memo)). The giver's wallet pays both fees.
 * Resolves with { txHash, approveTxHash, chainId, from, token, explorerUrl } once the disburse is sent.
 */
export async function donateTokenWithInjected(provider, { chainId, split, token, amount, memo = "", method, memo32, receiptOptions } = {}) {
  if (!provider?.request) throw new Error("no wallet provider found");
  if (!ADDRESS_RE.test(split || "")) throw new Error("ShelterSplit address is not set yet");
  if (token !== undefined && token !== null && !ADDRESS_RE.test(token)) throw new Error("token is not an address");
  const value = BigInt(amount ?? 0);
  if (value <= 0n) throw new Error("amount must be above zero");
  const withMemo = method ? method === "disburseWithMemo" : !!CHAINS[Number(chainId)]?.memo32;
  if (method && method !== "disburse" && method !== "disburseWithMemo") throw new Error(`unknown method ${method}`);
  const data = withMemo ? encodeDisburseWithMemo(value, memo32 ?? memoToBytes32(memo)) : encodeDisburse(value, memo);
  const [from] = await provider.request({ method: "eth_requestAccounts" });
  if (!from) throw new Error("the wallet returned no account");
  await ensureChain(provider, chainId);
  const call = (to, d) => provider.request({ method: "eth_call", params: [{ to, data: d }, "latest"] });
  let coinAddress = token;
  if (!coinAddress) {
    const ret = await call(split, TOKEN_SELECTORS.token);
    coinAddress = /^0x[0-9a-fA-F]{64}/.test(String(ret)) ? "0x" + String(ret).slice(26, 66) : null;
    if (!ADDRESS_RE.test(coinAddress || "")) throw new Error("could not read the split's token; nothing was sent");
  }
  const allowance = readWord(await call(coinAddress, encodeAllowanceCall(from, split))) ?? 0n;
  let approveTxHash = null;
  if (allowance < value) {
    approveTxHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from, to: coinAddress, data: encodeApprove(split, value) }],
    });
    await waitForReceipt(provider, approveTxHash, receiptOptions);
  }
  const txHash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: split, data }] });
  return { txHash, approveTxHash, chainId: Number(chainId), from, token: coinAddress, explorerUrl: explorerTxUrl(chainId, txHash) };
}

// ------------------------------------------------------------------ keccak256 and EIP-712

const MASK64 = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn,
  0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n,
  0x0000000080008009n, 0x000000008000000an, 0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64);

function keccakF(st) {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map((x) => st[x] ^ st[x + 5] ^ st[x + 10] ^ st[x + 15] ^ st[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) st[x + y] ^= d;
    }
    const b = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(st[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 25; y += 5) st[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK64 & b[((x + 2) % 5) + y]);
    st[0] ^= RC[round];
  }
}

/** Keccak-256 (the Ethereum hash, not SHA3-256) of bytes or a 0x hex string. Returns 0x hex. */
export function keccak256(input) {
  const bytes = typeof input === "string" ? fromHex(input) : input;
  const rate = 136;
  const padded = new Uint8Array(Math.floor(bytes.length / rate) * rate + rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const st = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k]);
      st[i] ^= lane;
    }
    keccakF(st);
  }
  let out = "";
  for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) out += Number((st[i] >> BigInt(8 * k)) & 0xffn).toString(16).padStart(2, "0");
  return "0x" + out;
}

const utf8Hash = (s) => keccak256(enc.encode(String(s)));
const addrWord = (a) => {
  if (!ADDRESS_RE.test(a || "")) throw new Error(`not an address: ${a}`);
  return a.slice(2).toLowerCase().padStart(64, "0");
};

/** abi.encode of one atomic EIP-712 value as a 32-byte hex word (no 0x). */
function encodeValue(type, value) {
  if (type === "address") return addrWord(value);
  if (type === "string") return utf8Hash(value).slice(2);
  if (type === "bytes") return keccak256(value).slice(2);
  if (type === "bytes32") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value || "")) throw new Error(`not 32 bytes: ${value}`);
    return value.slice(2).toLowerCase();
  }
  if (/^uint\d*$/.test(type)) return word(BigInt(value));
  if (type === "bool") return word(value ? 1 : 0);
  throw new Error(`unsupported EIP-712 type ${type}`);
}

const typeString = (name, fields) => `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;

function hashStruct(name, fields, value) {
  let data = keccak256(enc.encode(typeString(name, fields))).slice(2);
  for (const f of fields) data += encodeValue(f.type, value[f.name]);
  return keccak256("0x" + data);
}

const DOMAIN_FIELDS = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

/**
 * The EIP-712 digest (what the wallet signs) of a flat typed-data payload, the same JSON that
 * eth_signTypedData_v4 takes. Enough for EIP-3009; nested structs are not supported.
 */
export function hashTypedData(typedData) {
  const { domain, types, primaryType, message } = typedData;
  const domainFields = types.EIP712Domain || DOMAIN_FIELDS.filter((f) => domain[f.name] !== undefined);
  const domainSeparator = hashStruct("EIP712Domain", domainFields, domain);
  const structHash = hashStruct(primaryType, types[primaryType], message);
  return keccak256("0x1901" + domainSeparator.slice(2) + structHash.slice(2));
}

const AUTH_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];

/**
 * EIP-3009 typed data for a USDC (Circle FiatToken) authorization.
 * kind "ReceiveWithAuthorization": the payee (the DonateRouter) must redeem it itself.
 * kind "TransferWithAuthorization": anyone may submit it; the x402 `exact` scheme uses it.
 */
export function buildAuthorization({ kind, chainId, token, name, version, from, to, value, validAfter = 0, validBefore, nonce }) {
  if (kind !== "ReceiveWithAuthorization" && kind !== "TransferWithAuthorization") throw new Error(`unknown kind ${kind}`);
  for (const [k, v] of Object.entries({ token, from, to })) if (!ADDRESS_RE.test(v || "")) throw new Error(`${k} is not an address`);
  return {
    types: { EIP712Domain: DOMAIN_FIELDS, [kind]: AUTH_FIELDS },
    primaryType: kind,
    domain: { name: String(name), version: String(version), chainId: Number(chainId), verifyingContract: token },
    message: {
      from,
      to,
      value: BigInt(value).toString(),
      validAfter: BigInt(validAfter).toString(),
      validBefore: BigInt(validBefore).toString(),
      nonce,
    },
  };
}

function randomBytes32() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return "0x" + toHex(bytes);
}

const enc32 = (n) => word(n);
function encodeStringArg(s) {
  const bytes = enc.encode(String(s));
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  return enc32(bytes.length) + toHex(padded);
}

// ------------------------------------------------------------------ gasless gifts (DonateRouter)

/** DonateRouter selectors (keccak256 of the signatures; pinned by tests). */
export const ROUTER_SELECTORS = Object.freeze({
  authNonce: "0x" + utf8Hash("authNonce(bytes32,string,bytes32)").slice(2, 10),
  canDonate: "0x" + utf8Hash("canDonate(uint256)").slice(2, 10),
  recipientsHash: "0x" + utf8Hash("recipientsHash(uint256)").slice(2, 10),
  split: "0x" + utf8Hash("split()").slice(2, 10),
  usdc: "0x" + utf8Hash("usdc()").slice(2, 10),
});
const NAME_SELECTOR = "0x06fdde03";
const VERSION_SELECTOR = "0x54fd4d50";
const DOMAIN_SEPARATOR_SELECTOR = "0x3644e515";

/**
 * The router's EIP-3009 nonce: keccak256(abi.encode(router, keccak256(bytes(memo)), salt, recipients)),
 * where recipients = router.recipientsHash(value): the donor signs exactly who gets paid, and the
 * router reverts (RecipientsChanged) if the shelter list changes before the gift is submitted.
 */
export function routerAuthNonce(router, salt, memo, recipients) {
  return keccak256(
    "0x" + addrWord(router) + utf8Hash(memo).slice(2) + encodeValue("bytes32", salt) + encodeValue("bytes32", recipients)
  );
}

export function encodeAuthNonceCall(salt, memo, recipients) {
  return (
    ROUTER_SELECTORS.authNonce + encodeValue("bytes32", salt) + enc32(96) + encodeValue("bytes32", recipients) + encodeStringArg(memo)
  );
}

/** Decodes an ABI-encoded `string` return value. */
export function decodeAbiString(hex) {
  const data = fromHex(hex || "0x");
  if (data.length < 64) return null;
  const at = (o) => Number(BigInt("0x" + toHex(data.slice(o, o + 32))));
  const offset = at(0);
  const len = at(offset);
  return dec.decode(data.slice(offset + 32, offset + 32 + len));
}

/**
 * name() and version() of a token, through an EIP-1193 provider: the EIP-712 domain of its
 * authorizations. A token without version() (USDG on Robinhood Chain signs with "1") gets the version
 * whose separator matches its DOMAIN_SEPARATOR(), when `chainId` is given; otherwise version is null.
 */
export async function readTokenDomain(provider, token, chainId) {
  const call = (data) => provider.request({ method: "eth_call", params: [{ to: token, data }, "latest"] });
  const name = decodeAbiString(await call(NAME_SELECTOR));
  let version = null;
  try {
    version = decodeAbiString(await call(VERSION_SELECTOR));
  } catch {
    version = null;
  }
  if (!version && name && chainId !== undefined && ADDRESS_RE.test(token || "")) {
    let separator = null;
    try {
      separator = String(await call(DOMAIN_SEPARATOR_SELECTOR)).slice(0, 66).toLowerCase();
    } catch {
      separator = null;
    }
    for (const v of ["2", "1"]) {
      const domain = { name, version: v, chainId: Number(chainId), verifyingContract: token };
      if (separator && hashStruct("EIP712Domain", DOMAIN_FIELDS, domain) === separator) version = v;
    }
  }
  return { name, version };
}

/** A fresh relay memo: `tt:wallet:<8 hex>`, random and free of personal data. */
export function walletMemo() {
  return "tt:wallet:" + randomBytes32().slice(2, 10);
}

/**
 * Gasless gift through a DonateRouter. The donor signs one EIP-3009 ReceiveWithAuthorization (no gas,
 * no approve); a relay submits it, and the router pulls the USDC from the donor and pays the shelters
 * through ShelterSplit in the same transaction. The router has no owner, keeps no gift past the call
 * that brings it in, and reverts if any part would reach the split's treasury, so the relay never holds
 * the gift.
 *
 * Options: provider (EIP-1193), chainId, router, usdc, amount (USDC base units, 6 decimals),
 * relayUrl, split (the ShelterSplit you expect the gift to reach; strongly recommended: the SDK refuses a
 * router whose split() or usdc() differs before anything is signed), memo (default tt:wallet:<8 hex>), validForSeconds (default 300; relays accept 30..600),
 * fetch (default globalThis.fetch), now (seconds, for tests).
 *
 * Resolves with { from, memo, salt, recipients, nonce, signature, relay: <relay JSON>, txHash: relay.txHash || null }.
 */
export async function signAndRelay(opts = {}) {
  const { provider, chainId, router, usdc, relayUrl } = opts;
  const fetchFn = opts.fetch || globalThis.fetch;
  if (!provider?.request) throw new Error("no wallet provider found");
  if (!ADDRESS_RE.test(router || "")) throw new Error("DonateRouter address is not set yet");
  if (!ADDRESS_RE.test(usdc || "")) throw new Error("USDC address is not set");
  if (!relayUrl) throw new Error("relayUrl is required");
  if (typeof fetchFn !== "function") throw new Error("signAndRelay needs a fetch function");
  const value = BigInt(opts.amount ?? 0);
  if (value <= 0n) throw new Error("amount must be above zero");
  const memo = opts.memo ?? walletMemo();
  if (enc.encode(memo).length > MAX_MEMO_BYTES) throw new Error("memo is too long");

  const [from] = await provider.request({ method: "eth_requestAccounts" });
  if (!from) throw new Error("the wallet returned no account");
  await ensureChain(provider, chainId);

  // The donor gives the router pull rights for `value`: check it is wired to the expected split and token.
  const readAddress = async (data) => {
    const ret = await provider.request({ method: "eth_call", params: [{ to: router, data }, "latest"] });
    return /^0x[0-9a-fA-F]{64}/.test(String(ret)) ? "0x" + String(ret).slice(26, 66).toLowerCase() : null;
  };
  if (opts.split !== undefined) {
    if (!ADDRESS_RE.test(opts.split || "")) throw new Error("split is not an address");
    if ((await readAddress(ROUTER_SELECTORS.split)) !== opts.split.toLowerCase()) {
      throw new Error("this router does not pay the expected ShelterSplit; nothing was signed");
    }
  }
  if ((await readAddress(ROUTER_SELECTORS.usdc)) !== usdc.toLowerCase()) {
    throw new Error("this router does not use the expected USDC; nothing was signed");
  }

  // Guard pre-check: refuse before signing if the split would send any part to its treasury.
  const can = await provider.request({
    method: "eth_call",
    params: [{ to: router, data: ROUTER_SELECTORS.canDonate + word(value) }, "latest"],
  });
  if (!can || BigInt("0x" + (can.slice(2, 66) || "0")) !== 1n) {
    throw new Error("the router would not accept this gift right now (paused, or part would not reach the shelters); nothing was signed");
  }

  // The payout list the donor signs: every shelter wallet and its exact amount for this gift.
  const rhRet = await provider.request({
    method: "eth_call",
    params: [{ to: router, data: ROUTER_SELECTORS.recipientsHash + word(value) }, "latest"],
  });
  if (!/^0x[0-9a-fA-F]{64}/.test(String(rhRet))) throw new Error("could not read the router's shelter list; nothing was signed");
  const recipients = String(rhRet).slice(0, 66).toLowerCase();

  const salt = opts.salt ?? randomBytes32();
  const nonce = await provider.request({
    method: "eth_call",
    params: [{ to: router, data: encodeAuthNonceCall(salt, memo, recipients) }, "latest"],
  });
  if (String(nonce).toLowerCase() !== routerAuthNonce(router, salt, memo, recipients)) {
    throw new Error("the router's authNonce does not match this SDK; nothing was signed");
  }

  const domain = await readTokenDomain(provider, usdc, chainId);
  if (!domain.name || !domain.version) throw new Error("could not read the USDC name and version");
  const now = Math.floor(opts.now ?? Date.now() / 1000);
  const validBefore = now + Number(opts.validForSeconds ?? 300);
  const typedData = buildAuthorization({
    kind: "ReceiveWithAuthorization",
    chainId,
    token: usdc,
    name: domain.name,
    version: domain.version,
    from,
    to: router,
    value,
    validAfter: 0,
    validBefore,
    nonce,
  });
  const signature = await provider.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typedData)] });

  const res = await fetchFn(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: Number(chainId),
      from,
      value: value.toString(),
      validAfter: "0",
      validBefore: String(validBefore),
      salt,
      memo,
      recipients,
      signature,
    }),
  });
  let relay = null;
  try {
    relay = await res.json();
  } catch {
    relay = null;
  }
  if (!res.ok) {
    const err = new Error(relay?.message || `relay answered HTTP ${res.status}`);
    err.status = res.status;
    err.code = relay?.code;
    throw err;
  }
  const txHash = TX_RE.test(relay?.txHash || "") ? relay.txHash : null;
  return { from, memo, salt, nonce, signature, relay, txHash };
}

// ------------------------------------------------------------------ x402 (onchain-receipt scheme)

/**
 * Every 'onchain-receipt' offer of a 402 body, one per chain the server takes payment on, main chain
 * first: the top-level `onchainReceipt` and `onchainReceipts` fields (where the server puts them when it
 * also offers the standard `exact` scheme, so standard clients can parse `accepts`), then such entries in
 * `accepts`. Duplicates (same network, payTo and asset) are dropped. All offers of one challenge share
 * one nonce: pay on any one chain, once.
 */
export function findOnchainReceiptOffers(body) {
  const out = [];
  const seen = new Set();
  const add = (o) => {
    if (!o || typeof o !== "object" || o.scheme !== "onchain-receipt") return;
    const key = `${o.network}|${String(o.payTo).toLowerCase()}|${String(o.asset).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };
  add(body?.onchainReceipt);
  if (Array.isArray(body?.onchainReceipts)) body.onchainReceipts.forEach(add);
  if (Array.isArray(body?.accepts)) body.accepts.forEach(add);
  return out;
}

/** The first 'onchain-receipt' offer of a 402 body (the main chain), or null. */
export function findOnchainReceiptOffer(body) {
  return findOnchainReceiptOffers(body)[0] || null;
}

/**
 * Validates one 'onchain-receipt' offer and adds what paying it needs:
 *   chainId, kind ('native' | 'token'), amount (bigint, in the asset's base units), decimals, coin,
 *   method ('donate' | 'disburse' | 'disburseWithMemo'), token (address | null), memo, nonce,
 *   memo32 (bytes32 hex, disburseWithMemo only), and amountWei (native) or amountBase (token).
 * An offer from an older server (no extra.method / extra.decimals) with asset 'native' is a donate()
 * in the chain's native units (18 decimals on Arc). A token offer defaults to disburse, or
 * disburseWithMemo on Tempo with memo32 = keccak256(utf8(memo)) (a 37-byte memo does not fit bytes32).
 */
export function parseOnchainReceiptOffer(offer) {
  if (!offer || offer.scheme !== "onchain-receipt") throw new Error("not an 'onchain-receipt' offer");
  const m = /^eip155:(\d+)$/.exec(offer.network || "");
  if (!m) throw new Error(`unsupported network ${offer.network}`);
  const chainId = Number(m[1]);
  const native = offer.asset === "native";
  if (!native && !ADDRESS_RE.test(offer.asset || "")) throw new Error(`unsupported asset ${offer.asset}`);
  if (!ADDRESS_RE.test(offer.payTo || "")) throw new Error("offer has no valid payTo address");
  const extra = offer.extra || {};
  const nonce = extra.nonce;
  const memo = extra.memo;
  if (!nonce || memo !== `x402:${nonce}`) throw new Error("offer memo must be 'x402:<nonce>'");
  if (!/^\d+$/.test(String(offer.maxAmountRequired ?? ""))) throw new Error("offer has no valid maxAmountRequired");
  const amount = BigInt(offer.maxAmountRequired);
  const chain = CHAINS[chainId];
  const known = native ? null : coinByAddress(chainId, offer.asset);
  const decimals = Number.isInteger(extra.decimals) ? extra.decimals : native ? chain?.nativeDecimals ?? 18 : known?.decimals ?? 6;
  const method = extra.method || (native ? "donate" : chain?.memo32 ? "disburseWithMemo" : "disburse");
  if (native ? method !== "donate" : method !== "disburse" && method !== "disburseWithMemo") {
    throw new Error(`unsupported method ${method} for asset ${offer.asset}`);
  }
  let memo32 = null;
  if (method === "disburseWithMemo") {
    memo32 = extra.memo32 ?? utf8Hash(memo);
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(memo32))) throw new Error("offer memo32 is not bytes32");
    memo32 = String(memo32).toLowerCase();
  }
  const coinName =
    typeof extra.coin === "string" && /^[A-Za-z0-9.]{1,12}$/.test(extra.coin)
      ? extra.coin
      : native
      ? chain?.nativeSymbol || "native"
      : known?.symbol || "token";
  return {
    ...offer,
    chainId,
    kind: native ? "native" : "token",
    amount,
    decimals,
    coin: coinName,
    method,
    token: native ? null : offer.asset,
    memo,
    nonce,
    memo32,
    ...(native ? { amountWei: amount } : { amountBase: amount }),
  };
}

/** Every valid 'onchain-receipt' offer of a 402 body, parsed (see parseOnchainReceiptOffer); malformed ones are skipped. */
export function listOnchainReceiptOffers(body) {
  const out = [];
  for (const o of findOnchainReceiptOffers(body)) {
    try {
      out.push(parseOnchainReceiptOffer(o));
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Picks one 'onchain-receipt' offer from a 402 body, or throws with a clear reason. `chainId` picks the
 * offer on that chain; without it, the first offer (the server's main chain).
 */
export function pickOffer(body, { chainId } = {}) {
  if (!body || body.x402Version !== 1 || !Array.isArray(body.accepts)) throw new Error("not an x402 v1 response");
  const offers = findOnchainReceiptOffers(body);
  if (!offers.length) throw new Error("the server offers no 'onchain-receipt' payment");
  if (chainId === undefined || chainId === null) return parseOnchainReceiptOffer(offers[0]);
  const hit = offers.find((o) => o.network === `eip155:${Number(chainId)}`);
  if (!hit) throw new Error(`the server offers no 'onchain-receipt' payment on chain ${chainId} (offered: ${offers.map((o) => o.network).join(", ")})`);
  return parseOnchainReceiptOffer(hit);
}

/**
 * The transactions that pay a parsed offer, in order: [donate(memo) with value] for a native offer;
 * [approve(split, amount) on the token, disburse(amount, memo) | disburseWithMemo(amount, memo32) on
 * the split] for a token offer. The approve may be skipped when the payer's allowance already covers
 * `amount`. Each call is { step: 'donate' | 'approve' | 'disburse', to, data, value }.
 */
export function encodeOfferCalls(offer) {
  if (offer.kind === "native") return [{ step: "donate", to: offer.payTo, data: encodeDonate(offer.memo), value: offer.amount }];
  const disburse = offer.method === "disburseWithMemo" ? encodeDisburseWithMemo(offer.amount, offer.memo32) : encodeDisburse(offer.amount, offer.memo);
  return [
    { step: "approve", to: offer.token, data: encodeApprove(offer.payTo, offer.amount), value: 0n },
    { step: "disburse", to: offer.payTo, data: disburse, value: 0n },
  ];
}

// ------------------------------------------------------------------ x402 (standard `exact` scheme)

/**
 * The EVM network names of x402 v1 (the `x402` npm package 1.2.0 NetworkSchema) and their chain ids,
 * for the EIP-712 domain of an `exact` payment. Any other name (e.g. one a custom facilitator uses)
 * needs `chainIds: { name: id }`; off-the-shelf x402 clients reject such offers.
 */
export const EXACT_NETWORKS = Object.freeze({
  base: 8453,
  "base-sepolia": 84532,
  avalanche: 43114,
  "avalanche-fuji": 43113,
  polygon: 137,
  "polygon-amoy": 80002,
  sei: 1329,
  "sei-testnet": 1328,
  iotex: 4689,
  abstract: 2741,
  "abstract-testnet": 11124,
  peaq: 3338,
  story: 1514,
  educhain: 41923,
  "skale-base-sepolia": 324705682,
});

/**
 * Picks the first standard x402 `exact` offer (EIP-3009 USDC). `payTo` is where the money lands; on
 * the Token Tails cat card it is the shelter's own wallet. `chainIds` maps extra network names.
 */
export function pickExactOffer(body, chainIds = {}) {
  if (!body || body.x402Version !== 1 || !Array.isArray(body.accepts)) throw new Error("not an x402 v1 response");
  const offer = body.accepts.find((a) => a && a.scheme === "exact");
  if (!offer) throw new Error("the server offers no 'exact' payment");
  const caip = /^eip155:(\d+)$/.exec(offer.network || "");
  const chainId = caip ? Number(caip[1]) : chainIds[offer.network] ?? EXACT_NETWORKS[offer.network];
  if (!chainId) throw new Error(`unknown network ${offer.network}`);
  if (!ADDRESS_RE.test(offer.payTo || "")) throw new Error("offer has no valid payTo address");
  if (!ADDRESS_RE.test(offer.asset || "")) throw new Error("offer has no valid asset address");
  if (!offer.extra?.name || !offer.extra?.version) throw new Error("offer has no EIP-712 name and version in extra");
  if (!/^\d+$/.test(String(offer.maxAmountRequired))) throw new Error("offer has no valid maxAmountRequired");
  return { ...offer, chainId, amountBase: BigInt(offer.maxAmountRequired) };
}

/** The X-PAYMENT header of an `exact` payment: base64 of the x402 v1 PaymentPayload. */
export function encodeExactPaymentHeader({ network, signature, authorization }) {
  return toBase64(JSON.stringify({ x402Version: 1, scheme: "exact", network, payload: { signature, authorization } }));
}

/**
 * Signs an EIP-3009 TransferWithAuthorization for an `exact` offer: from the payer to offer.payTo, for
 * exactly maxAmountRequired, valid for the offer's maxTimeoutSeconds. No transaction is sent; the
 * server's facilitator settles it and pays the gas. Returns { header, authorization, signature }.
 * Sign with `provider` (EIP-1193, eth_signTypedData_v4) or `signTypedData(typedData) => signature`
 * plus `account`.
 */
export async function signExactPayment(offer, { provider, signTypedData, account, now } = {}) {
  let from = account;
  if (!from && provider) [from] = await provider.request({ method: "eth_requestAccounts" });
  if (!ADDRESS_RE.test(from || "")) throw new Error("no payer account");
  const t = Math.floor(now ?? Date.now() / 1000);
  const typedData = buildAuthorization({
    kind: "TransferWithAuthorization",
    chainId: offer.chainId,
    token: offer.asset,
    name: offer.extra.name,
    version: offer.extra.version,
    from,
    to: offer.payTo,
    value: offer.maxAmountRequired,
    validAfter: Math.max(0, t - 600),
    validBefore: t + Number(offer.maxTimeoutSeconds || 60),
    nonce: randomBytes32(),
  });
  const signature =
    typeof signTypedData === "function"
      ? await signTypedData(typedData)
      : await provider.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typedData)] });
  const authorization = typedData.message;
  return { header: encodeExactPaymentHeader({ network: offer.network, signature, authorization }), authorization, signature, typedData };
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
 * Fetches an x402-paywalled URL and pays at most once.
 *
 * Two schemes:
 *  - `exact` (standard x402): signs a USDC transferWithAuthorization straight to the offer's payTo;
 *    the server's facilitator settles it and pays the gas. Used when the server offers it, you set
 *    `maxAmountBase` (USDC base units, 6 decimals), and you pass `provider` or `signTypedData`+`account`.
 *  - `onchain-receipt` (one offer per chain the server takes; all share one nonce): pays the offer's
 *    payTo (the ShelterSplit contract) with memo 'x402:<nonce>', waits for the receipt, and retries
 *    with the X-PAYMENT header. A native offer (asset 'native', Arc: USDC is the gas coin) is one
 *    donate(memo) with value. A token offer (asset = token address; Base, Arbitrum, Avalanche, Monad
 *    USDC, Tempo pathUSD/USDC.e, Robinhood USDG/mUSDC) is approve(split, amount) on the token, then
 *    disburse(amount, memo), or disburseWithMemo(amount, memo32) on Tempo.
 *
 * Options:
 *   chainId        pay on this chain (its onchain-receipt offer; `exact` only when it is on this chain).
 *                  Without it: the first offer whose unit you capped, main chain first.
 *   maxAmountWei   spending cap for native onchain-receipt offers (native units, 18 decimals on Arc).
 *   maxAmountBase  spending cap in token base units (6 decimals for every USD coin listed in CHAINS):
 *                  `exact` and token onchain-receipt offers. At least one cap is required; an offer
 *                  whose unit has no cap is never paid.
 *   provider       an EIP-1193 provider, or
 *   pay            async ({chainId, to, valueWei, data, memo, asset, token, amount, decimals, coin,
 *                  method, memo32, calls}) => txHash (onchain-receipt), resolving after the PAYMENT tx
 *                  is mined. `calls` is encodeOfferCalls(offer): run them in order, waiting for each
 *                  (the approve may be skipped when the allowance covers `amount`), and return the hash
 *                  of the last one. `to`/`valueWei`/`data` describe that last call (donate or disburse).
 *   signTypedData  async (typedData) => signature, with `account` (exact).
 *   prefer         "exact" (default) or "onchain-receipt" when both are possible.
 *   fetch, init, retries, retryDelayMs, receiptOptions, now: as before.
 *
 * Returns { response, paid: null | {scheme, txHash?, chainId, amountWei?|amountBase?, coin?}, receipt:
 * decoded X-PAYMENT-RESPONSE | null, error?: string }. For `exact`, `paid` is null unless the server
 * answered 2xx (a refused authorization moves no money), and `error` carries the 402's reason.
 */
export async function payAndFetch(url, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function") throw new Error("payAndFetch needs a fetch function");
  if (opts.maxAmountWei === undefined && opts.maxAmountBase === undefined) {
    throw new Error("set maxAmountWei (onchain-receipt) or maxAmountBase (exact): the most you allow one call to pay");
  }
  const canSign = !!opts.provider || (typeof opts.signTypedData === "function" && !!opts.account);
  if (!canSign && typeof opts.pay !== "function") throw new Error("pass a provider or a pay callback");
  const init = opts.init || {};
  const wantChain = opts.chainId === undefined || opts.chainId === null ? null : Number(opts.chainId);

  const first = await fetchFn(url, init);
  if (first.status !== 402) return { response: first, paid: null, receipt: null };
  const body = await first.json();

  const exactOffered = Array.isArray(body?.accepts) && body.accepts.some((a) => a?.scheme === "exact");
  let exactOnChain = exactOffered;
  if (exactOffered && wantChain !== null) {
    try {
      exactOnChain = pickExactOffer(body, opts.chainIds).chainId === wantChain;
    } catch {
      exactOnChain = false;
    }
  }
  const receiptOffers = listOnchainReceiptOffers(body).filter((o) => wantChain === null || o.chainId === wantChain);
  const receiptOffered = receiptOffers.length > 0;
  const exactPossible = exactOnChain && opts.maxAmountBase !== undefined && canSign;
  const capFor = (o) => (o.kind === "native" ? opts.maxAmountWei : opts.maxAmountBase);
  const payableReceipt = receiptOffers.filter((o) => capFor(o) !== undefined);
  const useExact = exactPossible && (opts.prefer !== "onchain-receipt" || payableReceipt.length === 0);

  if (useExact) {
    const offer = pickExactOffer(body, opts.chainIds);
    const cap = BigInt(opts.maxAmountBase);
    if (offer.amountBase > cap) throw new Error(`price ${offer.amountBase} is above your cap of ${cap}`);
    const { header } = await signExactPayment(offer, opts);
    const response = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), "X-PAYMENT": header } });
    const receipt = readPaymentResponse(response);
    const ok = typeof response.ok === "boolean" ? response.ok : response.status >= 200 && response.status < 300;
    if (!ok) {
      let error = `server answered HTTP ${response.status}`;
      try {
        const refusal = await response.json();
        if (typeof refusal?.error === "string" && refusal.error) error = refusal.error;
      } catch {
        /* no JSON body */
      }
      return { response, paid: null, receipt, error };
    }
    return {
      response,
      paid: { scheme: "exact", txHash: receipt?.transaction || receipt?.txHash || null, chainId: offer.chainId, amountBase: offer.amountBase, payTo: offer.payTo },
      receipt,
    };
  }
  if (!payableReceipt.length) {
    if (receiptOffered) {
      const units = [...new Set(receiptOffers.map((o) => (o.kind === "native" ? "maxAmountWei" : "maxAmountBase")))];
      throw new Error(`set ${units.join(" or ")}: the most you allow one call to pay on ${receiptOffers.map((o) => `eip155:${o.chainId}`).join(", ")}`);
    }
    if (wantChain !== null && findOnchainReceiptOffers(body).length) pickOffer(body, { chainId: wantChain }); // throws "no offer on chain N"
    if (!findOnchainReceiptOffers(body).length && !exactOffered) throw new Error("the server offers no 'onchain-receipt' payment");
    if (findOnchainReceiptOffers(body).length) pickOffer(body); // throws the reason the offer is malformed
    throw new Error(exactOffered ? "the exact offer needs a provider or signTypedData; set maxAmountWei for onchain-receipt" : "set maxAmountWei: the most you allow one call to pay");
  }
  const offer = payableReceipt[0];
  const cap = BigInt(capFor(offer));
  if (offer.amount > cap) {
    throw new Error(
      offer.kind === "native"
        ? `price ${offer.amount} wei is above your cap of ${cap} wei`
        : `price ${offer.amount} ${offer.coin} base units is above your cap of ${cap}`
    );
  }

  const calls = encodeOfferCalls(offer);
  const last = calls[calls.length - 1];
  let txHash;
  if (typeof opts.pay === "function") {
    txHash = await opts.pay({
      chainId: offer.chainId,
      to: last.to,
      valueWei: last.value,
      data: last.data,
      memo: offer.memo,
      asset: offer.asset,
      token: offer.token,
      amount: offer.amount,
      decimals: offer.decimals,
      coin: offer.coin,
      method: offer.method,
      memo32: offer.memo32,
      calls,
    });
  } else if (offer.kind === "native") {
    ({ txHash } = await donateWithInjected(opts.provider, {
      chainId: offer.chainId,
      split: offer.payTo,
      amountWei: offer.amount,
      memo: offer.memo,
    }));
    await waitForReceipt(opts.provider, txHash, opts.receiptOptions);
  } else {
    ({ txHash } = await donateTokenWithInjected(opts.provider, {
      chainId: offer.chainId,
      split: offer.payTo,
      token: offer.token,
      amount: offer.amount,
      memo: offer.memo,
      method: offer.method,
      memo32: offer.memo32 || undefined,
      receiptOptions: opts.receiptOptions,
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

  const amountField = offer.kind === "native" ? { amountWei: offer.amount } : { amountBase: offer.amount };
  return {
    response,
    paid: { scheme: "onchain-receipt", txHash, chainId: offer.chainId, ...amountField, coin: offer.coin, asset: offer.asset },
    receipt: readPaymentResponse(response),
  };
}

function readPaymentResponse(response) {
  const raw = response?.headers?.get?.("x-payment-response");
  if (!raw) return null;
  try {
    return JSON.parse(fromBase64(raw));
  } catch {
    return null;
  }
}
