// Pure helpers for ShelterSplit's payout events. Disbursed(address indexed shelter, uint256 amount,
// string memo) reports ERC-20 payouts (disburse, disburseWithMemo); NativeDisbursed has the same
// shape and reports native-coin payouts (donate, receive). No web3 dependency: logs come from plain
// eth_getLogs JSON-RPC calls.

// keccak256("Disbursed(address,uint256,string)"), checked against the compiled
// ShelterSplit bytecode in contracts/shelter-split/out.
export const DISBURSED_TOPIC =
  "0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a";

// keccak256("NativeDisbursed(address,uint256,string)").
export const NATIVE_DISBURSED_TOPIC =
  "0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef";

export const PAYOUT_TOPICS = [DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC];

export type PayoutKind = "token" | "native";

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export interface Disbursement {
  kind: PayoutKind;
  contract: string;
  shelter: string;
  amount: bigint;
  memo: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
}

const HEX = /^0x[0-9a-fA-F]*$/;

function strip0x(hex: string): string {
  if (!HEX.test(hex)) throw new Error(`not a hex string: ${hex}`);
  return hex.slice(2);
}

function word(data: string, index: number): string {
  const w = data.slice(index * 64, index * 64 + 64);
  if (w.length !== 64) throw new Error("log data is too short");
  return w;
}

function toSafeNumber(hexWord: string): number {
  const n = BigInt("0x" + hexWord);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("offset out of range");
  return Number(n);
}

function utf8(bytesHex: string): string {
  const bytes = new Uint8Array(bytesHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bytesHex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export function decodeDisbursedLog(log: RpcLog): Disbursement {
  const topic = log.topics?.[0]?.toLowerCase();
  if (topic !== DISBURSED_TOPIC && topic !== NATIVE_DISBURSED_TOPIC) {
    throw new Error("not a Disbursed or NativeDisbursed log");
  }
  if (log.topics.length < 2) throw new Error("Disbursed log is missing the shelter topic");
  const shelterWord = strip0x(log.topics[1]);
  if (shelterWord.length !== 64) throw new Error("bad shelter topic");
  const data = strip0x(log.data);

  // Non-indexed args, ABI encoded: amount (uint256), then the offset of memo (string).
  const amount = BigInt("0x" + word(data, 0));
  const offset = toSafeNumber(word(data, 1));
  if (offset % 32 !== 0) throw new Error("bad memo offset");
  const len = toSafeNumber(word(data, offset / 32));
  const start = offset * 2 + 64;
  const memoHex = data.slice(start, start + len * 2);
  if (memoHex.length !== len * 2) throw new Error("memo is truncated");

  return {
    kind: topic === NATIVE_DISBURSED_TOPIC ? "native" : "token",
    contract: log.address.toLowerCase(),
    shelter: "0x" + shelterWord.slice(24).toLowerCase(),
    amount,
    memo: utf8(memoHex),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    logIndex: parseInt(log.logIndex, 16),
  };
}

// Raw token units -> human string, e.g. (1500000, 6) -> "1.5".
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  // Not `**`: the es5 target turns it into Math.pow, which throws on BigInt.
  const base = BigInt("1" + "0".repeat(decimals));
  const whole = (abs / base).toString();
  const frac = decimals
    ? (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "")
    : "";
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

// Decimals and symbol a payout is denominated in: native payouts use the chain's native coin,
// token payouts the deployment's token.
export function payoutUnit(
  kind: PayoutKind,
  chain: { decimals: number; symbol: string; nativeDecimals?: number; nativeSymbol?: string }
): { decimals: number; symbol: string } {
  return kind === "native"
    ? { decimals: chain.nativeDecimals ?? 18, symbol: chain.nativeSymbol ?? "native" }
    : { decimals: chain.decimals, symbol: chain.symbol };
}

// Rescales raw units to 18 decimals so amounts of the same symbol with different decimals (Arc's
// native USDC has 18, its ERC-20 view 6) can be added together.
export function to18(amount: bigint, decimals: number): bigint {
  if (decimals > 18) throw new Error("more than 18 decimals is not supported");
  return amount * BigInt("1" + "0".repeat(18 - decimals));
}

// disburseWithMemo puts a bytes32 memo into the event's string field as 0x-hex; show it as text
// when it is printable UTF-8 padded with zero bytes, otherwise leave it as it is.
export function displayMemo(memo: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(memo)) return memo;
  const hex = memo.slice(2).replace(/(00)+$/, "");
  if (!hex.length || hex.length % 2) return memo;
  const text = utf8(hex);
  return /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(text) && !text.includes("\uFFFD") ? text : memo;
}

export function sumAmounts(items: { amount: bigint }[]): bigint {
  return items.reduce((acc, d) => acc + d.amount, BigInt(0));
}
