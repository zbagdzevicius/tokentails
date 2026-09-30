import {
  DISBURSED_TOPIC,
  NATIVE_DISBURSED_TOPIC,
  RpcLog,
} from "@/components/shelter-payouts/logs";
import { decodeReceipt, receiptChain, RpcReceipt } from "@/components/shelter-payouts/receipt";

const SPLIT = "0x" + "cc".repeat(20);
const FAKE = "0x" + "dd".repeat(20);
const SHELTER = "0x" + "aa".repeat(20);
const TX = "0x" + "ef".repeat(32);
const pad = (h: string) => h.padStart(64, "0");

function data(amount: bigint, memo: string) {
  const hex = Buffer.from(memo, "utf8").toString("hex");
  return "0x" + pad(amount.toString(16)) + pad("40") + pad((hex.length / 2).toString(16)) +
    hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
}

function log(over: Partial<RpcLog> = {}): RpcLog {
  return {
    address: SPLIT,
    topics: [NATIVE_DISBURSED_TOPIC, "0x" + pad(SHELTER.slice(2))],
    data: data(BigInt("10000000000000000"), "tt:heist:ab12"),
    blockNumber: "0x10",
    transactionHash: TX,
    logIndex: "0x1",
    ...over,
  };
}

const receipt = (logs: RpcLog[], status = "0x1"): RpcReceipt => ({
  status,
  blockNumber: "0x10",
  transactionHash: TX,
  logs,
});

describe("decodeReceipt", () => {
  it("decodes NativeDisbursed and Disbursed logs and marks the listed contract", () => {
    const r = decodeReceipt(
      receipt([
        log(),
        log({ topics: [DISBURSED_TOPIC, "0x" + pad(SHELTER.slice(2))], data: data(BigInt(5), ""), logIndex: "0x2" }),
        log({ address: FAKE, logIndex: "0x3" }),
      ]),
      [SPLIT.toUpperCase().replace("0X", "0x")]
    );
    expect(r.success).toBe(true);
    expect(r.blockNumber).toBe(16);
    expect(r.payouts).toHaveLength(3);
    expect(r.payouts[0]).toMatchObject({
      kind: "native",
      shelter: SHELTER,
      amount: BigInt("10000000000000000"),
      memo: "tt:heist:ab12",
      listed: true,
    });
    expect(r.payouts[1]).toMatchObject({ kind: "token", amount: BigInt(5), memo: "", listed: true });
    expect(r.payouts[2].listed).toBe(false);
  });

  it("ignores other events and malformed payout logs", () => {
    const r = decodeReceipt(
      receipt([
        log({ topics: ["0x" + "12".repeat(32)] }), // e.g. NativeDisbursementBatch
        log({ data: "0x1234" }), // right topic, broken data
      ]),
      [SPLIT]
    );
    expect(r.payouts).toEqual([]);
  });

  it("reports a reverted transaction", () => {
    expect(decodeReceipt(receipt([], "0x0"), []).success).toBe(false);
  });
});

describe("receiptChain", () => {
  it("uses the built-in Arc settings", () => {
    expect(receiptChain(5042, [])).toMatchObject({
      rpc: "https://rpc.mainnet.arc.io",
      explorer: "https://explorer.arc.io",
      nativeDecimals: 18,
    });
  });

  it("lets a deployment override the explorer and rejects unknown chains", () => {
    expect(receiptChain(5042, [{ chainId: 5042, address: SPLIT, explorer: "https://x.test/" }])?.explorer).toBe(
      "https://x.test"
    );
    expect(receiptChain(999999, [])).toBeNull();
  });
});
