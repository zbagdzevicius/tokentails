/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

import { BUY_LABEL, CONSENT_LINE, PawlegendsStoreSheet, safeguardsText } from "@/components/pawlegends/PawlegendsStoreSheet";
import type { PawlegendsApi } from "@/components/pawlegends/checkout";

/*
 * STORE-PASS.md (founder, Nov 12): the purchase sheet has no age question and no consent box. The purchase button is
 * the consent ("Buy now · delivered instantly" with the withdrawal line under it); only its press sends
 * `consent: true`, and no age band is sent (the server applies the stored band, else the 16-17 cap).
 */

function setup() {
  const storeCheckout = jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body: { url: "https://checkout.stripe.com/c/pay/cs_test" } }));
  const api = { storeCheckout } as unknown as PawlegendsApi;
  const go = jest.fn();
  const onClose = jest.fn();
  render(<PawlegendsStoreSheet api={api} sku="pl_coat_clem_calico" label="Clem: Calico coat" cents={{ usd: 299, eur: 299 }} initialEmail="kit@example.com" go={go} onClose={onClose} />);
  return { storeCheckout, go, onClose };
}

describe("PawlegendsStoreSheet", () => {
  it("has no age question and no consent checkbox; the button and the line under it carry the consent", () => {
    setup();
    const sheet = screen.getByTestId("pawlegends-store-sheet");
    expect(sheet.querySelector('input[type="checkbox"]')).toBeNull();
    expect(sheet.querySelector('input[type="radio"]')).toBeNull();
    expect(sheet.textContent).not.toMatch(/your age|16 to 17/i);
    const buy = screen.getByTestId("pawlegends-store-buy");
    expect(buy.textContent).toContain(BUY_LABEL);
    const line = screen.getByTestId("pawlegends-store-consent-line");
    expect(line.textContent).toContain(CONSENT_LINE);
    expect(line.textContent).toContain("14-day withdrawal right ends at delivery");
    expect(line.querySelector("a")!.getAttribute("href")).toBe("/pawlegends/terms");
    expect(buy.getAttribute("aria-describedby")).toBe(line.id);
    // the line sits after the button in the sheet (under it)
    expect(buy.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("pressing the button sends consent: true and no age band, then goes to Stripe", async () => {
    const { storeCheckout, go } = setup();
    await act(async () => {
      fireEvent.click(screen.getByTestId("pawlegends-store-buy"));
    });
    expect(storeCheckout).toHaveBeenCalledTimes(1);
    const req = (storeCheckout.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(req).toMatchObject({ sku: "pl_coat_clem_calico", email: "kit@example.com", consent: true });
    expect(req).not.toHaveProperty("ageBand");
    expect(go).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("safeguards name the default cap and no under-16 line", () => {
    expect(safeguardsText("eur")).toBe("Prices include VAT. Spending limit €30 per 30 days (€200 if you told us earlier you are 18 or older).");
    expect(safeguardsText("usd")).not.toMatch(/Under 16/);
  });
});
