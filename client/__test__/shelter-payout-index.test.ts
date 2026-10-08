import { DISBURSED_TOPIC, RpcLog } from "@/components/shelter-payouts/logs";
import {
  INDEX_STALE_MS,
  fetchPayoutIndex,
  indexedPayoutsFor,
  mergeDisbursements,
  resetPayoutIndexCache,
} from "@/components/shelter-payouts/payoutIndex";
import { ShelterDeployment, fetchDisbursements, payoutSourceOf } from "@/components/shelter-payouts/rpc";

/*
 * The payouts page reads the backend's payout index (GET /shelter/payouts) first and only the blocks
 * after its indexedThrough from the chain; a stale or unreachable index falls back to the full scan.
 */
const API = "https://api.test";
const SHELTER = "0x" + "e2".repeat(20);
const NOW = Date.parse("2026-10-08T12:00:00Z");
const T = Math.floor(NOW / 1000);
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
let addrSeq = 0;
const nextAddress = () => "0x" + (++addrSeq).toString(16).padStart(40, "0");

function rpcLog(address: string, block: number, amount: number, tx: number): RpcLog {
  const data =
    "0x" +
    BigInt(amount).toString(16).padStart(64, "0") +
    (64).toString(16).padStart(64, "0") +
    "0".repeat(64);
  return {
    address,
    topics: [DISBURSED_TOPIC, "0x" + "0".repeat(24) + SHELTER.slice(2)],
    data,
    blockNumber: "0x" + block.toString(16),
    transactionHash: hash(tx),
    logIndex: "0x0",
  };
}

const event = (contract: string, block: number, amount: number, tx: number, chainId = 42161) => ({
  chainId,
  contract,
  txHash: hash(tx),
  logIndex: 0,
  blockNumber: block,
  timestamp: T - 600,
  shelter: SHELTER,
  kind: "token",
  amount: String(amount),
  decimals: 6,
  symbol: "USDC",
  // Not `**`: the es5 target turns it into Math.pow, which throws on BigInt.
  amount18: String(BigInt(amount) * BigInt("1000000000000")),
  memo: "",
});

function indexBody(contract: string, events: ReturnType<typeof event>[], through: number, time: number, chainId = 42161) {
  return {
    network: "mainnet",
    contracts: [{ chainId, contract, indexedThrough: { block: through, time, at: null }, count: events.length }],
    events,
    nextCursor: null,
  };
}

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** A fetch that answers the index URL with `index` and JSON-RPC calls from `rpc`. */
function fakeFetch(index: (url: string) => Response | Promise<Response>, rpc: (method: string, params: unknown[]) => unknown) {
  const calls: { url: string; method?: string; params?: Array<Record<string, string>> }[] = [];
  const f = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith(API)) {
      calls.push({ url: String(url) });
      return index(String(url));
    }
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), method: body.method, params: body.params });
    return json(200, { jsonrpc: "2.0", id: body.id, result: rpc(body.method, body.params) });
  });
  return { f, calls };
}

describe("payout index", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    resetPayoutIndexCache();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("reads indexed payouts plus only the blocks after indexedThrough", async () => {
    const address = nextAddress();
    const { f, calls } = fakeFetch(
      () => json(200, indexBody(address, [event(address, 900, 1_000_000, 1), event(address, 950, 2_000_000, 2)], 1000, T - 60)),
      (method, params) => {
        if (method === "eth_getLogs") return [rpcLog(address, 1005, 3_000_000, 3)];
        if (method === "eth_blockNumber") return "0x" + (1010).toString(16);
        throw new Error(`unexpected ${method} ${JSON.stringify(params)}`);
      }
    );
    global.fetch = f as unknown as typeof fetch;
    const d: ShelterDeployment = { chainId: 42161, address, network: "mainnet", tx: hash(99) };
    const items = await fetchDisbursements(d, { indexBase: API, now: NOW });
    expect(items.map((i) => i.blockNumber)).toEqual([1005, 950, 900]);
    expect(items.reduce((s, i) => s + i.amount, BigInt(0))).toBe(BigInt(6_000_000));
    expect(items[1].timestamp).toBe(T - 600);
    const getLogs = calls.filter((c) => c.method === "eth_getLogs");
    expect(getLogs).toHaveLength(1);
    expect(getLogs[0].params![0].fromBlock).toBe("0x" + (1001).toString(16));
    // No receipt lookup: the deploy block is not needed.
    expect(calls.some((c) => c.method === "eth_getTransactionReceipt")).toBe(false);
    expect(calls.find((c) => c.url.startsWith(API))!.url).toContain("network=mainnet");
    expect(payoutSourceOf(d)).toBe("index");
  });

  it("falls back to the full chain scan when the index is stale", async () => {
    const address = nextAddress();
    const { f, calls } = fakeFetch(
      () => json(200, indexBody(address, [event(address, 900, 1, 1)], 1000, T - INDEX_STALE_MS / 1000 - 60)),
      (method) => {
        if (method === "eth_getTransactionReceipt") return { blockNumber: "0x64" };
        if (method === "eth_getLogs") return [rpcLog(address, 900, 1, 1), rpcLog(address, 1200, 5, 7)];
        if (method === "eth_blockNumber") return "0x" + (1300).toString(16);
        return null;
      }
    );
    global.fetch = f as unknown as typeof fetch;
    const d: ShelterDeployment = { chainId: 42161, address, network: "mainnet", tx: hash(99) };
    const items = await fetchDisbursements(d, { indexBase: API, now: NOW });
    expect(items.map((i) => i.blockNumber)).toEqual([1200, 900]);
    expect(calls.find((c) => c.method === "eth_getLogs")!.params![0].fromBlock).toBe("0x64");
    expect(payoutSourceOf(d)).toBe("chain");
  });

  it.each([
    ["a 409 (nothing indexed)", () => json(409, { code: "PAYOUTS_NOT_INDEXED" })],
    ["a 424 (index unreadable)", () => json(424, { code: "PAYOUTS_INDEX_UNAVAILABLE" })],
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a malformed body", () => json(200, { hello: 1 })],
  ])("falls back to the chain on %s", async (_label, answer) => {
    const address = nextAddress();
    const { f } = fakeFetch(answer, (method) => {
      if (method === "eth_getTransactionReceipt") return { blockNumber: "0x10" };
      if (method === "eth_getLogs") return [rpcLog(address, 20, 9, 11)];
      return "0x100";
    });
    global.fetch = f as unknown as typeof fetch;
    const items = await fetchDisbursements({ chainId: 42161, address, network: "mainnet", tx: hash(5) }, { indexBase: API, now: NOW });
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(BigInt(9));
  });

  it("does not ask the backend without a base URL, nor for a deployment with its own RPC", async () => {
    const address = nextAddress();
    const { f, calls } = fakeFetch(
      () => json(500, {}),
      (method) => (method === "eth_getLogs" ? [] : method === "eth_getTransactionReceipt" ? { blockNumber: "0x1" } : "0x2")
    );
    global.fetch = f as unknown as typeof fetch;
    await fetchDisbursements({ chainId: 42161, address, tx: hash(1) }, { indexBase: "", now: NOW });
    await fetchDisbursements({ chainId: 42161, address: nextAddress(), tx: hash(1), rpc: "https://own.rpc", explorer: "https://x" }, { indexBase: API, now: NOW });
    expect(calls.some((c) => c.url.startsWith(API))).toBe(false);
  });

  it("asks for testnet payouts for a testnet deployment", async () => {
    const address = nextAddress();
    const { f, calls } = fakeFetch(
      () => json(409, {}),
      (method) => (method === "eth_getLogs" ? [] : method === "eth_getTransactionReceipt" ? { blockNumber: "0x1" } : "0x2")
    );
    global.fetch = f as unknown as typeof fetch;
    await fetchDisbursements({ chainId: 421614, address, network: "testnet", tx: hash(1) }, { indexBase: API, now: NOW });
    expect(calls.find((c) => c.url.startsWith(API))!.url).toContain("network=testnet");
  });

  it("follows the page cursor and refuses a list cut short", async () => {
    const address = nextAddress();
    const pages = [
      { ...indexBody(address, [event(address, 3, 1, 3)], 10, T), nextCursor: "c1" },
      { ...indexBody(address, [event(address, 2, 1, 2), event(address, 1, 1, 1)], 10, T), nextCursor: null },
    ];
    pages[0].contracts[0].count = 3;
    let n = 0;
    const f = jest.fn(async () => json(200, pages[n++]));
    const index = await fetchPayoutIndex("mainnet", API, f as unknown as typeof fetch);
    expect(index!.events).toHaveLength(3);
    expect(String((f.mock.calls[1] as unknown[])[0])).toContain("cursor=c1");
    expect(indexedPayoutsFor(index, 42161, address, NOW)!.items).toHaveLength(3);
    // The index says 4 but holds 3: the chain is read instead.
    index!.contracts[0].count = 4;
    expect(indexedPayoutsFor(index, 42161, address, NOW)).toBeNull();
  });

  it("merges without duplicates, newest first", () => {
    const a = { kind: "token" as const, contract: "c", shelter: "s", amount: BigInt(1), memo: "", txHash: hash(1), blockNumber: 5, logIndex: 0 };
    const b = { ...a, txHash: hash(2), blockNumber: 7 };
    expect(mergeDisbursements([a], [b, { ...a, txHash: hash(1).toUpperCase().replace("0X", "0x") }]).map((x) => x.blockNumber)).toEqual([7, 5]);
  });
});
