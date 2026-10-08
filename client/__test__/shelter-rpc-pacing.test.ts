import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import { rpcCall, setRpcClock, setRpcSleep } from "@/components/shelter-payouts/rpc";

// Arc mainnet's public RPC answers about two calls a second and refuses eth_getLogs over 10,000
// blocks (measured 2026-10-08): the payouts scan must space its calls out, or the Arc EURC card
// shows "The chain's public RPC is busy" on a normal page load.
describe("Arc mainnet RPC pacing", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    setRpcSleep((ms) => new Promise((r) => setTimeout(r, ms)));
    setRpcClock(() => Date.now());
  });

  it("knows Arc mainnet's range cap and call gap", () => {
    expect(SHELTER_CHAINS[5042].maxLogRange).toBe(10_000);
    expect(SHELTER_CHAINS[5042].minCallGapMs).toBeGreaterThanOrEqual(500);
  });

  it("waits the gap between calls to Arc mainnet, and never for other RPCs", async () => {
    let t = 1_000_000;
    const waits: number[] = [];
    setRpcClock(() => t);
    setRpcSleep(async (ms) => {
      waits.push(ms);
      t += ms;
    });
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ result: "0x1" }))) as unknown as typeof fetch;

    const arc = SHELTER_CHAINS[5042].rpc;
    const gap = SHELTER_CHAINS[5042].minCallGapMs!;
    await Promise.all([rpcCall(arc, "eth_blockNumber", []), rpcCall(arc, "eth_blockNumber", []), rpcCall(arc, "eth_blockNumber", [])]);
    // The first call goes out at once (or after a previous test's gap); the next two wait the full gap.
    expect(waits.slice(-2)).toEqual([gap, gap]);

    waits.length = 0;
    await Promise.all([rpcCall("https://other.example", "eth_blockNumber", []), rpcCall("https://other.example", "eth_blockNumber", [])]);
    expect(waits).toEqual([]);
  });

  it("spaces a 429 retry by at least the gap", async () => {
    let t = 5_000_000;
    const waits: number[] = [];
    setRpcClock(() => t);
    setRpcSleep(async (ms) => {
      waits.push(ms);
      t += ms;
    });
    const answers = [new Response("slow down", { status: 429 }), new Response(JSON.stringify({ result: "0x2" }))];
    global.fetch = jest.fn(async () => answers.shift()!) as unknown as typeof fetch;
    const gap = SHELTER_CHAINS[5042].minCallGapMs!;
    await expect(rpcCall<string>(SHELTER_CHAINS[5042].rpc, "eth_blockNumber", [])).resolves.toBe("0x2");
    // Backoff (500 ms) then whatever is left of the gap (nothing: 500 ms already passed).
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(gap);
  });
});
