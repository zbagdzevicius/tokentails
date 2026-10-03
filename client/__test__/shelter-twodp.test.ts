import { twoDp } from "@/components/shelter-payouts/ShelterPayouts";

describe("twoDp (headline totals)", () => {
  it("keeps two decimals at 1 and above", () => {
    expect(twoDp(BigInt("12345678000000000000"))).toBe("12.34");
    expect(twoDp(BigInt("2000000000000000000"))).toBe("2");
  });
  it("never shows a small gift as zero", () => {
    expect(twoDp(BigInt("2100000000000000"))).toBe("0.0021");
    expect(twoDp(BigInt("10000000000000000"))).toBe("0.01");
    expect(twoDp(BigInt("1"))).toBe("<0.000001");
    expect(twoDp(BigInt(0))).toBe("0");
  });
});
