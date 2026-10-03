/**
 * @jest-environment jsdom
 *
 * The F7.2 label sets and the app-build flag (F11 app rules): the app set has no chain words,
 * every chip kind has a label and an explanation in both sets, chip tones meet 4.5:1 on night,
 * money renders as a USD equivalent with its FX date in the app, and the build flag picks the set.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NIGHT } from "@/design/tokens";
import { isAppBuild, webImpactUrl } from "@/components/claims/build";
import { APP_LABELS, labelSet, WEB_LABELS } from "@/components/claims/labels";
import { formatMoney } from "@/components/claims/money";
import { CHIP_STYLE, TONES } from "@/components/claims/tiers";
import { moneyTierFor } from "@/components/claims/evidence";

jest.mock("@capacitor/browser", () => ({
  Browser: { open: jest.fn(async () => undefined) },
}));
jest.mock("next/dynamic", () => () => () => null);

// R10 word list (tools/copy-lint): what app strings must never contain.
const APP_BANNED =
  /USDC|0x[0-9a-f]|explorer|wallet|ON-CHAIN|\b(?:SEI|Stellar|Arc|Base|Arbitrum|Ethereum|Solana|Soroban)\b/i;

function withAppFlag<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.NEXT_PUBLIC_IS_APP;
  if (value === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
  else process.env.NEXT_PUBLIC_IS_APP = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
    else process.env.NEXT_PUBLIC_IS_APP = previous;
  }
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255
  );
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("build flag", () => {
  it("reads NEXT_PUBLIC_IS_APP at call time", () => {
    expect(withAppFlag(undefined, isAppBuild)).toBe(false);
    expect(withAppFlag("true", isAppBuild)).toBe(true);
  });

  it("picks the app label set under the app flag", () => {
    expect(withAppFlag("true", () => labelSet(isAppBuild()))).toBe(APP_LABELS);
    expect(withAppFlag(undefined, () => labelSet(isAppBuild()))).toBe(
      WEB_LABELS
    );
  });

  it("renders a Claim with the app labels when the flag is set", () => {
    const { Claim } = jest.requireActual("@/components/claims/Claim");
    withAppFlag("true", () => {
      render(
        <Claim
          id="L-disbursed"
          values={{ amount: "$2.00 · FX 2026-10-01" }}
          tier="onchain-custodial"
          liveAsOf="2026-10-01"
        />
      );
    });
    expect(screen.getByText("HELD BY TOKEN TAILS")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(APP_BANNED);
    fireEvent.click(screen.getByRole("button"));
  });

  it("links to the https web page", () => {
    expect(webImpactUrl("F-011")).toBe("https://tokentails.com/impact#F-011");
  });
});

describe("label sets", () => {
  const kinds = Object.keys(CHIP_STYLE);

  it("label and explain every chip kind in both sets", () => {
    for (const set of [WEB_LABELS, APP_LABELS]) {
      expect(Object.keys(set.chip).sort()).toEqual([...kinds].sort());
      expect(Object.keys(set.explain).sort()).toEqual([...kinds].sort());
    }
  });

  it("app labels and explanations contain no chain words", () => {
    for (const text of [
      ...Object.values(APP_LABELS.chip),
      ...Object.values(APP_LABELS.explain),
    ]) {
      expect(text).not.toMatch(APP_BANNED);
    }
    expect(APP_LABELS.chip["onchain-custodial"]).toBe("HELD BY TOKEN TAILS");
    expect(APP_LABELS.chip["onchain-shelter-held"]).toBe("HELD BY SHELTER");
  });

  it("web labels use the F7.2 tier names", () => {
    expect(WEB_LABELS.chip["onchain-custodial"]).toBe("ON-CHAIN · CUSTODIAL");
    expect(WEB_LABELS.chip["onchain-shelter-held"]).toBe(
      "ON-CHAIN · SHELTER-HELD"
    );
  });

  it("every chip tone is at least 4.5:1 on night-900 and night-800", () => {
    for (const tone of Object.values(TONES)) {
      expect(contrast(tone.text, NIGHT[900])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tone.text, NIGHT[800])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("maps custody to the on-chain tiers", () => {
    expect(moneyTierFor("held-by-token-tails")).toBe("onchain-custodial");
    expect(moneyTierFor("handed-over")).toBe("onchain-shelter-held");
  });
});

describe("money format", () => {
  const wei = "12400000000000000000";
  it("web shows the amount and its currency", () => {
    expect(formatMoney(wei, "USDC", { isApp: false })).toBe("12.40 USDC");
  });
  it("app shows a USD equivalent with its FX date, never USDC", () => {
    expect(
      formatMoney(wei, "USDC", { isApp: true, asOf: "2026-09-30T10:00:00Z" })
    ).toBe("$12.40 · FX 2026-09-30");
  });
  it("app leaves out currencies that are not USD-pegged", () => {
    expect(
      formatMoney(wei, "XLM", { isApp: true, asOf: "2026-09-30" })
    ).toBeNull();
  });
});
