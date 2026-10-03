import {
  LOG_WINDOW,
  MAX_LOG_REQUESTS,
  MIN_LOG_WINDOW,
  getLogsWindowed,
} from "@/components/shelter-payouts/rpc";
import { RpcLog } from "@/components/shelter-payouts/logs";

const fakeLog = (block: number): RpcLog => ({
  address: "0x0000000000000000000000000000000000000001",
  topics: [],
  data: "0x",
  blockNumber: "0x" + block.toString(16),
  transactionHash: "0x" + "00".repeat(32),
  logIndex: "0x0",
});

// Provider that rejects ranges wider than `cap` blocks and returns one log per window start.
function provider(cap: number) {
  const calls: Array<[number, number]> = [];
  const get = async (_rpc: string, _a: string, from: number, to: number) => {
    calls.push([from, to]);
    if (to - from + 1 > cap) throw new Error("eth_getLogs: block range too large");
    return [fakeLog(from)];
  };
  return { calls, get };
}

describe("getLogsWindowed", () => {
  it("uses the default window when the provider accepts it", async () => {
    const p = provider(LOG_WINDOW);
    const logs = await getLogsWindowed("rpc", "0x", 0, 2 * LOG_WINDOW - 1, p.get);
    expect(p.calls).toEqual([
      [0, LOG_WINDOW - 1],
      [LOG_WINDOW, 2 * LOG_WINDOW - 1],
    ]);
    expect(logs).toHaveLength(2);
  });

  it("halves the window on a range error and covers every block once", async () => {
    const p = provider(3_000);
    const latest = 12_345;
    await getLogsWindowed("rpc", "0x", 100, latest, p.get);
    const ok = p.calls.filter(([f, t]) => t - f + 1 <= 3_000);
    expect(ok[0][0]).toBe(100);
    for (let i = 1; i < ok.length; i++) expect(ok[i][0]).toBe(ok[i - 1][1] + 1);
    expect(ok[ok.length - 1][1]).toBe(latest);
  });

  it("rethrows once the window is at the minimum", async () => {
    const p = provider(MIN_LOG_WINDOW - 1);
    await expect(getLogsWindowed("rpc", "0x", 0, 50_000, p.get)).rejects.toThrow("block range too large");
  });

  it("scans long ranges past the old 500k-block limit", async () => {
    const p = provider(LOG_WINDOW);
    const logs = await getLogsWindowed("rpc", "0x", 0, 1_000_000, p.get);
    expect(logs.length).toBe(Math.ceil(1_000_001 / LOG_WINDOW));
  });

  it("stops with a fromBlock hint after the request cap", async () => {
    const p = provider(MIN_LOG_WINDOW);
    await expect(
      getLogsWindowed("rpc", "0x", 0, MIN_LOG_WINDOW * (MAX_LOG_REQUESTS + 10), p.get)
    ).rejects.toThrow(/fromBlock/);
  });
});
