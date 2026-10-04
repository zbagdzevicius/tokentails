import { readFileSync } from "fs";
import { join } from "path";
import { CHECKOUT_ONLY_CHAINS, chainInfoFor } from "@/components/web3/crypto/checkout";
import { addChainParams } from "@/components/shelter-payouts/wallet";

// Every network the backend checkout offers (backend/src/payments/crypto/crypto-chains.ts) must be one a
// wallet can be switched to or added with a working RPC, the right explorer and the right gas coin.
const source = readFileSync(join(__dirname, "..", "..", "backend", "src", "payments", "crypto", "crypto-chains.ts"), "utf8");
// Array.from, not spread: the client test build targets ES5 without downlevelIteration.
const backendChains = Array.from(
  source.matchAll(/chainId: (\d+),\s+key: '(\w+)',\s+name: '([^']+)',\s+testnet: (true|false),\s+explorer: '([^']+)',\s+rpcEnv: [^,]+,\s+publicRpc: '([^']+)'/g)
).map((m) => ({ chainId: Number(m[1]), key: m[2], name: m[3], testnet: m[4] === "true", explorer: m[5], rpc: m[6] }));

const option = (c: (typeof backendChains)[number]) => ({
  chainId: c.chainId,
  chainName: c.name,
  explorer: c.explorer,
  symbol: "USDC",
  decimals: 6,
  testnet: c.testnet,
});

describe("crypto checkout networks in the wallet", () => {
  it("reads every backend checkout chain", () => {
    expect(backendChains.map((c) => c.chainId)).toEqual(
      expect.arrayContaining([5042, 5042002, 8453, 84532, 42161, 421614, 43114, 43113, 4217, 42431, 4663, 46630, 143, 10143])
    );
  });

  it.each(backendChains.map((c) => [c.name, c] as const))("%s: the wallet gets the backend's RPC and explorer", (_name, c) => {
    const info = chainInfoFor(option(c));
    expect(info.rpc).toBe(c.rpc);
    expect(info.explorer).toBe(c.explorer);
    expect(!!info.testnet).toBe(c.testnet);
  });

  it("adds Robinhood Chain with ETH and Monad with MON as the gas coin", () => {
    const params = (chainId: number) => {
      const c = backendChains.find((x) => x.chainId === chainId)!;
      return addChainParams(chainId, chainInfoFor(option(c)));
    };
    expect(params(4663)).toEqual({
      chainId: "0x1237",
      chainName: "Robinhood Chain",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
    });
    expect(params(46630)).toMatchObject({
      chainId: "0xb626",
      nativeCurrency: { symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
    });
    expect(params(143)).toEqual({
      chainId: "0x8f",
      chainName: "Monad",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: ["https://rpc.monad.xyz"],
      blockExplorerUrls: ["https://monadvision.com"],
    });
    expect(params(10143)).toEqual({
      chainId: "0x279f",
      chainName: "Monad Testnet",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: ["https://testnet-rpc.monad.xyz"],
      blockExplorerUrls: ["https://testnet.monadvision.com"],
    });
  });

  it("keeps checkout-only networks to testnets the donate rail does not list", () => {
    Object.values(CHECKOUT_ONLY_CHAINS).forEach((c) => expect(c.testnet).toBe(true));
  });
});
