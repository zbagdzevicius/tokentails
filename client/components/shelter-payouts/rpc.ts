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
  verified?: boolean;
  proofTxs?: string[];
  fromBlock?: number;
  rpc?: string;
  explorer?: string;
  decimals?: number;
  symbol?: string;
}

export const DEPLOYMENTS_URL = "/shelter-payouts/deployments.json";

// Public RPCs cap eth_getLogs ranges, so a failed full-range query falls back
// to windows of this size, up to MAX_WINDOWS requests.
const WINDOW = 10_000;
const MAX_WINDOWS = 50;

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
    symbol: d.symbol || known?.symbol || "USDC",
    nativeDecimals: known?.nativeDecimals,
    nativeSymbol: known?.nativeSymbol,
  };
}

let rpcId = 0;

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
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

export async function fetchDisbursements(d: ShelterDeployment): Promise<Disbursement[]> {
  const chain = resolveChain(d);
  if (!chain) throw new Error(`no public RPC known for chain ${d.chainId}; add "rpc" and "explorer" to the entry`);
  const from = await startBlock(chain.rpc, d);

  let logs: RpcLog[];
  try {
    logs = await getLogs(chain.rpc, d.address, from, "latest");
  } catch (err) {
    const latest = parseInt(await rpcCall<string>(chain.rpc, "eth_blockNumber", []), 16);
    const windows = Math.ceil((latest - from + 1) / WINDOW);
    if (windows > MAX_WINDOWS) {
      throw new Error(`${(err as Error).message} (range of ${latest - from + 1} blocks is too large; set "fromBlock" in the entry)`);
    }
    logs = [];
    for (let start = from; start <= latest; start += WINDOW) {
      logs.push(...(await getLogs(chain.rpc, d.address, start, Math.min(start + WINDOW - 1, latest))));
    }
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
