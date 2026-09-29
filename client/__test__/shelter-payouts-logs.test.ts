import {
  DISBURSED_TOPIC,
  RpcLog,
  decodeDisbursedLog,
  formatUnits,
  sumAmounts,
} from "@/components/shelter-payouts/logs";

const SHELTER = "0x1111111111111111111111111111111111111111";
const CONTRACT = "0xAbCdEf0000000000000000000000000000000001";
const TX = "0x" + "ab".repeat(32);

const pad = (hex: string) => hex.padStart(64, "0");
const padRight = (hex: string) =>
  hex.padEnd(Math.ceil(hex.length / 64) * 64 || 0, "0");

// ABI-encodes (uint256 amount, string memo) the way Solidity emits it.
function encode(amount: bigint, memo: string): string {
  const bytes = Buffer.from(memo, "utf8").toString("hex");
  return (
    "0x" +
    pad(amount.toString(16)) +
    pad((64).toString(16)) +
    pad((bytes.length / 2).toString(16)) +
    padRight(bytes)
  );
}

function log(amount: bigint, memo: string, over: Partial<RpcLog> = {}): RpcLog {
  return {
    address: CONTRACT,
    topics: [DISBURSED_TOPIC, "0x" + pad(SHELTER.slice(2))],
    data: encode(amount, memo),
    blockNumber: "0x1b4",
    transactionHash: TX,
    logIndex: "0x2",
    ...over,
  };
}

describe("decodeDisbursedLog", () => {
  it("decodes shelter, amount, memo and position", () => {
    const d = decodeDisbursedLog(log(BigInt(1500000), "October payout"));
    expect(d).toEqual({
      contract: CONTRACT.toLowerCase(),
      shelter: SHELTER,
      amount: BigInt(1500000),
      memo: "October payout",
      txHash: TX,
      blockNumber: 436,
      logIndex: 2,
    });
  });

  it("decodes a multi-word UTF-8 memo", () => {
    const memo = "Kačių prieglauda – spalio išmoka, batch #12 for the shelter";
    expect(Buffer.byteLength(memo)).toBeGreaterThan(32);
    expect(decodeDisbursedLog(log(BigInt(1), memo)).memo).toBe(memo);
  });

  it("decodes an empty memo and a uint256 above 2^53", () => {
    const big = BigInt("123456789012345678901234567890");
    const d = decodeDisbursedLog(log(big, ""));
    expect(d.memo).toBe("");
    expect(d.amount).toBe(big);
  });

  it("accepts an upper-case topic", () => {
    const l = log(BigInt(5), "x");
    l.topics[0] = "0x" + DISBURSED_TOPIC.slice(2).toUpperCase();
    expect(decodeDisbursedLog(l).amount).toBe(BigInt(5));
  });

  it("rejects other events and malformed data", () => {
    expect(() =>
      decodeDisbursedLog(log(BigInt(1), "x", { topics: ["0x" + "00".repeat(32)] }))
    ).toThrow("not a Disbursed log");
    expect(() =>
      decodeDisbursedLog(log(BigInt(1), "x", { topics: [DISBURSED_TOPIC] }))
    ).toThrow("missing the shelter topic");
    const truncated = log(BigInt(1), "a long memo that is cut off");
    truncated.data = truncated.data.slice(0, 2 + 64 * 3 + 10);
    expect(() => decodeDisbursedLog(truncated)).toThrow("truncated");
    expect(() => decodeDisbursedLog(log(BigInt(1), "x", { data: "0x1234" }))).toThrow(
      "too short"
    );
  });
});

describe("formatUnits and sumAmounts", () => {
  it("formats 6 and 18 decimal tokens", () => {
    expect(formatUnits(BigInt(1500000), 6)).toBe("1.5");
    expect(formatUnits(BigInt(1), 6)).toBe("0.000001");
    expect(formatUnits(BigInt(2000000), 6)).toBe("2");
    expect(formatUnits(BigInt("1000000000000000000"), 18)).toBe("1");
    expect(formatUnits(BigInt(0), 6)).toBe("0");
    expect(formatUnits(BigInt(42), 0)).toBe("42");
  });

  it("sums payouts", () => {
    expect(sumAmounts([])).toBe(BigInt(0));
    expect(sumAmounts([{ amount: BigInt(1) }, { amount: BigInt(2) }])).toBe(BigInt(3));
  });
});
