import { ChainInfo, SHELTER_CHAINS } from "./chains";
import { Disbursement, PAYOUT_TOPICS, RpcLog, decodeDisbursedLog } from "./logs";

// One entry of public/shelter-payouts/deployments.json. The file is a copy of
// funding/framework/tracks/a-build/deployments.json (written by `fund a:ingest`),
// so only chainId and address are required. The optional fields let a human
// pin the scan start block or override the built-in chain settings.
export interface ShelterDeployment {
  contract?: string;
  chain?: string;
  network?: string;
  chainId: number;
  address: string;
  tx?: string;
  // The payout token `fund a:ingest` recorded ("USDC", or "EURC" for a second instance). Only a
  // non-USDC value changes the label: USDC deployments keep the chain's own symbol (USDC.e on Tempo).
  token?: string;
  verified?: boolean;
  proofTxs?: string[];
  fromBlock?: number;
  rpc?: string;
  explorer?: string;
  decimals?: number;
  symbol?: string;
}

export const DEPLOYMENTS_URL = "/shelter-payouts/deployments.json";

// Public RPCs cap eth_getLogs ranges, so a failed full-range query falls back to
// windows. The window starts at LOG_WINDOW blocks and halves on each rejected
// request down to MIN_LOG_WINDOW; the scan stops after MAX_LOG_REQUESTS calls.
export const LOG_WINDOW = 10_000;
export const MIN_LOG_WINDOW = 2_048;
export const MAX_LOG_REQUESTS = 400;

/** A deployment's non-USDC payout token symbol (e.g. "EURC"), or null for a USDC instance. */
export function deploymentToken(d: Pick<ShelterDeployment, "token">): string | null {
  const t = typeof d.token === "string" ? d.token.trim().toUpperCase() : "";
  return t && t !== "USDC" ? t : null;
}

export function resolveChain(d: ShelterDeployment): ChainInfo | null {
  const known = SHELTER_CHAINS[d.chainId];
  const rpc = d.rpc || known?.rpc;
  const explorer = d.explorer || known?.explorer;
  if (!rpc || !explorer) return null;
  return {
    name: known?.name || d.chain || `Chain ${d.chainId}`,
    rpc,
    explorer: explorer.replace(/\/+$/, ""),
    decimals: d.decimals ?? known?.decimals ?? 6,
    symbol: d.symbol || deploymentToken(d) || known?.symbol || "USDC",
    nativeDecimals: known?.nativeDecimals,
    nativeSymbol: known?.nativeSymbol,
    balanceToken: known?.balanceToken,
  };
}

let rpcId = 0;

export async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message || "RPC error"}`);
  return body.result as T;
}

const hex = (n: number) => "0x" + n.toString(16);

async function startBlock(rpc: string, d: ShelterDeployment): Promise<number> {
  if (typeof d.fromBlock === "number") return d.fromBlock;
  if (d.tx) {
    const receipt = await rpcCall<{ blockNumber: string } | null>(rpc, "eth_getTransactionReceipt", [d.tx]);
    if (receipt?.blockNumber) return parseInt(receipt.blockNumber, 16);
  }
  return 0;
}

function getLogs(rpc: string, address: string, from: number, to: number | "latest") {
  return rpcCall<RpcLog[]>(rpc, "eth_getLogs", [
    {
      address,
      topics: [PAYOUT_TOPICS], // either event
      fromBlock: hex(from),
      toBlock: to === "latest" ? "latest" : hex(to),
    },
  ]);
}

/**
 * Scans [from, latest] in windows. A rejected window is retried at half the size, down to
 * MIN_LOG_WINDOW, so RPCs with small range caps still work. The total number of requests is
 * bounded by MAX_LOG_REQUESTS; past that the caller is told to pin "fromBlock".
 */
export async function getLogsWindowed(
  rpc: string,
  address: string,
  from: number,
  latest: number,
  get: (rpc: string, address: string, from: number, to: number) => Promise<RpcLog[]> = getLogs
): Promise<RpcLog[]> {
  const logs: RpcLog[] = [];
  let window = LOG_WINDOW;
  let requests = 0;
  let start = from;
  while (start <= latest) {
    if (++requests > MAX_LOG_REQUESTS) {
      throw new Error(
        `eth_getLogs: stopped after ${MAX_LOG_REQUESTS} requests at block ${start} of ${latest}; set "fromBlock" in the entry`
      );
    }
    const end = Math.min(start + window - 1, latest);
    try {
      logs.push(...(await get(rpc, address, start, end)));
      start = end + 1;
    } catch (err) {
      if (window <= MIN_LOG_WINDOW) throw err;
      window = Math.max(MIN_LOG_WINDOW, Math.floor(window / 2));
    }
  }
  return logs;
}

export async function fetchDisbursements(d: ShelterDeployment): Promise<Disbursement[]> {
  const chain = resolveChain(d);
  if (!chain) throw new Error(`no public RPC known for chain ${d.chainId}; add "rpc" and "explorer" to the entry`);
  const from = await startBlock(chain.rpc, d);

  let logs: RpcLog[];
  try {
    logs = await getLogs(chain.rpc, d.address, from, "latest");
  } catch {
    const latest = parseInt(await rpcCall<string>(chain.rpc, "eth_blockNumber", []), 16);
    logs = await getLogsWindowed(chain.rpc, d.address, from, latest);
  }

  return logs
    .map(decodeDisbursedLog)
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

export async function fetchDeployments(): Promise<ShelterDeployment[]> {
  const res = await fetch(DEPLOYMENTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`deployments.json: HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error("deployments.json must be a JSON array");
  return list.filter(
    (d): d is ShelterDeployment =>
      d && typeof d.chainId === "number" && /^0x[0-9a-fA-F]{40}$/.test(d.address || "")
  );
}

// The contract forwards every donation in the same call, so its native balance should stay 0.
export async function fetchNativeBalance(d: ShelterDeployment): Promise<bigint> {
  const chain = resolveChain(d);
  if (!chain) throw new Error(`no public RPC known for chain ${d.chainId}`);
  if (chain.balanceToken) {
    // balanceOf(address): selector 0x70a08231, address left-padded to 32 bytes.
    const data = "0x70a08231" + d.address.slice(2).toLowerCase().padStart(64, "0");
    return BigInt(await rpcCall<string>(chain.rpc, "eth_call", [{ to: chain.balanceToken, data }, "latest"]));
  }
  return BigInt(await rpcCall<string>(chain.rpc, "eth_getBalance", [d.address, "latest"]));
}
