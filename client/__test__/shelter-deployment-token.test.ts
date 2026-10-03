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
});
