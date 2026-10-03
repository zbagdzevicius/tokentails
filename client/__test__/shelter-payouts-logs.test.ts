import {
  DISBURSED_TOPIC,
  NATIVE_DISBURSED_TOPIC,
  displayMemo,
  payoutUnit,
  to18,
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
      kind: "token",
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
    ).toThrow("not a Disbursed or NativeDisbursed log");
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

describe("native payouts (donate / receive)", () => {
  it("decodes NativeDisbursed as a native payout", () => {
    const d = decodeDisbursedLog(
      log(BigInt("1000000000000000000"), "heist rescue", {
        topics: [NATIVE_DISBURSED_TOPIC, "0x" + pad(SHELTER.slice(2))],
      })
    );
    expect(d.kind).toBe("native");
    expect(d.amount).toBe(BigInt("1000000000000000000"));
    expect(d.memo).toBe("heist rescue");
  });

  it("picks the unit by payout kind: Arc native USDC has 18 decimals, its ERC-20 view 6", () => {
    const arc = { decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "USDC" };
    expect(payoutUnit("token", arc)).toEqual({ decimals: 6, symbol: "USDC" });
    expect(payoutUnit("native", arc)).toEqual({ decimals: 18, symbol: "USDC" });
    expect(payoutUnit("native", { decimals: 6, symbol: "USDC" })).toEqual({ decimals: 18, symbol: "native" });
  });

  it("rescales to 18 decimals so 1 USDC native + 1 USDC ERC-20 = 2 USDC", () => {
    const total = to18(BigInt("1000000000000000000"), 18) + to18(BigInt(1000000), 6);
    expect(formatUnits(total, 18)).toBe("2");
    expect(() => to18(BigInt(1), 19)).toThrow();
  });
});

describe("displayMemo", () => {
  it("decodes a zero-padded bytes32 memo from disburseWithMemo", () => {
    const hex = "0x" + Buffer.from("tt:heist:campaign-test").toString("hex").padEnd(64, "0");
    expect(displayMemo(hex)).toBe("tt:heist:campaign-test");
  });
  it("leaves ordinary memos and non-text hex alone", () => {
    expect(displayMemo("Token Tails first payout")).toBe("Token Tails first payout");
    const bin = "0x" + "ff".repeat(32);
    expect(displayMemo(bin)).toBe(bin);
  });
});
