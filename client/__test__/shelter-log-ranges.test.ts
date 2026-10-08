import { readFileSync } from "fs";
import { join } from "path";
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";

/*
 * C2/C3 (mainnet audit 2026-10-05): every surface that scans ShelterSplit logs reads the same wide-range
 * log source per chain, so none gives up within hours (Monad's public RPC caps eth_getLogs at 100
 * blocks) or days (Tempo at < 100,000 blocks, scanned in 10,000-block windows before).
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("eth_getLogs ranges: client page, rail SDK, rail widget (both copies), Heist", () => {
  it("Tempo mainnet scans in < 100,000-block windows everywhere", () => {
    expect(SHELTER_CHAINS[4217].maxLogRange).toBe(99_999);
    expect(read("shelter-rail/src/sdk.mjs")).toMatch(/name: "Tempo",\s*rpc: "https:\/\/rpc\.tempo\.xyz",[\s\S]{0,200}maxLogRange: 99999/);
    for (const w of ["shelter-rail/src/widget.js", "client/public/rail/widget.js"]) {
      expect(read(w)).toMatch(/4217: \{ name: "Tempo", rpc: "https:\/\/rpc\.tempo\.xyz", logRange: 99999/);
    }
    expect(read("catnip-heist/src/ui/payouts.ts")).toMatch(/4217: \{ rpc: 'https:\/\/rpc\.tempo\.xyz', maxLogRange: 99_999, decimals: 6, symbol: 'USDC' \}/);
  });

  it("Monad reads logs from rpc2.monad.xyz in 10,000-block windows everywhere, not a 100-block public RPC", () => {
    // rpc.monad.xyz and rpc1.monad.xyz cap eth_getLogs at 100 blocks (re-checked 2026-10-08).
    expect(SHELTER_CHAINS[143]).toMatchObject({ logRpc: "https://rpc2.monad.xyz", maxLogRange: 10_000 });
    expect(SHELTER_CHAINS[10143].logRpc).toBe("https://monad-testnet.api.onfinality.io/public");
    const sdk = read("shelter-rail/src/sdk.mjs");
    expect(sdk).toMatch(/logRpc: "https:\/\/rpc2\.monad\.xyz",\s*maxLogRange: 10000,/);
    expect(sdk).toMatch(/logRpc: "https:\/\/monad-testnet\.api\.onfinality\.io\/public",\s*maxLogRange: 10000/);
    const widget = read("shelter-rail/src/widget.js");
    expect(widget).toBe(read("client/public/rail/widget.js"));
    expect(widget).toMatch(/143: \{ name: "Monad", rpc: "https:\/\/rpc\.monad\.xyz", logRpc: "https:\/\/rpc2\.monad\.xyz", logRange: 10000,/);
    expect(widget).toMatch(/10143: \{ name: "Monad Testnet", rpc: "[^"]+", logRpc: "https:\/\/monad-testnet\.api\.onfinality\.io\/public", logRange: 10000/);
    expect(read("catnip-heist/src/ui/payouts.ts")).toMatch(/143: \{ rpc: 'https:\/\/rpc2\.monad\.xyz', maxLogRange: 10_000,/);
    for (const f of ["shelter-rail/src/sdk.mjs", "shelter-rail/src/widget.js", "catnip-heist/src/ui/payouts.ts", "client/components/shelter-payouts/chains.ts"]) {
      expect(read(f)).not.toMatch(/(logRpc|rpc): ['"]https:\/\/rpc1\.monad\.xyz['"]/);
    }
  });
});
