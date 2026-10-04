import { readFileSync } from "fs";
import { join } from "path";
import { Prices } from "@/models/cats";
import { CRYPTO_PAY_ERROR_CODES } from "@/models/crypto-pay";

// The client copies of the crypto checkout contract stay equal to the backend (docs/API.md).
const backend = (file: string) => readFileSync(join(__dirname, "..", "..", "backend", "src", file), "utf8");

describe("crypto checkout contract copies", () => {
  it("shows the shelter cat at the server floor ($5)", () => {
    const cents = Number(/SHELTER_CAT_MIN_PRICE_CENTS = (\d+);/.exec(backend("payments/price-table.ts"))?.[1]);
    expect(cents).toBe(500);
    expect(Prices.shelterCat).toBe(cents / 100);
  });

  it("knows every error code the backend sends", () => {
    const source = backend("payments/crypto/crypto-checkout.service.ts");
    const block = /CRYPTO_PAY_CODES = \{([\s\S]*?)\} as const/.exec(source)?.[1] || "";
    // Array.from, not spread: the client test build targets ES5 without downlevelIteration.
    const codes = Array.from(block.matchAll(/'(CRYPTO_PAY_[A-Z_]+)'/g)).map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    expect(Array.from(CRYPTO_PAY_ERROR_CODES).sort()).toEqual(codes.slice().sort());
  });
});
