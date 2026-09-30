// Hand-rolled ABI encoding for ShelterSplit.donate(string memo), so the wallet button needs no web3
// dependency. The selector is keccak256("donate(string)")[0:4], checked in
// __test__/shelter-calldata.test.ts against @noble/hashes and against ethers' output.
export const DONATE_SELECTOR = "0xb5aebc80";

// Memos go on a public chain forever. They carry a source tag, never personal data.
export const MAX_MEMO_BYTES = 64;

const pad64 = (hex: string) => hex.padStart(64, "0");

function utf8Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// donate(string): selector, offset of the string (0x20), its byte length, then the bytes
// right-padded to a multiple of 32.
export function encodeDonateCalldata(memo: string): string {
  const bytes = utf8Hex(memo);
  const len = bytes.length / 2;
  if (len > MAX_MEMO_BYTES) throw new Error(`memo is longer than ${MAX_MEMO_BYTES} bytes`);
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return DONATE_SELECTOR + pad64("20") + pad64(len.toString(16)) + padded;
}

// Decimal wei string -> 0x quantity for JSON-RPC (no leading zeros, "0x0" for zero).
export function toQuantity(wei: bigint | string): string {
  const v = typeof wei === "bigint" ? wei : BigInt(wei);
  if (v < BigInt(0)) throw new Error("negative amount");
  return "0x" + v.toString(16);
}

// Human amount ("1.5") -> base units, e.g. parseUnits("1.5", 18). Rejects more fractional digits
// than the coin has.
export function parseUnits(amount: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!m) throw new Error(`not an amount: ${amount}`);
  const frac = m[2] || "";
  if (frac.length > decimals) throw new Error(`more than ${decimals} decimals`);
  return BigInt(m[1] + frac.padEnd(decimals, "0"));
}
