/**
 * @jest-environment jsdom
 */
/**
 * `/pawlegends` links the iOS app: Apple's App Store badge next to the hero and the continue play buttons, the Safari
 * Smart App Banner meta, and a bigger badge on iPhone and iPad. The main landing (`/`) still shows no store badge
 * (landing-routing.test.tsx). Google Play is not live, so there is no Android badge.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

const replace = jest.fn(() => Promise.resolve(true));
const mockRouter = { replace, pathname: "/pawlegends", query: {} as Record<string, string>, isReady: true };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
// Render next/head's children in place; React 19 hoists <meta> into document.head.
jest.mock("next/head", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: () => null }));
jest.mock("@/components/pawlegends/landing/motion", () => ({ startLandingMotion: () => () => undefined }));
jest.mock("gsap", () => ({ gsap: {} }));
for (const name of ["ScrollTrigger", "SplitText", "CustomEase", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin"]) {
  jest.doMock(`gsap/${name}`, () => ({ [name]: {} }));
}

import LandingPage from "@/pages/index";
import { isAppleMobile } from "@/components/pawlegends/landing/PawlegendsLanding";
import { APP_STORE_CTAS, LANDING_FILES, PAWLEGENDS_APP_STORE_URL } from "@/components/pawlegends/landing/markup";
import { ctaOf } from "@/components/pawlegends/landingVariant";

const APP_URL = "https://apps.apple.com/us/app/pawlegends/id6832032981";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ORIGINAL_UA = navigator.userAgent;
const setUserAgent = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

afterEach(() => {
  cleanup();
  setUserAgent(ORIGINAL_UA);
  document.head.innerHTML = "";
});

describe("/pawlegends App Store link", () => {
  it("shows the badge as a link next to the hero and the continue play buttons", () => {
    expect(PAWLEGENDS_APP_STORE_URL).toBe(APP_URL);
    render(<LandingPage />);
    const root = screen.getByTestId("pawlegends-landing");
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="apps.apple.com"]'));
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute("href")).toBe(APP_URL);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("aria-label")).toBe("Download Pawlegends on the App Store");
      const img = a.querySelector("img")!;
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toMatch(/^\/pawlegends\/landing\/app-store-badge-(black|white)\.[0-9a-f]{8}\.svg$/);
      expect(LANDING_FILES).toContain(img.getAttribute("src"));
      expect(existsSync(join(__dirname, "../../public", img.getAttribute("src")!))).toBe(true);
    }
    // Second action: each badge follows its play button in the same row.
    const hero = root.querySelector(".hero-copy .ctas")!;
    expect(hero.firstElementChild?.querySelector('a[data-cta="landing_hero"]')).not.toBeNull();
    expect(hero.lastElementChild?.getAttribute("data-cta")).toBe(APP_STORE_CTAS.hero);
    const cont = root.querySelector(".cont .ctas")!;
    expect(cont.firstElementChild?.querySelector("#cont-cta")).not.toBeNull();
    expect(cont.lastElementChild?.getAttribute("data-cta")).toBe(APP_STORE_CTAS.continue);
    // Clicks are reported with the play buttons' landing CTA event.
    for (const a of links) expect(ctaOf(a.querySelector("img"))).toMatch(/^appstore_(hero|continue)$/);
    // No Android badge until Google Play is live.
    expect(root.querySelector('a[href*="play.google.com"]')).toBeNull();
  });

  it("ships Apple's badge art unchanged (black and white)", () => {
    const svgs = LANDING_FILES.filter((f) => f.includes("app-store-badge-"));
    expect(svgs.map((f) => f.replace(/.*badge-(\w+)\..*/, "$1")).sort()).toEqual(["black", "white"]);
    for (const f of svgs) {
      const svg = readFileSync(join(__dirname, "../../public", f), "utf8");
      expect(svg).toContain("<title>Download_on_the_App_Store_Badge_US-UK_RGB_");
      expect(svg).toContain('viewBox="0 0 119.66407 40"');
      expect(svg).not.toMatch(/<script|on\w+=/i);
    }
  });

  it("adds the Safari Smart App Banner meta", () => {
    render(<LandingPage />);
    expect(document.querySelector('meta[name="apple-itunes-app"]')?.getAttribute("content")).toBe("app-id=6832032981");
  });

  it("makes the badge the prominent second action on iPhone and iPad only", () => {
    render(<LandingPage />);
    expect(screen.getByTestId("pawlegends-landing").classList.contains("ios")).toBe(false);
    cleanup();
    setUserAgent(IPHONE);
    render(<LandingPage />);
    expect(screen.getByTestId("pawlegends-landing").classList.contains("ios")).toBe(true);
  });

  it("detects iPhone, iPad and iPadOS (Mac user agent with touch), not Android or a desktop Mac", () => {
    expect(isAppleMobile({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 0 })).toBe(false);
    expect(isAppleMobile({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0 Mobile", maxTouchPoints: 5 })).toBe(false);
  });
});
