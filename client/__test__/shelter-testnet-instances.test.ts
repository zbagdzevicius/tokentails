/**
 * Testnet cards that share a chain and a coin (a redeploy) get a "Deploy k of n" label, so the
 * /shelter-payouts grid never shows two identical "Base Sepolia" cards (QA 2026-10-04).
 */
import { deployInstances } from "@/components/shelter-payouts/payoutSections";
import type { ShelterDeployment } from "@/components/shelter-payouts/rpc";

const d = (chainId: number, address: string, symbol?: string): ShelterDeployment =>
  ({ chainId, address, network: "testnet", ...(symbol ? { symbol } : {}) }) as ShelterDeployment;

describe("deployInstances", () => {
  it("numbers contracts that share a chain and a coin, oldest first; a lone one gets none", () => {
    const list = [
      d(84532, "0x01"),
      d(43113, "0x02"),
      d(84532, "0x03"),
      d(43113, "0x04"),
      d(43113, "0x05", "EURC"),
      d(5042002, "0x06"),
      d(5042002, "0x07", "EURC"),
    ];
    expect(deployInstances(list)).toEqual([
      "Deploy 1 of 2",
      "Deploy 1 of 2",
      "Deploy 2 of 2",
      "Deploy 2 of 2",
      null,
      null,
      null,
    ]);
  });

  it("is empty for an empty list", () => {
    expect(deployInstances([])).toEqual([]);
  });
});
