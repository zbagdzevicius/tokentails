import { readFileSync } from "fs";
import { join } from "path";
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import {
  decodeDisbursedLog,
  payoutUnit,
  PAYOUT_TOPICS,
  RpcLog,
  to18,
} from "@/components/shelter-payouts/logs";

/*
 * Parity (plan F7.3): this decoder, the backend indexer (backend/src/impact/shelter-logs.ts) and
 * the Heist win-screen total (catnip-heist/src/ui/payouts.ts) decode the same recorded logs in
 * shared/fixtures/shelter-logs.json to identical totals. The full paw settlement memo must
 * round-trip: never reuse the 64-character truncation of shelter-rail/src/widget.js:111.
 */

interface Fixture {
  chainId: number;
  contract: string;
  shelter: string;
  logs: RpcLog[];
  expected: {
    payoutCount: number;
    total18BySymbol: Record<string, string>;
    total18ByKind: Record<string, string>;
    rawAmounts: string[];
    memos: string[];
    pawMemo: string;
    pawMemoBytes: number;
    fromBlock: number;
    toBlock: number;
  };
}

const fixture: Fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "shared", "fixtures", "shelter-logs.json"), "utf8")
);

const isPayout = (log: RpcLog) => PAYOUT_TOPICS.includes(log.topics?.[0]?.toLowerCase());
const chain = SHELTER_CHAINS[fixture.chainId];
const payouts = fixture.logs.filter(isPayout).map(decodeDisbursedLog);

function sumBy<T>(items: T[], key: (item: T) => string, amount: (item: T) => bigint) {
  const totals: Record<string, bigint> = {};
  for (const item of items) {
    const k = key(item);
    totals[k] = (totals[k] || BigInt(0)) + amount(item);
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toString()]));
}

const amount18 = (p: (typeof payouts)[number]) => to18(p.amount, payoutUnit(p.kind, chain).decimals);

describe("ShelterSplit log parity with the backend and the Heist (shared fixture)", () => {
  it("skips the non-payout log and decodes the same raw amounts", () => {
    expect(fixture.logs).toHaveLength(fixture.expected.payoutCount + 1);
    expect(payouts).toHaveLength(fixture.expected.payoutCount);
    expect(payouts.map((p) => p.amount.toString())).toEqual(fixture.expected.rawAmounts);
  });

  it("decodes identical 18-decimal totals per symbol and per kind", () => {
    expect(sumBy(payouts, (p) => payoutUnit(p.kind, chain).symbol, amount18)).toEqual(
      fixture.expected.total18BySymbol
    );
    expect(sumBy(payouts, (p) => p.kind, amount18)).toEqual(fixture.expected.total18ByKind);
  });

  it("round-trips every memo in full, including the 85-byte paw settlement memo", () => {
    expect(payouts.map((p) => p.memo)).toEqual(fixture.expected.memos);
    const paw = payouts.find((p) => p.memo.startsWith("tt:paws:"));
    expect(paw?.memo).toBe(fixture.expected.pawMemo);
    expect(Buffer.byteLength(paw!.memo, "utf8")).toBe(fixture.expected.pawMemoBytes);
    expect(fixture.expected.pawMemoBytes).toBeGreaterThan(64);
  });

  it("reads the same shelter, contract and block range", () => {
    payouts.forEach((p) => {
      expect(p.shelter).toBe(fixture.shelter);
      expect(p.contract).toBe(fixture.contract);
    });
    expect(payouts[0].blockNumber).toBe(fixture.expected.fromBlock);
    expect(payouts[payouts.length - 1].blockNumber).toBe(fixture.expected.toBlock);
  });
});
