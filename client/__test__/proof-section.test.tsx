/**
 * @jest-environment jsdom
 *
 * Covers the I/O matrix of spec-landing-proof-section: content guard, video
 * attributes, marquee duplication, lazy motion-aware playback, reduced motion,
 * asset integrity, and overflow containment.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import fs from "fs";
import path from "path";

jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
}));
jest.mock("@capacitor/browser", () => ({ Browser: { open: jest.fn() } }));
jest.mock("next/dynamic", () => () => () => null);

import {
  DECK_MEDIA_BASE,
  OUTCOMES_ID,
  PARIS_VIDEO,
  ProofSection,
  railDeployed,
  REELS,
} from "@/components/landing/ProofSection";
import { FACTS } from "@/lib/facts.generated";
import { RAIL_LINE_COPY } from "@/features/portrait/components/AboutUsModal";
import { normalizeImpact } from "@/api/impact-api";
import baseline from "@/public/impact/snapshot.json";

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const HEADLINE_1 = "Cat lovers, meet real shelter cats.";
const HEADLINE_2 =
  "Cat influencers + creators. Then the fun moves into the game.";

/** tools/copy-lint/fixtures/seed/ProofSection.after.tsx: the Paris line that must pass. */
const PARIS_AFTER =
  "We hosted a curated day at a Paris cat café: cozy atmosphere and real shelter cats.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test patches any snapshot field
const snapshot = (patch: (s: Record<string, any>) => void = () => {}) => {
  const raw = JSON.parse(JSON.stringify(baseline));
  patch(raw);
  return normalizeImpact(raw)!;
};

// The deck's chain partner must never appear on the site. The pattern is
// spelled with a character class so a repo-wide grep for the banned word stays
// silent while the assertion still matches it case-insensitively.
const BANNED_PARTNER = /m[a]ntle/i;

// jsdom has no IntersectionObserver and no media playback. The observer stub
// records the callback so tests can fire intersection entries by hand; play and
// pause are replaced with resolved mocks.
type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: ObserverCallback | null = null;
const observe = jest.fn();
const disconnect = jest.fn();

class IntersectionObserverStub {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  unobserve = jest.fn();
  disconnect = disconnect;
  takeRecords = () => [];
}

const playMock = jest.fn(() => Promise.resolve());
const pauseMock = jest.fn();

let reducedMotion = false;
const matchMediaMock = jest.fn((query: string) => ({
  matches: query.includes("prefers-reduced-motion") && reducedMotion,
  media: query,
  onchange: null,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, "IntersectionObserver", {
    value: IntersectionObserverStub,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global, "IntersectionObserver", {
    value: IntersectionObserverStub,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: matchMediaMock,
    configurable: true,
    writable: true,
  });
  jest
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockImplementation(playMock as unknown as () => Promise<void>);
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pauseMock);
});

beforeEach(() => {
  observerCallback = null;
  reducedMotion = false;
});

function intersect(isIntersecting: boolean) {
  expect(observerCallback).not.toBeNull();
  act(() => {
    observerCallback!([{ isIntersecting }]);
  });
}

function allVideos(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLVideoElement>("video"));
}


describe("content", () => {
  it("renders both headlines and the cited reach claims", () => {
    const { container } = render(<ProofSection />);
    const headings = Array.from(container.querySelectorAll("h2")).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual([HEADLINE_1, HEADLINE_2]);

    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Off-screen too · Paris");
    expect(text).toContain("Our reach");
    expect(text).toContain(PARIS_AFTER);
    // Each figure comes from the registry with its id, date and label (G11, decision #73).
    for (const [id, words] of [
      ["F-001", "registered players, all time (Apr 2026, company-reported)"],
      ["F-011", "on X (Sep 2026)"],
      ["F-013", "influencer cats onboarded (Apr 2026, company-reported)"],
    ]) {
      const el = container.querySelector(`[data-claim="${id}"]`);
      expect(el?.textContent).toContain(words);
    }
    expect(container.querySelector('[data-claim="F-001"] .claim-figure')?.textContent).toBe("540K+");
    expect(container.querySelector('[data-claim="F-011"] .claim-figure')?.textContent).toBe("180K+");
  });

  it("drops the unsourced event chip, the stale follower count and the uncited claims", () => {
    const { container } = render(<ProofSection />);
    const text = container.textContent ?? "";
    // F-023 (Paris event partners) is unverified: decision #74.
    expect(text).not.toMatch(/Bybit|ChainforGood|routed real support|Web3 partner/);
    expect(text).not.toContain("We've already done this");
    expect(text).not.toContain("186K");
    expect(text).not.toContain("Shelter outcomes");
    // "3 taps" (P-001) is retired (decision #75, task 7b): it never renders.
    expect(text).not.toMatch(/3 taps|three taps/i);
    expect(text).not.toMatch(/on-chain/i);
  });

  it("shows the SEI track record and the current rails on the web", () => {
    const { container } = render(<ProofSection />);
    expect(container.querySelector('[data-claim="F-003"]')?.textContent).toContain("on SEI (Nov 2025)");
    expect(container.querySelector('[data-claim="F-004"]')?.textContent).toContain("on SEI (Nov 2025)");
    expect(container.querySelector('[data-claim="F-003"] [data-chip="sei-era"]')).not.toBeNull();
    // F-025 shows its registry words only; the rail state sits beside it, outside the claim.
    const f025 = container.querySelector('[data-claim="F-025"] .claim-text');
    expect(f025?.textContent).toBe("Now: Stellar NFTs");
    expect(container.querySelector('[data-claim="F-025"]')?.textContent).not.toContain("Arc");
    expect(container.querySelector('[data-testid="rail-chip"]')?.textContent).toBe(
      "Arc shelter rail opens soon",
    );
  });

  it("names the Arc rail without 'opens soon' once it is deployed", () => {
    const impact = snapshot((s) => (s.rail.state = "live"));
    const { container } = render(<ProofSection impact={impact} />);
    expect(container.querySelector('[data-claim="F-025"] .claim-text')?.textContent).toBe(
      "Now: Stellar NFTs",
    );
    expect(container.querySelector('[data-testid="rail-chip"]')?.textContent).toBe("Arc shelter rail");
    expect(railDeployed("not-deployed")).toBe(false);
    expect(railDeployed("paused")).toBe(true);
  });

  it("says 'treats paused' for a paused rail, never 'opens soon' or a plain deployed name", () => {
    const { container } = render(<ProofSection impact={snapshot((s) => (s.rail.state = "paused"))} />);
    expect(container.querySelector('[data-testid="rail-chip"]')?.textContent).toBe(
      "Arc shelter rail · treats paused",
    );
  });

  it("agrees with the About drawer on every rail state", () => {
    expect(RAIL_LINE_COPY.paused).toMatch(/paused/);
    expect(RAIL_LINE_COPY.paused).not.toMatch(/open soon/);
    expect(RAIL_LINE_COPY.soon).toMatch(/open soon/);
    expect(RAIL_LINE_COPY.open).toMatch(/open now/);
  });

  it("never shows the published-outcomes count without its public registry entry", () => {
    // 2c has not added L-outcomes yet: the chip stays hidden even with outcomes in the snapshot.
    expect(FACTS).not.toHaveProperty(OUTCOMES_ID);
    const { container, rerender } = render(<ProofSection impact={snapshot()} />);
    expect(container.querySelector('[data-testid="outcomes-chip"]')).toBeNull();
    rerender(<ProofSection impact={snapshot((s) => (s.outcomes.published = 4))} />);
    expect(container.querySelector('[data-testid="outcomes-chip"]')).toBeNull();
  });

  it("renders the outcomes count as a cited L-outcomes claim once the registry has it, hidden at zero", () => {
    const registry = FACTS as unknown as Record<string, unknown>;
    registry[OUTCOMES_ID] = {
      ...FACTS["L-countries"],
      id: OUTCOMES_ID,
      display: "{n} published shelter outcomes",
      key: "published_outcomes",
      live: { endpoint: "/impact", path: "outcomes.published" },
    };
    try {
      const { container, rerender } = render(<ProofSection impact={snapshot()} />);
      expect(container.querySelector('[data-testid="outcomes-chip"]')).toBeNull();
      rerender(<ProofSection impact={snapshot((s) => (s.outcomes.published = 4))} />);
      const chip = container.querySelector(`[data-testid="outcomes-chip"] [data-claim="${OUTCOMES_ID}"]`);
      expect(chip?.textContent).toContain("4 published shelter outcomes");
      expect(chip?.querySelector('[data-chip="live"]')).not.toBeNull();
    } finally {
      delete registry[OUTCOMES_ID];
    }
  });

  it("names no chain in app builds", () => {
    const previous = process.env.NEXT_PUBLIC_IS_APP;
    process.env.NEXT_PUBLIC_IS_APP = "true";
    try {
      const { container } = render(<ProofSection />);
      expect(container.textContent).not.toMatch(/\b(SEI|Stellar|Arc)\b|on-chain/i);
      expect(container.querySelector('[data-testid="track-record"]')).toBeNull();
      expect(container.querySelector('[data-claim="F-001"]')).not.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
      else process.env.NEXT_PUBLIC_IS_APP = previous;
    }
  });

  it("uses the Rescue Mission Hub background image", () => {
    const { container } = render(<ProofSection />);
    const bg = container.querySelector<HTMLImageElement>(
      '[data-testid="proof-background"]',
    );
    expect(bg?.getAttribute("src")).toBe("/landing/card-bg.webp");
    expect(
      fs.existsSync(path.join(PUBLIC_DIR, "landing", "card-bg.webp")),
    ).toBe(true);
    expect(container.innerHTML).not.toContain("backdrop-blur");
  });

  it("never mentions the chain partner from the deck", () => {
    render(<ProofSection />);
    expect(document.body.textContent).not.toMatch(BANNED_PARTNER);
    expect(document.body.innerHTML).not.toMatch(BANNED_PARTNER);
  });
});

describe("Paris event video", () => {
  it("is muted, loops, plays inline, defers loading, and points at the deck original", () => {
    const { container } = render(<ProofSection />);
    const video = container.querySelector<HTMLVideoElement>(
      '[data-testid="paris-video"]',
    );
    expect(video).not.toBeNull();
    expect(video!.getAttribute("src")).toBe(PARIS_VIDEO);
    expect(PARIS_VIDEO).toBe(`${DECK_MEDIA_BASE}/paris-event.mp4`);
    expect(video!.hasAttribute("autoplay")).toBe(false);
    expect(video!.muted).toBe(true);
    expect(video!.hasAttribute("loop")).toBe(true);
    expect(video!.hasAttribute("playsinline")).toBe(true);
    expect(video!.getAttribute("preload")).toBe("none");
    // The deck's event clip has no poster; the bordered frame stands in.
    expect(video!.hasAttribute("poster")).toBe(false);
    expect(video!.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("reel marquee", () => {
  it("renders 15 unique reels exactly twice with the duplicate hidden from AT", () => {
    const { container } = render(<ProofSection />);
    expect(REELS).toHaveLength(15);
    expect(new Set(REELS.map((r) => r.src)).size).toBe(15);

    const counts = new Map<string, number>();
    container.querySelectorAll(".reel-item video").forEach((video) => {
      const src = video.getAttribute("src") ?? "";
      counts.set(src, (counts.get(src) ?? 0) + 1);
    });
    expect(counts.size).toBe(15);
    const perSrc = Array.from(counts.values());
    expect(perSrc).toHaveLength(15);
    expect(perSrc.every((n) => n === 2)).toBe(true);

    const groups = container.querySelectorAll(".reel-track > .reel-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute("aria-hidden")).toBeNull();
    expect(groups[1].getAttribute("aria-hidden")).toBe("true");
  });

  it("gives every reel video the playback attributes and a name", () => {
    const { container } = render(<ProofSection />);
    const videos = container.querySelectorAll<HTMLVideoElement>(
      ".reel-item video",
    );
    expect(videos.length).toBe(30);
    videos.forEach((video) => {
      expect(video.hasAttribute("autoplay")).toBe(false);
      expect(video.muted).toBe(true);
      expect(video.hasAttribute("loop")).toBe(true);
      expect(video.hasAttribute("playsinline")).toBe(true);
      expect(video.getAttribute("preload")).toBe("none");
      const poster = video.getAttribute("poster");
      if (poster) expect(poster).toMatch(/\.jpg$/);
      expect(video.getAttribute("aria-label")).toMatch(/^Creator reel \d+ of 15$/);
      expect(video.hasAttribute("tabindex")).toBe(false);
    });
  });

  it("clips the track so the page cannot scroll horizontally", () => {
    const { container } = render(<ProofSection />);
    const marquee = container.querySelector('[data-testid="reel-marquee"]');
    expect(marquee?.classList.contains("overflow-hidden")).toBe(true);
    expect(marquee?.querySelector(".reel-track")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="proof-section"]')?.classList,
    ).toContain("overflow-hidden");
  });
});

describe("playback controller", () => {
  it("observes the section and loads nothing before it is on screen", () => {
    const { container } = render(<ProofSection />);
    const section = container.querySelector('[data-testid="proof-section"]');
    expect(observe).toHaveBeenCalledWith(section);

    const videos = allVideos(container);
    expect(videos).toHaveLength(31);
    videos.forEach((video) => {
      expect(video.hasAttribute("autoplay")).toBe(false);
      expect(video.getAttribute("preload")).toBe("none");
      expect(video.paused).toBe(true);
    });
    expect(playMock).not.toHaveBeenCalled();
    expect(
      container.querySelector(".reel-track")?.classList.contains("is-paused"),
    ).toBe(true);
  });

  it("plays every video when the section intersects and pauses when it leaves", () => {
    const { container } = render(<ProofSection />);
    const videos = allVideos(container);

    intersect(true);
    expect(playMock).toHaveBeenCalledTimes(videos.length);
    expect(
      container.querySelector(".reel-track")?.classList.contains("is-paused"),
    ).toBe(false);

    pauseMock.mockClear();
    intersect(false);
    expect(pauseMock).toHaveBeenCalledTimes(videos.length);
    expect(
      container.querySelector(".reel-track")?.classList.contains("is-paused"),
    ).toBe(true);
  });

  it("never plays under reduced motion and leaves the posters up", () => {
    reducedMotion = true;
    const { container } = render(<ProofSection />);
    expect(matchMediaMock).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );

    intersect(true);
    expect(playMock).not.toHaveBeenCalled();
    expect(
      container.querySelector(".reel-track")?.classList.contains("is-paused"),
    ).toBe(true);
    allVideos(container).forEach((video) => {
      expect(video.paused).toBe(true);
      const poster = video.getAttribute("poster");
      if (poster) expect(poster).toMatch(/\.jpg$/);
    });
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(<ProofSection />);
    disconnect.mockClear();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("deck media", () => {
  it("loads every video and poster from the pitch site originals", () => {
    const { container } = render(<ProofSection />);
    const urls = new Set<string>();
    container.querySelectorAll("video").forEach((v) => {
      urls.add(v.getAttribute("src") ?? "");
      const poster = v.getAttribute("poster");
      if (poster) urls.add(poster);
    });
    expect(urls.size).toBe(1 + 15 + 12); // event clip, 15 reels, 12 posters
    urls.forEach((u) => {
      expect(u.startsWith(`${DECK_MEDIA_BASE}/`)).toBe(true);
      expect(u).toMatch(/\.(mp4|webm|jpg)$/);
      expect(BANNED_PARTNER.test(u)).toBe(false);
    });
    expect(REELS.filter((r) => r.src.endsWith(".webm"))).toHaveLength(3);
    expect(REELS.filter((r) => r.poster)).toHaveLength(12);
  });
});

