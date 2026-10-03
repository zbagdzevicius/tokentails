import { deploymentToken, resolveChain } from "@/components/shelter-payouts/rpc";

const ADDR = "0x" + "ab".repeat(20);

describe("deployment payout token", () => {
  it("labels an EURC instance EURC and keeps the chain symbol for USDC instances", () => {
    expect(resolveChain({ chainId: 5042, address: ADDR, token: "EURC" })?.symbol).toBe("EURC");
    expect(resolveChain({ chainId: 5042, address: ADDR, token: "USDC" })?.symbol).toBe("USDC");
    expect(resolveChain({ chainId: 4217, address: ADDR, token: "USDC" })?.symbol).toBe("USDC.e");
    expect(resolveChain({ chainId: 5042, address: ADDR })?.symbol).toBe("USDC");
    expect(deploymentToken({ token: "eurc" })).toBe("EURC");
    expect(deploymentToken({})).toBeNull();
  });

  it("knows Monad mainnet, so a Monad deploy does not render as an RPC error", () => {
    expect(resolveChain({ chainId: 143, address: ADDR })?.name).toBe("Monad");
  });

  it("labels Robinhood Chain payouts USDG (never USDC) and knows Base", () => {
    const rh = resolveChain({ chainId: 4663, address: ADDR });
    expect(rh).toMatchObject({ name: "Robinhood Chain", decimals: 6, symbol: "USDG", nativeSymbol: "ETH", explorer: "https://robinhoodchain.blockscout.com" });
    expect(resolveChain({ chainId: 4663, address: ADDR, token: "USDG" })?.symbol).toBe("USDG");
    expect(resolveChain({ chainId: 8453, address: ADDR })).toMatchObject({ name: "Base", symbol: "USDC", decimals: 6 });
  });
});
