import { ChainInfo, SHELTER_CHAINS } from "./chains";
import { Disbursement, PAYOUT_TOPICS, RpcLog, decodeDisbursedLog } from "./logs";
import type { RouterEntry } from "./routers";
import { ShelterDeployment, deploymentToken, rpcCall } from "./rpc";

/** keccak256("RouterDonation(address,uint256,uint256,uint8,string,bytes32)"), checked against `cast keccak`.
 *  Topics: [sig, donor, batchId, nonce]; nonce is the signed EIP-3009 nonce (0 on native and flush). */
export const ROUTER_DONATION_TOPIC = "0xf057bcd6794500ca5bd0ed074e76b7ab595a7b9fdc70b87528191f50eae48a0c";

/** RouterDonation.path values. A PATH FLUSH memo is untrusted (whoever calls flush first sets it). */
export const ROUTER_PATH = { AUTH: 0, NATIVE: 1, FLUSH: 2 } as const;

/**
 * One DonateRouter gift in a receipt. `amount` is USDC base units (6) on the auth/flush paths and
 * native units (18 on Arc) on the native path. The donor address is kept off the page, and a flush
 * memo is never shown (whoever calls flush first sets it).
 */
export interface RouterGift {
  router: string;
  amount: bigint;
  batchId: bigint;
  path: number;
  /** Empty on the flush path: that memo is set by whoever called flush and is never shown. */
  memo: string;
  logIndex: number;
  /** True when the router is listed in routers.json for this chain. */
  listed: boolean;
}

export function decodeRouterDonationLog(log: RpcLog): Omit<RouterGift, "listed"> | null {
  if (log.topics?.[0]?.toLowerCase() !== ROUTER_DONATION_TOPIC || log.topics.length < 4) return null;
  const data = (log.data || "").replace(/^0x/, "");
  if (data.length < 64 * 4 || /[^0-9a-fA-F]/.test(data)) return null;
  const word = (i: number) => BigInt("0x" + data.slice(i * 64, i * 64 + 64));
  const amount = word(0);
  const path = Number(word(1));
  const offset = Number(word(2));
  if (offset % 32 !== 0 || offset * 2 + 64 > data.length) return null;
  const len = Number(BigInt("0x" + data.slice(offset * 2, offset * 2 + 64)));
  const memoHex = data.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
  if (memoHex.length !== len * 2) return null;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(memoHex.slice(i * 2, i * 2 + 2), 16);
  return {
    router: log.address.toLowerCase(),
    amount,
    batchId: BigInt(log.topics[2]),
    path,
    memo: path === ROUTER_PATH.FLUSH ? "" : new TextDecoder().decode(bytes),
    logIndex: parseInt(log.logIndex || "0x0", 16),
  };
}

// Reads one transaction receipt from the chain's public RPC and pulls out ShelterSplit's
// NativeDisbursed/Disbursed logs. Anyone can emit an event with the same shape, so each payout
// says whether it came from a ShelterSplit address listed in deployments.json.

export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export interface RpcReceipt {
  status?: string;
  blockNumber: string;
  from?: string;
  to?: string | null;
  transactionHash: string;
  logs: RpcLog[];
}

export interface ReceiptPayout extends Disbursement {
  listed: boolean;
  /**
   * The payout token's symbol when it is not the chain's default: a listed non-USDC instance
   * (e.g. "EURC"), or, for an unlisted contract, the symbol() of the token it moved in this receipt.
   */
  tokenSymbol?: string;
  /** That token's decimals, when read from the chain (unlisted contracts only). */
  tokenDecimals?: number;
}

export interface DecodedReceipt {
  success: boolean;
  blockNumber: number;
  txHash: string;
  payouts: ReceiptPayout[];
  /** DonateRouter gifts in this transaction (empty for a treat or a plain split payout). */
  gifts: RouterGift[];
}

export function decodeReceipt(
  receipt: RpcReceipt,
  listedAddresses: string[],
  listedRouters: string[] = []
): DecodedReceipt {
  const listed = new Set(listedAddresses.map((a) => a.toLowerCase()));
  const routers = new Set(listedRouters.map((a) => a.toLowerCase()));
  const payouts: ReceiptPayout[] = [];
  const gifts: RouterGift[] = [];
  for (const log of receipt.logs || []) {
    const gift = decodeRouterDonationLog(log);
    if (gift) {
      gifts.push({ ...gift, listed: routers.has(gift.router) });
      continue;
    }
    const topic = log.topics?.[0]?.toLowerCase();
    if (!topic || !PAYOUT_TOPICS.includes(topic)) continue;
    try {
      const d = decodeDisbursedLog({
        ...log,
        // Receipt logs carry these too, but fall back to the receipt's own fields.
        blockNumber: log.blockNumber || receipt.blockNumber,
        transactionHash: log.transactionHash || receipt.transactionHash,
      });
      payouts.push({ ...d, listed: listed.has(d.contract) });
    } catch {
      // A malformed log with a matching topic is not a ShelterSplit payout; skip it.
    }
  }
  return {
    success: receipt.status === "0x1",
    blockNumber: parseInt(receipt.blockNumber, 16),
    txHash: receipt.transactionHash,
    payouts,
    gifts,
  };
}

// Chain settings for a receipt: a deployments.json entry on that chain can override the built-in
// RPC and explorer, as on the payouts page.
export function receiptChain(chainId: number, deployments: ShelterDeployment[]): ChainInfo | null {
  const known = SHELTER_CHAINS[chainId];
  const d = deployments.find((x) => x.chainId === chainId);
  const rpc = d?.rpc || known?.rpc;
  const explorer = (d?.explorer || known?.explorer || "").replace(/\/+$/, "");
  if (!rpc || !explorer) return null;
  return {
    name: known?.name || d?.chain || `Chain ${chainId}`,
    rpc,
    explorer,
    decimals: d?.decimals ?? known?.decimals ?? 6,
    symbol: d?.symbol || known?.symbol || "USDC",
    nativeDecimals: known?.nativeDecimals,
    nativeSymbol: known?.nativeSymbol,
    testnet: !!known?.testnet || d?.network === "testnet",
  };
}

// keccak256("Transfer(address,address,uint256)").
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const topicAddress = (t: string | undefined) => (t && t.length === 66 ? "0x" + t.slice(26).toLowerCase() : "");

/** The ERC-20 a token payout moved: the Transfer from the split contract to the shelter in the same receipt. */
export function payoutTokenAddress(
  receipt: Pick<RpcReceipt, "logs">,
  p: Pick<ReceiptPayout, "contract" | "shelter" | "amount">
): string | null {
  for (const log of receipt.logs || []) {
    if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    if (topicAddress(log.topics[1]) !== p.contract || topicAddress(log.topics[2]) !== p.shelter) continue;
    try {
      if (BigInt(log.data) !== p.amount) continue;
    } catch {
      continue;
    }
    return log.address.toLowerCase();
  }
  return null;
}

/** An ABI-encoded string return value (or a bytes32 one, as some old tokens use), or null. */
export function decodeAbiString(hex: string): string | null {
  const data = (hex || "").replace(/^0x/, "");
  if (!data || /[^0-9a-fA-F]/.test(data)) return null;
  const bytesToText = (h: string) => {
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder().decode(bytes);
  };
  if (data.length === 64) {
    const t = bytesToText(data.replace(/(00)+$/, ""));
    return t || null;
  }
  if (data.length < 128) return null;
  const offset = Number(BigInt("0x" + data.slice(0, 64)));
  const len = Number(BigInt("0x" + data.slice(offset * 2, offset * 2 + 64)));
  const body = data.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
  if (body.length !== len * 2) return null;
  return bytesToText(body) || null;
}

/** symbol() and decimals() of a token, read over the public RPC; null when either read fails. */
async function readTokenMeta(rpc: string, token: string): Promise<{ symbol: string; decimals: number } | null> {
  try {
    const [sym, dec] = await Promise.all([
      rpcCall<string>(rpc, "eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]),
      rpcCall<string>(rpc, "eth_call", [{ to: token, data: "0x313ce567" }, "latest"]),
    ]);
    const symbol = decodeAbiString(sym);
    const decimals = Number(BigInt(dec));
    if (!symbol || !/^[\x20-\x7E]{1,16}$/.test(symbol) || !Number.isInteger(decimals) || decimals > 18) return null;
    return { symbol, decimals };
  } catch {
    return null;
  }
}

export async function fetchReceipt(
  chain: ChainInfo,
  txHash: string,
  deployments: ShelterDeployment[],
  chainId: number,
  routers: RouterEntry[] = []
): Promise<DecodedReceipt | null> {
  if (!TX_HASH.test(txHash)) throw new Error("that is not a transaction hash");
  const receipt = await rpcCall<RpcReceipt | null>(chain.rpc, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return null; // not mined yet, or not on this chain
  const onChain = deployments.filter((d) => d.chainId === chainId);
  const decoded = decodeReceipt(
    receipt,
    onChain.map((d) => d.address),
    routers.filter((r) => r.chainId === chainId).map((r) => r.router)
  );
  for (const p of decoded.payouts) {
    const d = onChain.find((x) => x.address.toLowerCase() === p.contract);
    const token = d ? deploymentToken(d) : null;
    if (token) p.tokenSymbol = token;
    // Not a listed contract: never guess the chain's default token (an EURC payout is not USDC).
    // Read the token it actually moved in this transaction instead.
    if (!d && p.kind === "token") {
      const address = payoutTokenAddress(receipt, p);
      const meta = address ? await readTokenMeta(chain.rpc, address) : null;
      if (meta) {
        p.tokenSymbol = meta.symbol;
        p.tokenDecimals = meta.decimals;
      } else {
        p.tokenSymbol = "base units";
      }
    }
  }
  return decoded;
}

/** The memo Token Tails' match carries: `tt:match:` and hex 2..10 of the donor's transaction hash. */
export const matchMemoFor = (donorTx: string) => `tt:match:${donorTx.slice(2, 10).toLowerCase()}`;

/**
 * Reads a match transaction from the chain instead of trusting the backend's word: it must have
 * succeeded and paid at least one listed ShelterSplit payout whose memo names the donor's transaction.
 */
export function isVerifiedMatch(match: DecodedReceipt | null, donorTx: string): boolean {
  if (!match || !match.success) return false;
  const memo = matchMemoFor(donorTx);
  return match.payouts.some((p) => p.listed && p.memo === memo);
}
