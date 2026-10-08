/**
 * @jest-environment jsdom
 */
import { DISBURSED_TOPIC, RpcLog } from "@/components/shelter-payouts/logs";
import { INDEX_STALE_MS, lastKnownPayoutsFor, resetPayoutIndexCache } from "@/components/shelter-payouts/payoutIndex";
import { indexedAtLabel, updatingCount, updatingText } from "@/components/shelter-payouts/payoutSections";
import { ChainCard } from "@/components/shelter-payouts/ShelterPayouts";
import { ShelterDeployment, readPayouts } from "@/components/shelter-payouts/rpc";
import { render } from "@testing-library/react";
import { TextDecoder as NodeTextDecoder } from "util";

// jsdom has no TextDecoder; the log decoder needs one for the memo.
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = NodeTextDecoder;
}

/*
 * A chain whose index is behind and whose RPC read fails keeps the index's last-known payouts and
 * totals, labelled "updating" with the indexedThrough time, instead of dropping out of the totals.
 */
const API = "https://api.test";
const SHELTER = "0x" + "e2".repeat(20);
const NOW = Date.parse("2026-10-08T12:00:00Z");
const T = Math.floor(NOW / 1000);
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
let addrSeq = 0x500;
const nextAddress = () => "0x" + (++addrSeq).toString(16).padStart(40, "0");

const event = (contract: string, block: number, amount: number, tx: number) => ({
  chainId: 42161,
  contract,
  txHash: hash(tx),
  logIndex: 0,
  blockNumber: block,
  timestamp: T - 7200,
  shelter: SHELTER,
  kind: "token",
  amount: String(amount),
  decimals: 6,
  symbol: "USDC",
  amount18: String(BigInt(amount) * BigInt("1000000000000")),
  memo: "",
});

const indexBody = (contract: string, time: number) => ({
  network: "mainnet",
  contracts: [{ chainId: 42161, contract, indexedThrough: { block: 1000, time, at: null }, count: 2 }],
  events: [event(contract, 900, 1_000_000, 1), event(contract, 950, 2_000_000, 2)],
  nextCursor: null,
});

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function rpcLog(address: string, block: number, amount: number, tx: number): RpcLog {
  const data = "0x" + BigInt(amount).toString(16).padStart(64, "0") + (64).toString(16).padStart(64, "0") + "0".repeat(64);
  return {
    address,
    topics: [DISBURSED_TOPIC, "0x" + "0".repeat(24) + SHELTER.slice(2)],
    data,
    blockNumber: "0x" + block.toString(16),
    transactionHash: hash(tx),
    logIndex: "0x0",
  };
}

/** The index answers with `index`; every chain RPC call fails unless `rpc` answers it. */
function fakeFetch(index: () => Response, rpc?: (method: string) => unknown) {
  const methods: string[] = [];
  const f = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith(API)) return index();
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    if (!rpc) throw new TypeError("Failed to fetch");
    return json(200, { jsonrpc: "2.0", id: body.id, result: rpc(body.method) });
  });
  return { f, methods };
}

describe("a busy chain keeps its indexed payouts", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    resetPayoutIndexCache();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it.each([
    ["fresh index, tail read fails", 60],
    ["index behind (stale), full read fails", INDEX_STALE_MS / 1000 + 7200],
  ])("%s: the payouts stay, marked updating, and are not cached", async (_label, age) => {
    const address = nextAddress();
    const { f, methods } = fakeFetch(() => json(200, indexBody(address, T - age)));
    global.fetch = f as unknown as typeof fetch;
    const d: ShelterDeployment = { chainId: 42161, address, network: "mainnet", tx: hash(99) };
    const read = await readPayouts(d, { indexBase: API, now: NOW });
    expect(methods.length).toBeGreaterThan(0);
    expect(read.items.map((i) => i.blockNumber)).toEqual([950, 900]);
    expect(read.items.reduce((s, i) => s + i.amount, BigInt(0))).toBe(BigInt(3_000_000));
    expect(read.updating).toEqual({ block: 1000, time: T - age });
    // An "updating" read is not cached: the next view asks the chain again.
    expect(window.sessionStorage.getItem(`tt-payouts:42161:${address}`)).toBeNull();
  });

  it("a contract the index does not list still fails when its chain fails", async () => {
    const address = nextAddress();
    const { f } = fakeFetch(() => json(200, { network: "mainnet", contracts: [], events: [], nextCursor: null }));
    global.fetch = f as unknown as typeof fetch;
    await expect(readPayouts({ chainId: 42161, address, network: "mainnet", tx: hash(99) }, { indexBase: API, now: NOW })).rejects.toThrow();
  });

  it("a stale index whose full read succeeds is complete, not updating", async () => {
    const address = nextAddress();
    const { f } = fakeFetch(
      () => json(200, indexBody(address, T - INDEX_STALE_MS / 1000 - 60)),
      (method) =>
        method === "eth_getLogs"
          ? [rpcLog(address, 900, 1_000_000, 1), rpcLog(address, 950, 2_000_000, 2), rpcLog(address, 1200, 4_000_000, 3)]
          : method === "eth_getTransactionReceipt"
            ? { blockNumber: "0x64" }
            : "0x500"
    );
    global.fetch = f as unknown as typeof fetch;
    const read = await readPayouts({ chainId: 42161, address, network: "mainnet", tx: hash(99) }, { indexBase: API, now: NOW });
    expect(read.updating).toBeUndefined();
    expect(read.items).toHaveLength(3);
  });

  it("lastKnownPayoutsFor ignores the age but still refuses a list cut short", () => {
    const address = nextAddress();
    const body = indexBody(address, T - 30 * 86400) as never as Parameters<typeof lastKnownPayoutsFor>[0];
    expect(lastKnownPayoutsFor(body, 42161, address)).toMatchObject({ through: 1000, time: T - 30 * 86400 });
    body!.contracts[0].count = 3;
    expect(lastKnownPayoutsFor(body, 42161, address)).toBeNull();
  });
});

describe("updating label on the payouts page", () => {
  it("formats the indexed time in UTC and counts the updating contracts", () => {
    expect(indexedAtLabel(T - 7200)).toBe("Oct 8, 10:00 UTC");
    expect(updatingText({ block: 1000, time: T - 7200 })).toBe(
      "Updating: payouts through Oct 8, 10:00 UTC. Newer ones may be missing; reload in a minute."
    );
    const items = [{ kind: "token" as const, contract: "c", shelter: SHELTER, amount: BigInt(1), memo: "", txHash: hash(1), blockNumber: 1, logIndex: 0 }];
    expect(
      updatingCount([0, 1, 2], {
        0: { status: "done", items, updating: { block: 1, time: T } },
        1: { status: "done", items },
        2: { status: "error", error: "x" },
      })
    ).toBe(1);
  });

  it("the chain card keeps its total and shows the subtle updating line", () => {
    const address = "0x" + "ab".repeat(20);
    const items = [
      { kind: "token" as const, contract: address, shelter: SHELTER, amount: BigInt(2_000_000), memo: "", txHash: hash(2), blockNumber: 950, logIndex: 0 },
      { kind: "token" as const, contract: address, shelter: SHELTER, amount: BigInt(1_000_000), memo: "", txHash: hash(1), blockNumber: 900, logIndex: 0 },
    ];
    const { container } = render(
      <ChainCard
        deployment={{ chainId: 42161, address, network: "mainnet" }}
        result={{ status: "done", items, updating: { block: 1000, time: T - 7200 } }}
        balance={{ status: "done", wei: BigInt(0) }}
      />
    );
    expect(container.textContent).toContain("Total paid in 2 payouts");
    expect(container.textContent).toContain("3");
    expect(container.querySelector('[data-testid="chain-card-updating"]')?.textContent).toBe(
      "Updating: payouts through Oct 8, 10:00 UTC. Newer ones may be missing; reload in a minute."
    );
  });
});
