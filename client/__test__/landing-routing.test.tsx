/**
 * @jest-environment jsdom
 *
 * Covers the I/O matrix of spec-gaming-landing-as-homepage:
 * root visit, legacy /gaming on Node hosting, legacy /gaming in a static
 * export, sitemap exclusion, and old landing anchors on the root page.
 */
import React from "react";
import { render } from "@testing-library/react";

process.env.NEXT_PUBLIC_DOMAIN = "https://tokentails.com";

const mockReplace = jest.fn();
let mockMobile = false;
const ORIGINAL_UA = window.navigator.userAgent;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value,
    configurable: true,
  });
}

jest.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("next/router", () => ({
  useRouter: () => ({ replace: mockReplace, query: { ref: "abc123" } }),
}));
jest.mock("@/components/globe/Globe", () => ({
  INITIAL_PARTNERSHIPS: ["lt", "us", "de"],
  PixelGlobe: () => <div data-testid="globe" />,
}));
jest.mock("@/components/shared/Fireflies", () => ({ Fireflies: () => null }));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text }: { text: string }) => <button>{text}</button>,
}));
jest.mock("@/components/tailsCard/TailsCard", () => ({
  TailsCard: () => <div data-testid="tails-card" />,
}));
jest.mock("@/layouts/Socials", () => ({ Socials: () => null }));
jest.mock("@/constants/utils", () => ({
  cdnFile: (path: string) => `/${path}`,
  isMobile: () => mockMobile,
}));

import HomePage from "@/pages/index";
import GamingRedirect from "@/pages/gaming";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require("../next.config.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sitemapConfig = require("../next-sitemap.config.js");

function expectGamingLanding(container: HTMLElement) {
  // React 19 hoists <title>, <meta>, and <link> into document.head.
  expect(document.querySelector("title")?.textContent).toBe(
    "Token Tails - Play to Save",
  );
  expect(
    document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  ).toBe("https://tokentails.com/");
  expect(
    document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
  ).toBe("https://tokentails.com/");
  expect(container.textContent).toContain("Rescue Mission Hub");
  expect(container.querySelector('a[href="/game"]')).not.toBeNull();
  expect(container.querySelector('a[href*="apps.apple.com"]')).not.toBeNull();
  expect(container.querySelector('a[href*="play.google.com"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="globe"]')).not.toBeNull();
}

describe("root visit", () => {
  it("renders the gaming landing with root SEO tags", () => {
    const { container } = render(<HomePage />);
    expectGamingLanding(container);
  });
});

describe("root visit on mobile", () => {
  afterEach(() => {
    mockMobile = false;
    setUserAgent(ORIGINAL_UA);
  });

  it("shows only the App Store badge on iPhone", () => {
    mockMobile = true;
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );
    const { container } = render(<HomePage />);
    expect(container.querySelector('a[href*="apps.apple.com"]')).not.toBeNull();
    expect(container.querySelector('a[href*="play.google.com"]')).toBeNull();
  });

  it("shows only the Play Store badge on Android", () => {
    mockMobile = true;
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
    );
    const { container } = render(<HomePage />);
    expect(container.querySelector('a[href*="play.google.com"]')).not.toBeNull();
    expect(container.querySelector('a[href*="apps.apple.com"]')).toBeNull();
  });
});

describe("legacy /gaming link, Node host", () => {
  it("is a permanent redirect to /", async () => {
    await expect(nextConfig.redirects()).resolves.toContainEqual({
      source: "/gaming",
      destination: "/",
      permanent: true,
    });
  });
});

describe("legacy /gaming link, static export", () => {
  it("replaces the URL with / keeping the query, and renders no content", () => {
    const { container } = render(<GamingRedirect />);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/",
        query: expect.objectContaining({ ref: "abc123" }),
      }),
    );
    expect(container.textContent).toBe("");
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex");
    expect(
      document
        .querySelector('meta[http-equiv="refresh"]')
        ?.getAttribute("content"),
    ).toBe("0;url=/");
  });
});

describe("sitemap generation", () => {
  it("excludes the redirect stub", () => {
    expect(sitemapConfig.exclude).toContain("/gaming");
  });
});

describe("old landing anchors", () => {
  it("loads the root page normally when a stale hash is present", () => {
    window.location.hash = "#family";
    const { container } = render(<HomePage />);
    expectGamingLanding(container);
    window.location.hash = "";
  });
});
