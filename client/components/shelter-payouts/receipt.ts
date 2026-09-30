import { ChainInfo, SHELTER_CHAINS } from "./chains";
import { Disbursement, PAYOUT_TOPICS, RpcLog, decodeDisbursedLog } from "./logs";
import { ShelterDeployment, rpcCall } from "./rpc";

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
}

export interface DecodedReceipt {
  success: boolean;
  blockNumber: number;
  txHash: string;
  payouts: ReceiptPayout[];
}

export function decodeReceipt(receipt: RpcReceipt, listedAddresses: string[]): DecodedReceipt {
  const listed = new Set(listedAddresses.map((a) => a.toLowerCase()));
  const payouts: ReceiptPayout[] = [];
  for (const log of receipt.logs || []) {
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
  };
}

export async function fetchReceipt(
  chain: ChainInfo,
  txHash: string,
  deployments: ShelterDeployment[],
  chainId: number
): Promise<DecodedReceipt | null> {
  if (!TX_HASH.test(txHash)) throw new Error("that is not a transaction hash");
  const receipt = await rpcCall<RpcReceipt | null>(chain.rpc, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return null; // not mined yet, or not on this chain
  const listed = deployments.filter((d) => d.chainId === chainId).map((d) => d.address);
  return decodeReceipt(receipt, listed);
}
