import { CHAIN_ROLES, SHELTER_CHAINS, chainDisplayName, chainRole } from "@/components/shelter-payouts/chains";
import { decodeAbiString, payoutTokenAddress, TRANSFER_TOPIC } from "@/components/shelter-payouts/receipt";
import {
  MIN_LOG_WINDOW,
  deploymentToken,
  getLogsWindowed,
  isTestnetDeployment,
  rangeLimitFrom,
  resolveChain,
} from "@/components/shelter-payouts/rpc";
import { chainCount } from "@/components/shelter-payouts/ShelterPayouts";

const ADDR = "0x" + "ab".repeat(20);
const pad = (a: string) => "0x" + a.slice(2).padStart(64, "0");

describe("every target chain is readable and labelled", () => {
  it("reads the RPC's range cap from its error (Base: 1,000 and 2,000 blocks)", () => {
    expect(rangeLimitFrom(new Error("eth_getLogs: HTTP 413: eth_getLogs is limited to a 1,000 range"))).toBe(1000);
    expect(rangeLimitFrom(new Error("Block range too large for public access: maximum 1000 blocks"))).toBe(1000);
    expect(rangeLimitFrom(new Error("eth_getLogs: block range too large"))).toBeNull();
    expect(rangeLimitFrom(new Error("query exceeds max block range 100000"))).toBe(100000);
    expect(rangeLimitFrom(new Error("ranges over 10000 blocks are not supported on free plan"))).toBe(10000);
  });

  it("drops straight to the named cap and covers every block once", async () => {
    const calls: Array<[number, number]> = [];
    const get = async (_r: string, _a: string, from: number, to: number) => {
      calls.push([from, to]);
      if (to - from + 1 > 1000) throw new Error("eth_getLogs: HTTP 413: eth_getLogs is limited to a 1,000 range");
      return [];
    };
    await getLogsWindowed("rpc", "0x", 0, 4_999, get);
    expect(calls[0]).toEqual([0, 4_999]);
    const ok = calls.slice(1);
    expect(ok).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
    ]);
    expect(MIN_LOG_WINDOW).toBeLessThanOrEqual(1000);
  });

  it("starts at the chain's known cap: Base mainnet scans in 2,000-block windows", async () => {
    expect(SHELTER_CHAINS[8453].maxLogRange).toBe(500);
    const calls: Array<[number, number]> = [];
    await getLogsWindowed("rpc", "0x", 0, 3_999, async (_r, _a, f, t) => (calls.push([f, t]), []), 2000);
    expect(calls).toEqual([
      [0, 1999],
      [2000, 3999],
    ]);
  });

  it("marks testnets and names them as testnets", () => {
    for (const id of [5042002, 42431, 421614, 43113, 84532, 46630]) expect(SHELTER_CHAINS[id].testnet).toBe(true);
    for (const id of [5042, 4217, 42161, 43114, 8453, 4663]) expect(SHELTER_CHAINS[id].testnet).toBeFalsy();
    expect(chainDisplayName(SHELTER_CHAINS[43113])).toBe("Avalanche Fuji testnet");
    expect(chainDisplayName(SHELTER_CHAINS[5042002])).toBe("Arc Testnet");
    expect(chainDisplayName(SHELTER_CHAINS[8453])).toBe("Base");
    expect(isTestnetDeployment({ chainId: 84532 })).toBe(true);
    expect(isTestnetDeployment({ chainId: 8453, network: "mainnet" })).toBe(false);
    expect(resolveChain({ chainId: 84532, address: ADDR })?.testnet).toBe(true);
    // Arc testnet scans its logs on the wide-range endpoint; an entry's own rpc overrides that.
    expect(resolveChain({ chainId: 5042002, address: ADDR })).toMatchObject({ logRpc: expect.any(String), maxLogRange: 100_000 });
    expect(resolveChain({ chainId: 5042002, address: ADDR, rpc: "https://x" })?.logRpc).toBeUndefined();
  });

  it("has a role line for each of the six chains, mainnet and testnet", () => {
    for (const id of [5042, 5042002, 4217, 42431, 42161, 421614, 43114, 43113, 8453, 84532, 4663, 46630]) {
      expect(chainRole(id)).toEqual(expect.any(String));
    }
  });

  it("gives Arc's EURC split its own role line, not the dollar campaign line", () => {
    expect(chainRole(5042, "EURC")).toBe(CHAIN_ROLES.arcEurc);
    expect(chainRole(5042, "USDC")).toBe(CHAIN_ROLES.arc);
    expect(chainRole(5042)).toBe(CHAIN_ROLES.arc);
    expect(chainRole(8453, "EURC")).toBe(CHAIN_ROLES.base);
  });

  it("keeps mixed-case token symbols (pathUSD, mUSDC)", () => {
    expect(deploymentToken({ token: "pathUSD" })).toBe("pathUSD");
    expect(deploymentToken({ token: "mUSDC" })).toBe("mUSDC");
    expect(deploymentToken({ token: "eurc" })).toBe("EURC");
  });

  it("counts chains, not contracts", () => {
    expect(chainCount([{ chainId: 1 }, { chainId: 1 }, { chainId: 2 }])).toBe(2);
  });
});

describe("unlisted receipts read the token they moved", () => {
  const split = "0x937f13ce28294011567615330dbcb859a06a0bba";
  const shelter = "0x" + "c0".repeat(20);
  const eurc = "0x89b50855aa3be2f677cd6303cec089b5f319d72a";

  it("finds the Transfer from the split to the shelter", () => {
    const logs = [
      { address: eurc, topics: [TRANSFER_TOPIC, pad(ADDR), pad(split)], data: pad("0xf4240"), blockNumber: "0x1", transactionHash: "0x", logIndex: "0x0" },
      { address: eurc, topics: [TRANSFER_TOPIC, pad(split), pad(shelter)], data: pad("0xf4240"), blockNumber: "0x1", transactionHash: "0x", logIndex: "0x1" },
    ];
    expect(payoutTokenAddress({ logs }, { contract: split, shelter, amount: BigInt(1_000_000) })).toBe(eurc);
    expect(payoutTokenAddress({ logs }, { contract: split, shelter, amount: BigInt(5) })).toBeNull();
  });

  it("decodes string and bytes32 symbol() results", () => {
    const str =
      "0x" +
      "20".padStart(64, "0") +
      "4".padStart(64, "0") +
      Buffer.from("EURC").toString("hex").padEnd(64, "0");
    expect(decodeAbiString(str)).toBe("EURC");
    expect(decodeAbiString("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0"))).toBe("MKR");
    expect(decodeAbiString("0x")).toBeNull();
  });
});
