/**
 * @jest-environment jsdom
 *
 * The landing's Moon Rave callouts (hero pill and RaveSection): web only, no flag; CTA hrefs carry
 * `from`; the live line is read from the rave's own source (GET /shelter/payouts) with the rave's
 * $1 = 1 cat rule, and no number shows while unread or when the read fails; the reel follows the
 * landing reel rules; the app export drops the reel files; the footer links MOON RAVE on the web.
 */
import React from "react";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { act, render, waitFor } from "@testing-library/react";

let mockIsApp = false;
jest.mock("@/components/claims/build", () => ({ isAppBuild: () => mockIsApp }));
let mockReduced = false;
jest.mock("@/components/globe/useReducedMotion", () => ({ useReducedMotion: () => mockReduced }));
jest.mock("@/api/api", () => ({ apiUrl: "https://api.test" }));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, subtext }: { text: string; subtext?: string }) => (
    <span>
      {text} {subtext}
    </span>
  ),
}));
const mockLoadIndex = jest.fn();
jest.mock("@/components/shelter-payouts/payoutIndex", () => ({
  loadPayoutIndex: (...args: unknown[]) => mockLoadIndex(...args),
}));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/layouts/Socials", () => ({ Socials: () => null }));

import {
  formatRaveUsd,
  raveCheckoutFromStatus,
  raveTotalFromIndex,
  resetRaveLiveCache,
  toUsdMicro,
} from "@/components/landing/raveLive";
import { RAVE_PILL_HREF, RavePill } from "@/components/landing/RavePill";
import {
  RAVE_PROOF_HREF,
  RAVE_REEL,
  RAVE_SECTION_HREF,
  RAVE_SECTION_RULE,
  raveAddLine,
  RaveSection,
} from "@/components/landing/RaveSection";
import { Footer } from "@/layouts/Footer";
import type { PayoutIndex } from "@/components/shelter-payouts/payoutIndex";

const E18 = BigInt("1000000000000000000");
const usd18 = (dollars: number) => ((BigInt(Math.round(dollars * 100)) * E18) / BigInt(100)).toString();
let txn = 0;
const ev = (chainId: number, symbol: string, dollars: number, tx?: string) => ({
  chainId,
  contract: "0x" + "1".repeat(40),
  txHash: tx ?? "0x" + String(++txn).padStart(64, "0"),
  logIndex: 0,
  blockNumber: 1,
  timestamp: 1,
  shelter: "0x" + "2".repeat(40),
  kind: "token" as const,
  amount: usd18(dollars),
  decimals: 18,
  symbol,
  amount18: usd18(dollars),
  memo: "",
});
const indexOf = (events: ReturnType<typeof ev>[], count = events.length): PayoutIndex => ({
  network: "mainnet",
  contracts: [{ chainId: 5042, contract: "0x" + "1".repeat(40), indexedThrough: { block: 1, time: 1, at: null }, count }],
  events,
});

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let observerCallback: ObserverCallback | null = null;
class MockObserver {
  constructor(cb: ObserverCallback) {
    observerCallback = cb;
  }
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  takeRecords = () => [];
}
const play = jest.fn(() => Promise.resolve());
const pause = jest.fn();
const load = jest.fn();
const statusBody = { enabled: true, card: true, usdc: { enabled: true, chains: [5042] } };
const fetchMock = jest.fn();

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: load });
});

beforeEach(() => {
  observerCallback = null;
  play.mockClear();
  pause.mockClear();
  load.mockClear();
  resetRaveLiveCache();
  mockLoadIndex.mockReset();
  mockLoadIndex.mockResolvedValue(indexOf([ev(5042, "USDC", 25.75)]));
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => statusBody });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockObserver;
});

afterEach(() => {
  mockIsApp = false;
  mockReduced = false;
});

/** Reel tests do not await the live read: keep it in flight so no update lands outside act. */
const holdLiveRead = () => {
  mockLoadIndex.mockReturnValue(new Promise(() => {}));
  fetchMock.mockReturnValue(new Promise(() => {}));
};

const scrollInView = (isIntersecting: boolean) =>
  act(() => {
    observerCallback?.([{ isIntersecting }]);
  });

describe("the rave count (cat-rave's $1 = 1 cat rule)", () => {
  it("sums dollar coins on the 7 mainnets, dedupes, and counts whole dollars as cats", () => {
    const dup = "0x" + "a".repeat(64);
    const total = raveTotalFromIndex(
      indexOf([
        ev(5042, "USDC", 3.5),
        ev(5042, "EURC", 1),
        ev(8453, "USDC", 0.25, dup),
        ev(8453, "USDC", 0.25, dup), // same chainId:txHash:logIndex: counted once
        ev(4217, "pathUSD", 0.5),
        ev(4663, "USDG", 0.01),
        ev(143, "MON", 9), // gas coin: not counted
        ev(5042002, "USDC", 9), // testnet: not counted
      ])
    );
    expect(total).toEqual({ usdMicro: 5_260_000, cats: 5 });
    expect(formatRaveUsd(total!.usdMicro)).toBe("$5.26");
    expect(formatRaveUsd(1_234_567_890)).toBe("$1,234.56");
  });

  it("truncates to micro-USD and never counts bad amounts", () => {
    expect(toUsdMicro("USDC", "1999999999999")).toBe(1);
    expect(toUsdMicro("USDC", "-1")).toBeNull();
    expect(toUsdMicro("USDC", "x")).toBeNull();
    expect(toUsdMicro("ETH", usd18(1))).toBeNull();
  });

  it("is null when the index is unread or cut short", () => {
    expect(raveTotalFromIndex(null)).toBeNull();
    expect(raveTotalFromIndex(indexOf([ev(5042, "USDC", 2)], 2))).toBeNull();
  });

  it("names only the checkout ways /rave/status reports as on", () => {
    expect(raveCheckoutFromStatus(statusBody)).toEqual({ card: true, usdcArc: true });
    expect(raveCheckoutFromStatus({ enabled: false, reason: "stripe" })).toBeNull();
    expect(raveCheckoutFromStatus({ enabled: true, card: false, usdc: { enabled: true, chains: [8453] } })).toBeNull();
    expect(raveAddLine({ card: true, usdcArc: true })).toBe(
      "Anyone can add a cat for $1, by card or in USDC on Arc. Token Tails pays the full $1 out to Pink Paw on-chain."
    );
    expect(raveAddLine({ card: true, usdcArc: false })).toContain("for $1, by card.");
    expect(raveAddLine({ card: false, usdcArc: true })).toContain("for $1, in USDC on Arc.");
    expect(raveAddLine(null)).toBeNull();
  });
});

describe("RavePill (hero)", () => {
  it("links to /rave?from=landing_hero, shows a skeleton, then the live line", async () => {
    const { getByTestId, queryByTestId } = render(<RavePill />);
    expect(RAVE_PILL_HREF).toBe("/rave?from=landing_hero");
    expect(getByTestId("rave-pill").getAttribute("href")).toBe(RAVE_PILL_HREF);
    expect(getByTestId("rave-pill").textContent).toContain("Moon Rave");
    expect(getByTestId("rave-live-skeleton")).toBeTruthy();
    await waitFor(() => expect(queryByTestId("rave-live-line")).toBeTruthy());
    expect(queryByTestId("rave-live-skeleton")).toBeNull();
    expect(getByTestId("rave-live-line").textContent).toBe(
      "Token Tails has paid out $25.75 for Pink Paw on-chain · 25 cats dancing"
    );
    expect(mockLoadIndex).toHaveBeenCalledWith("mainnet", "https://api.test");
  });

  it("hides the number when the payouts could not be read", async () => {
    mockLoadIndex.mockResolvedValue(null);
    const { getByTestId, queryByTestId } = render(<RavePill />);
    await waitFor(() => expect(queryByTestId("rave-live-skeleton")).toBeNull());
    expect(queryByTestId("rave-live-line")).toBeNull();
    expect(getByTestId("rave-pill-wrap").textContent).not.toMatch(/\d/);
    // The CTA stays.
    expect(getByTestId("rave-pill").getAttribute("href")).toBe(RAVE_PILL_HREF);
  });

  it("hides the number when the read throws", async () => {
    mockLoadIndex.mockRejectedValue(new Error("down"));
    const { queryByTestId } = render(<RavePill />);
    await waitFor(() => expect(queryByTestId("rave-live-skeleton")).toBeNull());
    expect(queryByTestId("rave-live-line")).toBeNull();
  });

  it("renders nothing and reads nothing in the app build", () => {
    mockIsApp = true;
    const { container } = render(<RavePill />);
    expect(container.innerHTML).toBe("");
    expect(mockLoadIndex).not.toHaveBeenCalled();
  });
});

describe("RaveSection", () => {
  it("renders the rule, the checkout line, the live line and both links", async () => {
    const { container, getByTestId, queryByTestId } = render(<RaveSection />);
    expect(container.textContent).toContain("Dance. Save cats.");
    expect(container.textContent).toContain(RAVE_SECTION_RULE);
    expect(RAVE_SECTION_RULE).toContain("Every $1 Token Tails pays out to Pink Paw on-chain");
    expect(getByTestId("rave-section-cta").getAttribute("href")).toBe("/rave?from=landing_rave");
    expect(RAVE_SECTION_HREF).toBe("/rave?from=landing_rave");
    expect(getByTestId("rave-section-proof").getAttribute("href")).toBe(RAVE_PROOF_HREF);
    expect(container.querySelector('img[alt="Arc"]')).toBeTruthy();
    await waitFor(() => expect(queryByTestId("rave-live-line")).toBeTruthy());
    expect(getByTestId("rave-add-line").textContent).toContain("by card or in USDC on Arc");
    // No "adopt" and no claim that every rave dollar goes to the shelter (ad slots go to the treasury).
    expect(container.textContent).not.toMatch(/adopt|all proceeds|100%/i);
    expect(container.textContent).not.toContain("—");
  });

  it("hides the number and the checkout line when neither was read", async () => {
    mockLoadIndex.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { queryByTestId, getByTestId } = render(<RaveSection />);
    await waitFor(() => expect(queryByTestId("rave-live-skeleton")).toBeNull());
    expect(queryByTestId("rave-live-line")).toBeNull();
    expect(queryByTestId("rave-add-line")).toBeNull();
    expect(getByTestId("rave-section-cta")).toBeTruthy();
  });

  it("attaches no source until near the viewport, plays in view, pauses on toggle", () => {
    holdLiveRead();
    const { getByTestId } = render(<RaveSection />);
    const video = getByTestId("rave-reel") as HTMLVideoElement;
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.muted).toBe(true);
    expect(video.querySelector("source")).toBeNull();
    expect(video.getAttribute("poster")).toBe(RAVE_REEL.posterLandscape);
    scrollInView(true);
    const source = video.querySelector("source");
    expect(source?.getAttribute("src")).toBe(RAVE_REEL.landscape);
    expect(play).toHaveBeenCalled();
    act(() => getByTestId("rave-reel-toggle").click());
    expect(pause).toHaveBeenCalled();
    expect(getByTestId("rave-reel-toggle").getAttribute("aria-pressed")).toBe("true");
  });

  it("picks the portrait reel on phones", () => {
    holdLiveRead();
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const { getByTestId } = render(<RaveSection />);
      const video = getByTestId("rave-reel");
      expect(video.getAttribute("poster")).toBe(RAVE_REEL.posterPortrait);
      scrollInView(true);
      expect(video.querySelector("source")?.getAttribute("src")).toBe(RAVE_REEL.portrait);
    } finally {
      window.matchMedia = mm;
    }
  });

  it("never starts by itself under prefers-reduced-motion", () => {
    holdLiveRead();
    mockReduced = true;
    const { getByTestId } = render(<RaveSection />);
    scrollInView(true);
    expect(getByTestId("rave-reel").querySelector("source")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    act(() => getByTestId("rave-reel-toggle").click());
    expect(getByTestId("rave-reel").querySelector("source")).toBeTruthy();
  });

  it("renders nothing in the app build", () => {
    mockIsApp = true;
    expect(render(<RaveSection />).container.innerHTML).toBe("");
  });

  it("ships web-ready reel files, and the app export prunes them", () => {
    const pub = path.resolve(__dirname, "../public");
    for (const file of Object.values(RAVE_REEL)) {
      const size = fs.statSync(path.join(pub, file)).size;
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(8 * 1024 * 1024);
    }
    const script = path.resolve(__dirname, "../scripts/prune-app-export.mjs");
    const src = fs.readFileSync(script, "utf8");
    for (const file of Object.values(RAVE_REEL)) expect(src).toContain(`"${file.slice(1)}"`);

    const out = fs.mkdtempSync(path.join(os.tmpdir(), "app-export-rave-"));
    try {
      fs.mkdirSync(path.join(out, "landing", "rave"), { recursive: true });
      for (const file of Object.values(RAVE_REEL)) fs.writeFileSync(path.join(out, file), "x");
      execFileSync(process.execPath, [script, out]);
      for (const file of Object.values(RAVE_REEL)) expect(fs.existsSync(path.join(out, file))).toBe(false);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("Footer", () => {
  it("links MOON RAVE on the web and not in the app build", () => {
    const web = render(<Footer tone="night" />);
    expect(web.container.querySelector('a[href="/rave"]')?.textContent).toBe("MOON RAVE");
    web.unmount();
    mockIsApp = true;
    const app = render(<Footer tone="night" />);
    expect(app.container.querySelector('a[href="/rave"]')).toBeNull();
  });
});
