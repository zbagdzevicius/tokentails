/** @jest-environment jsdom */
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import {
  CODEX_DIGITAL_PORTRAIT_USD,
  PORTRAIT_CHECKOUT_CURRENCY,
  PORTRAIT_CHECKOUT_PRICES,
  formatPortraitPrice,
} from "@/models/portrait-prices";

jest.mock("@/api/stripe-api", () => ({ STRIPE_API: {} }));
jest.mock("@/components/GoogleTagManager", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: null }) }));
jest.mock("@/features/portrait/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/portrait/components/PortraitFooter", () => ({ PortraitFooter: () => null }));
jest.mock("@/features/portrait/components/LuxuryEffects", () => ({
  LuxuryReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PreviewPage, purchaseOptions } from "@/features/portrait/components/PreviewPage";

const priceTable = readFileSync(
  join(__dirname, "..", "..", "backend", "src", "payments", "price-table.ts"),
  "utf8",
);

/** The `[ProductType.X]: n,` entries of one exported table in price-table.ts. */
function serverTable(name: string): Record<string, number> {
  const block = new RegExp(`export const ${name}[^=]*= \\{([^}]*)\\}`).exec(priceTable)?.[1] || "";
  const entries: Record<string, number> = {};
  const entry = /\[ProductType\.(\w+)\]: (\d+),/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(block))) {
    entries[match[1].toLowerCase()] = Number(match[2]);
  }
  return entries;
}

describe("portrait price copies (displayed == charged, yourcat-v2.md section 6.4)", () => {
  it("match the server card checkout table in euros", () => {
    const cents = serverTable("PORTRAIT_CHECKOUT_PRICES_CENTS");
    expect(Object.keys(cents).sort()).toEqual(["canvas", "digital", "print"]);
    expect(PORTRAIT_CHECKOUT_PRICES).toEqual({
      digital: cents.digital / 100,
      print: cents.print / 100,
      canvas: cents.canvas / 100,
    });
    expect(/PORTRAIT_CHECKOUT_CURRENCY = '(\w+)' as const/.exec(priceTable)?.[1]).toBe(
      PORTRAIT_CHECKOUT_CURRENCY.toLowerCase(),
    );
  });

  it("match the server USD digital price for the codex flow", () => {
    expect(CODEX_DIGITAL_PORTRAIT_USD).toBe(serverTable("PORTRAIT_PRICES_CENTS").digital / 100);
  });

  it("are €14 / €49 / €69 and $16", () => {
    expect(PORTRAIT_CHECKOUT_PRICES).toEqual({ digital: 14, print: 49, canvas: 69 });
    expect(CODEX_DIGITAL_PORTRAIT_USD).toBe(16);
    expect(formatPortraitPrice(14)).toBe("€14");
    expect(formatPortraitPrice(16, "USD")).toBe("$16");
    expect(formatPortraitPrice(14.5)).toBe("€14.50");
  });

  it("feed every PreviewPage purchase option", () => {
    expect(purchaseOptions.map((o) => [o.id, o.price])).toEqual([
      ["digital", 14],
      ["print", 49],
      ["canvas", 69],
    ]);
    for (const option of purchaseOptions) {
      expect(option).not.toHaveProperty("originalPrice");
    }
  });

  it("PreviewPage renders €14 / €49 / €69 with no strike-through and no timer", () => {
    const { container } = render(
      <PreviewPage generatedImages={["https://example.test/p.png"]} onRetry={jest.fn()} onBack={jest.fn()} imageId="img-1" />,
    );
    expect(screen.getByTestId("portrait-price-digital").textContent).toBe("€14");
    expect(screen.getByTestId("portrait-price-print").textContent).toBe("€49");
    expect(screen.getByTestId("portrait-price-canvas").textContent).toBe("€69");
    expect(container.querySelector(".line-through, s, del")).toBeNull();
    const text = container.textContent || "";
    expect(text).not.toMatch(/Expires in|Discount expired|\$\d/);
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("the codex Immortalize flow shows the $16 USD price", () => {
    const src = readFileSync(join(__dirname, "..", "components", "codex", "ImmortalizePetFlow.tsx"), "utf8");
    expect(src).toMatch(/const DIGITAL_PORTRAIT_PRICE = CODEX_DIGITAL_PORTRAIT_USD;/);
    expect(src).toContain('Full portrait: {formatPortraitPrice(DIGITAL_PORTRAIT_PRICE, "USD")}');
    expect(src).not.toMatch(/DIGITAL_PORTRAIT_PRICE = \d/);
  });
});
