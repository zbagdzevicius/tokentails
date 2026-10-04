/** @jest-environment jsdom */
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { LegendaryPrice } from "@/components/shared/LegendaryPrice";
import { LEGENDARY_PROMO, packPrices, packPriceUsd, PackType } from "@/models/order";

const priceTable = readFileSync(
  join(__dirname, "..", "..", "backend", "src", "payments", "price-table.ts"),
  "utf8",
);

describe("pack price copies", () => {
  it("match the server price table (list prices and the Legendary sale)", () => {
    const cents = (key: string) =>
      Number(new RegExp(`\\[PackType\\.${key}\\]: (\\d+),`).exec(priceTable)?.[1]);
    expect(packPrices[PackType.STARTER]).toBe(cents("STARTER") / 100);
    expect(packPrices[PackType.INFLUENCER]).toBe(cents("INFLUENCER") / 100);
    expect(packPrices[PackType.LEGENDARY]).toBe(cents("LEGENDARY") / 100);
    expect(LEGENDARY_PROMO.priceUsd).toBe(
      Number(/LEGENDARY_PROMO_PRICE_CENTS = (\d+);/.exec(priceTable)?.[1]) / 100,
    );
    expect(/LEGENDARY_PROMO_ENDS_AT = new Date\('([^']+)'\)/.exec(priceTable)?.[1]).toBe(
      LEGENDARY_PROMO.endsAt,
    );
  });

  it("shows $100 through 27 Nov 2026 23:59:59 UTC and $350 after", () => {
    expect(packPriceUsd(PackType.LEGENDARY, new Date("2026-11-27T23:59:59Z"))).toBe(100);
    expect(packPriceUsd(PackType.LEGENDARY, new Date("2026-11-28T00:00:00Z"))).toBe(350);
    expect(packPriceUsd(PackType.STARTER, new Date("2026-10-04T12:00:00Z"))).toBe(5);
  });

  it("renders the Legendary card as a sale while it runs", () => {
    render(<LegendaryPrice now={new Date("2026-10-04T12:00:00Z")} />);
    expect(screen.getByTestId("legendary-sale")).toBeTruthy();
    expect(screen.getByText("$350").tagName).toBe("S");
    expect(screen.getByText(/\$100/)).toBeTruthy();
    expect(screen.getByText(/until 27 nov/i)).toBeTruthy();
  });

  it("renders the regular price once the sale ended", () => {
    render(<LegendaryPrice now={new Date("2026-11-28T00:00:00Z")} />);
    expect(screen.queryByTestId("legendary-sale")).toBeNull();
    expect(screen.getByText("$350")).toBeTruthy();
  });
});
