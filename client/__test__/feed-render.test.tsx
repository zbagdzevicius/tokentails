/**
 * @jest-environment jsdom
 *
 * The blog's rendering: directive components (cta cards with real destinations, key takeaways, the
 * live payouts widget and its failure state), the TOC scroll-spy, the reading progress maths, hub
 * search, and that every animation sits behind prefers-reduced-motion: no-preference.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PayoutIndex } from "@/components/shelter-payouts/payoutIndex";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (all: Record<string, unknown>) => {
    const props = { ...all };
    delete props.priority;
    delete props.fill;
    return <img alt="" {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

// CSS Modules: class names are their keys.
jest.mock("../components/blog/feed.module.scss", () => new Proxy({}, { get: (_t, key) => String(key) }));

const mockLoad = jest.fn();
jest.mock("@/components/shelter-payouts/payoutIndex", () => ({
  loadPayoutIndex: (...args: unknown[]) => mockLoad(...args),
}));

import { ArticleBody } from "@/components/blog/ArticleParts";
import { CtaCard } from "@/components/blog/CtaCard";
import { CTAS, ctaFor } from "@/components/blog/ctaCopy";
import { filterArticles } from "@/components/blog/FeedHub";
import { PayoutsLive } from "@/components/blog/PayoutsLive";
import { payoutTotals } from "@/components/blog/payoutTotals";
import { readProgress } from "@/components/blog/ReadingProgress";
import { activeHeading, Toc } from "@/components/blog/Toc";
import taxonomy from "@/lib/feed/taxonomy.json";
import type { FeedSummary } from "@/lib/feed/engine";

const event = (over: Partial<PayoutIndex["events"][number]> = {}): PayoutIndex["events"][number] => ({
  chainId: 5042,
  contract: "0x457c89e10a6e66633eda5bf82fd086febb5db147",
  txHash: `0x${"a".repeat(63)}${Math.floor(Math.random() * 9)}`,
  logIndex: Math.floor(Math.random() * 1e6),
  blockNumber: 1,
  timestamp: 1_760_000_000,
  shelter: "0x3c833562e682db66c2415b34961595df135f4771",
  kind: "token",
  amount: "10000",
  decimals: 6,
  symbol: "USDC",
  amount18: "10000000000000000",
  memo: "tt:treat",
  ...over,
});

const index = (events: PayoutIndex["events"], held = events.length): PayoutIndex => ({
  network: "mainnet",
  contracts: [{ chainId: 5042, contract: "0x457c89e10a6e66633eda5bf82fd086febb5db147", indexedThrough: { block: 1, time: 1, at: null }, count: held }],
  events,
});

beforeEach(() => mockLoad.mockReset());

describe("cta cards", () => {
  it("has copy and a real destination for every cta value the contract allows", () => {
    for (const key of taxonomy.ctas) {
      const def = CTAS[key];
      expect(def).toBeDefined();
      expect(def.href).toMatch(/^\/[a-z]/);
      expect(def.art.alt.length).toBeGreaterThan(5);
    }
  });

  it("links the heist card to /heist with the game art", () => {
    render(<CtaCard cta="heist" appBuild={false} />);
    const link = screen.getByRole("link", { name: /Play Catnip Heist/ });
    expect(link.getAttribute("href")).toBe("/heist");
    expect(screen.getByAltText(/two pixel cats/)).toBeTruthy();
  });

  it("uses a plain link for pages outside the Next router", () => {
    render(<CtaCard cta="rave" appBuild={false} />);
    expect(screen.getByRole("link", { name: /Join the rave/ }).getAttribute("href")).toBe("/rave");
  });

  it("never shows payment or coin cards in app builds", () => {
    for (const key of ["rave", "give", "payouts", "packs", "badcat"]) expect(ctaFor(key, true)).toBeNull();
    expect(ctaFor("heist", true)?.href).toBe("/heist");
    const { container } = render(<CtaCard cta="rave" appBuild />);
    expect(container.innerHTML).toBe("");
  });

  it("never uses banned words", () => {
    const text = Object.values(CTAS)
      .map((c) => `${c.eyebrow} ${c.title} ${c.body} ${c.button}`)
      .join(" ")
      .replace(/Token Tails/g, "");
    expect(text).not.toMatch(/\badopt|\btokens?\b|airdrop|earn money|play-to-earn|\bNFT/i);
  });
});

describe("article body", () => {
  it("renders each directive segment as its component", () => {
    mockLoad.mockReturnValue(new Promise(() => undefined));
    render(
      <ArticleBody
        segments={[
          { type: "html", html: "<p>First.</p>" },
          { type: "key-takeaways", html: "<ul><li>One point.</li></ul>" },
          { type: "cta", cta: "heist" },
          { type: "payouts-live" },
        ]}
      />
    );
    expect(screen.getByText("First.")).toBeTruthy();
    expect(screen.getByLabelText("Key takeaways").textContent).toContain("One point.");
    expect(screen.getByTestId("feed-cta-heist")).toBeTruthy();
    expect(screen.getByTestId("payouts-live-loading")).toBeTruthy();
  });
});

describe("live payouts widget", () => {
  it("totals each coin on its own and discloses Motored sponsor money", () => {
    const totals = payoutTotals(
      index([
        event({ amount18: "1500000000000000000" }),
        event({ amount18: "2000000000000000000", memo: "motored:user-1" }),
        event({ symbol: "EURC", amount18: "100000000000000000", timestamp: 1_760_000_500 }),
      ])
    );
    expect(totals).toEqual({
      coins: [
        { symbol: "USDC", amount: "3.50", count: 2 },
        { symbol: "EURC", amount: "0.10", count: 1 },
      ],
      count: 3,
      latest: 1_760_000_500,
      motored: { count: 1, usd: "$2.00" },
    });
  });

  it("shows nothing when the index is cut short", () => {
    expect(payoutTotals(index([event()], 5))).toBeNull();
    expect(payoutTotals(null)).toBeNull();
  });

  it("renders the live figures after the read", async () => {
    mockLoad.mockResolvedValue(index([event({ amount18: "92118216000000000000" }), event({ memo: "motored:user-2", amount18: "1000000000000000000" })]));
    render(<PayoutsLive appBuild={false} />);
    await waitFor(() => expect(screen.getByTestId("payouts-live-coins")).toBeTruthy());
    expect(screen.getByTestId("payouts-live-coins").textContent).toContain("93.11 USDC");
    expect(screen.getByTestId("payouts-live-motored").textContent).toMatch(/Motored is linked to the Token Tails founder/);
    expect(screen.getByRole("link", { name: /Check every payout yourself/ }).getAttribute("href")).toBe("/shelter-payouts");
  });

  it("says it could not load, and links the ledger, when the read fails", async () => {
    mockLoad.mockResolvedValue(null);
    render(<PayoutsLive appBuild={false} />);
    await waitFor(() => expect(screen.getByTestId("payouts-live-error")).toBeTruthy());
    expect(screen.getByTestId("payouts-live-error").textContent).toMatch(/Could not load the live figures/);
  });

  it("renders nothing and reads nothing in app builds", () => {
    const { container } = render(<PayoutsLive appBuild />);
    expect(container.innerHTML).toBe("");
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe("table of contents", () => {
  it("marks the last heading above the reading line", () => {
    const tops = [
      { id: "a", top: -400 },
      { id: "b", top: 100 },
      { id: "c", top: 600 },
    ];
    expect(activeHeading(tops, 140)).toBe("b");
    expect(activeHeading(tops.map((t) => ({ ...t, top: t.top + 1000 })), 140)).toBe("a");
    expect(activeHeading([], 140)).toBeNull();
  });

  it("lists the sections and hides itself with fewer than two", async () => {
    const items = [
      { id: "one", text: "One?", level: 2 as const },
      { id: "two", text: "Two", level: 3 as const },
    ];
    document.body.innerHTML = "";
    const { unmount } = render(<Toc items={items} variant="sidebar" />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = nav.querySelectorAll("a");
    expect(Array.from(links).map((a) => a.getAttribute("href"))).toEqual(["#one", "#two"]);
    await act(async () => undefined);
    unmount();
    const { container } = render(<Toc items={items.slice(0, 1)} variant="inline" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("reading progress", () => {
  it("goes from 0 at the top of the article to 1 at its end", () => {
    expect(readProgress({ top: 0, height: 3000 }, 1000)).toBe(0);
    expect(readProgress({ top: -1000, height: 3000 }, 1000)).toBe(0.5);
    expect(readProgress({ top: -5000, height: 3000 }, 1000)).toBe(1);
    expect(readProgress({ top: 200, height: 500 }, 1000)).toBe(0);
  });
});

describe("hub search", () => {
  const a = (slug: string, category: string, title: string, keywords: string[]): FeedSummary =>
    ({ slug, category, title, excerpt: "", description: "", keywords }) as unknown as FeedSummary;
  const list = [a("heist", "games", "Catnip Heist guide", ["cat stealth game"]), a("usdc", "build", "USDC splitter", ["payment splitter"])];

  it("matches every word across title, keywords and section, within a section filter", () => {
    expect(filterArticles(list, taxonomy.categories as never, "stealth cat", null).map((x) => x.slug)).toEqual(["heist"]);
    expect(filterArticles(list, taxonomy.categories as never, "build", null).map((x) => x.slug)).toEqual(["usdc"]);
    expect(filterArticles(list, taxonomy.categories as never, "", "games").map((x) => x.slug)).toEqual(["heist"]);
    expect(filterArticles(list, taxonomy.categories as never, "nothing", null)).toEqual([]);
  });
});

describe("motion", () => {
  it("animates only under prefers-reduced-motion: no-preference", () => {
    const scss = fs.readFileSync(path.join(__dirname, "../components/blog/feed.module.scss"), "utf8");
    const marker = "@media (prefers-reduced-motion: no-preference)";
    const start = scss.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = scss.indexOf("{", start); i < scss.length; i++) {
      if (scss[i] === "{") depth++;
      if (scss[i] === "}") depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    const outside = scss.slice(0, start) + scss.slice(end + 1);
    expect(outside).not.toMatch(/\banimation\s*:/);
    expect(outside).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
