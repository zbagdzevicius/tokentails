/**
 * @jest-environment jsdom
 *
 * The "Motored fundraising for cats" event (Oct 2026): every gift with a `motored:` memo is Motored
 * sponsor money, labelled live with the disclosure, and never counted as separate donors, outside
 * wallets or public gifts.
 */
import React from "react";
import { render } from "@testing-library/react";
import { Disbursement } from "@/components/shelter-payouts/logs";
import {
  MOTORED_DISCLOSURE,
  isMotoredMemo,
  motoredLine,
  motoredNote,
  motoredTotal,
  usdText,
  withoutMotored,
} from "@/components/shelter-payouts/motored";
import { MotoredLine } from "@/components/shelter-payouts/MotoredLine";
import { PayoutFeed, FeedItem } from "@/components/shelter-payouts/payoutSections";
import motoredEvent from "@/public/shelter-payouts/motored-event.json";
import { TextDecoder as NodeTextDecoder } from "util";

if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = NodeTextDecoder;
}

const ARC = { name: "Arc", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "USDC", explorer: "https://explorer.arc.io" };
const ETH_CHAIN = { name: "Base", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH", explorer: "https://basescan.org" };
const PINK_PAW = "0x3c833562e682db66c2415b34961595df135f4771";
let seq = 0;
const payout = (memo: string, amount: bigint, kind: "native" | "token" = "native"): Disbursement => ({
  kind,
  contract: "0x457c89e10a6e66633eda5bf82fd086febb5db147",
  shelter: PINK_PAW,
  amount,
  memo,
  txHash: "0x" + (++seq).toString(16).padStart(64, "0"),
  blockNumber: seq,
  logIndex: 0,
});
const item = (d: Disbursement, chain = ARC): FeedItem =>
  ({ d, chain, chainName: chain.name, chainId: 5042 }) as unknown as FeedItem;
const usd18 = (dollars: string) => BigInt(Math.round(Number(dollars) * 100)) * BigInt("10000000000000000");

describe("Motored sponsor classification", () => {
  it("matches only the motored: memo prefix", () => {
    expect(isMotoredMemo("motored:user-1")).toBe(true);
    expect(isMotoredMemo("motored:user-480-final")).toBe(true);
    expect(isMotoredMemo("  MOTORED:user-9")).toBe(true);
    expect(isMotoredMemo("tt:wallet:0a1b2c3d")).toBe(false);
    expect(isMotoredMemo("gift via motored:")).toBe(false);
    expect(isMotoredMemo("motored")).toBe(false);
    expect(isMotoredMemo(undefined)).toBe(false);
  });

  it("sums Motored gifts as sponsor dollars, native and token alike, and skips non-USD coins", () => {
    const items = [
      item(payout("motored:user-1", usd18("1.50"))),
      item(payout("motored:user-2", BigInt(10_000), "token")), // 0.01 USDC at 6 decimals
      item(payout("tt:wallet:0a1b", usd18("2.00"))),
      item(payout("motored:user-3", usd18("5")), ETH_CHAIN), // native ETH: never dollars
    ];
    const total = motoredTotal(items);
    expect(total.count).toBe(2);
    expect(usdText(total.usd18)).toBe("$1.51");
  });

  it("excludes Motored gifts from any donor or public-gift view", () => {
    const items = [
      item(payout("motored:user-1", usd18("1"))),
      item(payout("motored:user-2", usd18("1"))),
      item(payout("tt:wallet:aa", usd18("1"))),
      item(payout("", usd18("1"))),
    ];
    const rest = withoutMotored(items);
    expect(rest).toHaveLength(2);
    expect(rest.every((r) => !isMotoredMemo(r.d.memo))).toBe(true);
  });

  it("says nothing before the first gift, then the founder-approved line with the disclosure", () => {
    expect(motoredLine({ usd18: BigInt(0), count: 0 })).toBeNull();
    expect(motoredLine({ usd18: usd18("1234.5"), count: 3 }, "Pink Paw")).toBe(
      "Motored fundraising for cats: $1,234.50 given to Pink Paw by Motored on behalf of its users."
    );
    expect(motoredNote(3)).toContain("never as separate donors");
    expect(motoredNote(3)).toContain(MOTORED_DISCLOSURE);
    expect(MOTORED_DISCLOSURE).toBe("Motored is linked to the Token Tails founder.");
  });
});

describe("Motored labels on /shelter-payouts", () => {
  it("renders the live line only once a Motored gift exists", () => {
    const empty = render(<MotoredLine items={[item(payout("tt:wallet:aa", usd18("1")))]} shelterName="Pink Paw" />);
    expect(empty.container.querySelector('[data-testid="motored-line"]')).toBeNull();

    const live = render(
      <MotoredLine
        items={[item(payout("motored:user-4", usd18("0.75"))), item(payout("motored:user-5", usd18("2")))]}
        shelterName="Pink Paw"
      />
    );
    const text = live.container.querySelector('[data-testid="motored-line"]')?.textContent || "";
    expect(text).toContain("Motored fundraising for cats: $2.75 given to Pink Paw by Motored on behalf of its users.");
    expect(text).toContain("Motored is linked to the Token Tails founder.");
  });

  it("tags each Motored payout in the feed and leaves other payouts untagged", () => {
    const { container } = render(
      <PayoutFeed
        items={[item(payout("motored:user-6", usd18("1"))), item(payout("tt:wallet:bb", usd18("1")))]}
        shelterName={() => "Pink Paw"}
      />
    );
    const tags = container.querySelectorAll('[data-testid="feed-motored"]');
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("Motored-sponsored");
    expect(tags[0].getAttribute("title")).toBe(MOTORED_DISCLOSURE);
  });
});

describe("public event wallet list", () => {
  it("lists 480 addresses, says how to count them, and holds no keys", () => {
    expect(motoredEvent.count).toBe(480);
    expect(motoredEvent.wallets).toHaveLength(480);
    expect(motoredEvent.countAs).toBe("sponsor");
    expect(motoredEvent.disclosure).toContain("Motored is linked to the Token Tails founder");
    const raw = JSON.stringify(motoredEvent);
    expect(raw).not.toMatch(/0x[0-9a-fA-F]{64}/);
    expect(raw.toLowerCase()).not.toContain("private");
    for (const w of motoredEvent.wallets) expect(w.address).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
