import {
  LOG_WINDOW,
  MAX_LOG_REQUESTS,
  MIN_LOG_WINDOW,
  RATE_LIMIT_BACKOFF_MS,
  RATE_LIMIT_RETRIES,
  RpcRateLimitError,
  getLogsWindowed,
  rpcCall,
  setRpcSleep,
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

describe("rate limits", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    setRpcSleep((ms) => new Promise((r) => setTimeout(r, ms)));
  });

  const reply = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  it("retries HTTP 429 and JSON-RPC -32005 with backoff, then returns the result", async () => {
    const waits: number[] = [];
    setRpcSleep(async (ms) => {
      waits.push(ms);
    });
    const answers = [
      reply(429, {}),
      reply(200, { jsonrpc: "2.0", id: 1, error: { code: -32005, message: "rate limit exceeded" } }),
      reply(200, { jsonrpc: "2.0", id: 1, result: "0x10" }),
    ];
    global.fetch = jest.fn(async () => answers.shift()!) as unknown as typeof fetch;
    await expect(rpcCall<string>("rpc", "eth_blockNumber", [])).resolves.toBe("0x10");
    expect(waits).toEqual([RATE_LIMIT_BACKOFF_MS, RATE_LIMIT_BACKOFF_MS * 2]);
  });

  it("gives up after RATE_LIMIT_RETRIES and does not retry other errors", async () => {
    setRpcSleep(async () => undefined);
    const f = jest.fn(async () => reply(429, {}));
    global.fetch = f as unknown as typeof fetch;
    await expect(rpcCall("rpc", "eth_getLogs", [])).rejects.toBeInstanceOf(RpcRateLimitError);
    expect(f).toHaveBeenCalledTimes(RATE_LIMIT_RETRIES + 1);

    const g = jest.fn(async () => reply(200, { error: { code: -32012, message: "requested range too large" } }));
    global.fetch = g as unknown as typeof fetch;
    await expect(rpcCall("rpc", "eth_getLogs", [])).rejects.toThrow("range too large");
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("getLogsWindowed rethrows a rate limit without shrinking the window", async () => {
    const calls: Array<[number, number]> = [];
    const get = async (_r: string, _a: string, from: number, to: number) => {
      calls.push([from, to]);
      throw new RpcRateLimitError("eth_getLogs: HTTP 429");
    };
    await expect(getLogsWindowed("rpc", "0x", 0, 50_000, get)).rejects.toBeInstanceOf(RpcRateLimitError);
    expect(calls).toEqual([[0, LOG_WINDOW - 1]]);
  });
});
