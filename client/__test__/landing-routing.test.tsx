/**
 * @jest-environment jsdom
 *
 * Covers the I/O matrix of spec-gaming-landing-as-homepage:
 * root visit, legacy /gaming on Node hosting, legacy /gaming in a static
 * export, sitemap exclusion, and old landing anchors on the root page.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  PixelGlobe: ({ countries }: { countries: string[] }) => (
    <div data-testid="globe" data-countries={countries.join(",")} />
  ),
}));
jest.mock("@capacitor/browser", () => ({ Browser: { open: jest.fn() } }));
const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({
  reportAppError: jest.fn(),
  analytics: { track: (event: unknown) => mockTrack(event) },
  buildEvent: (name: string, properties: unknown) => ({ name, properties }),
}));
// The landing's optional auth read (Firebase, browser only) reports this player.
let mockPlayer: { signedIn: boolean; onboardingState?: string; catName?: string | null } = {
  signedIn: false,
};
let mockPlayerThrows = false;
let mockPlayerMounts = 0;
jest.mock("@/components/landing/LandingPlayer", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react");
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (state: unknown) => void }) => {
      if (mockPlayerThrows) throw new Error("Loading chunk firebase failed");
      useEffect(() => {
        mockPlayerMounts += 1;
        onChange(mockPlayer);
      }, [onChange]);
      return null;
    },
  };
});
let mockProofThrows = false;
jest.mock("@/components/shared/Fireflies", () => ({ Fireflies: () => null }));
jest.mock("@/components/landing/ProofSection", () => ({
  ProofSection: () => {
    if (mockProofThrows) throw new Error("proof section broke");
    return <section data-testid="proof-section" />;
  },
}));
jest.mock("@/components/shared/PixelButton", () => ({
  // Like the real component: `as="span"` renders no button, so a wrapping link stays valid HTML.
  PixelButton: ({ text, as }: { text: string; as?: string }) =>
    as === "span" ? <span>{text}</span> : <button>{text}</button>,
}));
jest.mock("@/components/tailsCard/TailsCard", () => ({
  TailsCard: () => <div data-testid="tails-card" />,
}));
jest.mock("@/layouts/Socials", () => ({ Socials: () => null }));
jest.mock("@/constants/utils", () => ({
  cdnFile: (path: string) => `/${path}`,
  isMobile: () => mockMobile,
}));

import { hasReelClips } from "@/components/reel/GameplayReel";
import HomePage, { getStaticProps, LANDING_REVALIDATE_SECONDS } from "@/pages/index";
import { SESSION_HINT_KEY } from "@/context/auth/sessionHint";
import { normalizeImpact, resetImpactRateLimits } from "@/api/impact-api";
import baseline from "@/public/impact/snapshot.json";
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
  expect(container.querySelector('[data-testid="rescue-hub"]')).not.toBeNull();
  expect(container.querySelector('a[href^="/game"]')).not.toBeNull();
  expect(container.querySelector('a[href*="apps.apple.com"]')).not.toBeNull();
  expect(container.querySelector('a[href*="play.google.com"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="globe"]')).not.toBeNull();
  // Order: hero, proof section, globe, sample card + video.
  const proof = container.querySelector('[data-testid="proof-section"]');
  const globe = container.querySelector('[data-testid="globe"]');
  expect(proof).not.toBeNull();
  expect(
    proof!.compareDocumentPosition(globe!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  // The sample card + portrait video section closes the page, after the globe.
  const hub = container.querySelector('[data-testid="rescue-hub"]');
  expect(hub).not.toBeNull();
  expect(
    globe!.compareDocumentPosition(hub!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  // The team section closes the page, below the sample card.
  const team = container.querySelector('[data-testid="team-section"]');
  expect(team).not.toBeNull();
  expect(
    hub!.compareDocumentPosition(team!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe("root visit", () => {
  it("renders the gaming landing with root SEO tags", () => {
    const { container } = render(<HomePage />);
    expectGamingLanding(container);
  });

  it("mounts the gameplay reel between the hero and the proof section when the manifest has clips", () => {
    const { container } = render(<HomePage />);
    const reel = container.querySelector('[data-testid="gameplay-reel"]');
    // Task 6d review: the clips are withdrawn (empty manifest) until they are re-captured with
    // the capture hooks; the landing then shows no reel section at all.
    if (!hasReelClips) {
      expect(reel).toBeNull();
      return;
    }
    const proof = container.querySelector('[data-testid="proof-section"]');
    expect(reel).not.toBeNull();
    expect(reel!.compareDocumentPosition(proof!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test patches any snapshot field
const withImpact = (patch: (s: Record<string, any>) => void) => {
  const raw = JSON.parse(JSON.stringify(baseline));
  patch(raw);
  return { impact: normalizeImpact(raw)!, source: "cdn" as const };
};

describe("landing data (2.13 row 30)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_IS_APP;
    resetImpactRateLimits();
  });

  it("reads the CDN impact.json in one getStaticProps with ISR every 300 s", async () => {
    const body = JSON.parse(JSON.stringify(baseline));
    body.bucket = "from-cdn";
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = (await getStaticProps({} as never)) as {
      props: { impact: { source: string; impact: { bucket: string } } };
      revalidate: number;
    };
    expect(LANDING_REVALIDATE_SECONDS).toBe(300);
    expect(result.revalidate).toBe(300);
    expect(result.props.impact.source).toBe("cdn");
    expect(result.props.impact.impact.bucket).toBe("from-cdn");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/impact\/impact\.json$/);
    // Props must survive Next's JSON serialisation (no undefined).
    expect(JSON.parse(JSON.stringify(result.props))).toEqual(result.props);
  });

  it("falls back to the bundled baseline when the CDN and API fail", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    const result = (await getStaticProps({} as never)) as { props: { impact: { source: string } } };
    expect(result.props.impact.source).toBe("baseline");
  });

  it("app builds read the committed snapshot with no ISR and no network", async () => {
    process.env.NEXT_PUBLIC_IS_APP = "true";
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = (await getStaticProps({} as never)) as {
      props: { impact: { source: string } };
      revalidate?: number;
    };
    expect(result.revalidate).toBeUndefined();
    expect(result.props.impact.source).toBe("baseline");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("globe and country count (decisions #29, #30)", () => {
  it("lights exactly the snapshot's partner countries and counts them", () => {
    const impact = withImpact((s) => (s.shelters.countries = ["LT", "ES"]));
    const { container } = render(<HomePage impact={impact} />);
    expect(container.querySelector('[data-testid="globe"]')?.getAttribute("data-countries")).toBe("LT,ES");
    const claim = container.querySelector('[data-claim="L-countries"]');
    expect(claim?.querySelector(".claim-figure")?.textContent).toBe("2");
    expect(claim?.querySelector(".claim-text")?.textContent).toBe("partner countries");
    expect(claim?.getAttribute("aria-label")).toContain("2 partner countries, as of 1 Oct 2026");
    expect(claim?.textContent).toContain("Lithuania · Spain");
  });

  it("lists the shelters instead of a number while no country is active", () => {
    const impact = withImpact((s) => {
      s.shelters.countries = [];
      s.shelters.items = [
        { slug: "a", name: "Pink Paw", role: "partner" },
        { slug: "home", name: "Home", role: "house" },
        { slug: "p", name: "Maybe Shelter", role: "partner", partnerStatus: "prospect" },
        { slug: "old", name: "Old Friends", role: "partner", partnerStatus: "past" },
      ];
    });
    const { container } = render(<HomePage impact={impact} />);
    expect(container.querySelector('[data-claim="L-countries"]')).toBeNull();
    const list = container.querySelector('[data-testid="partner-shelters"]');
    expect(list?.textContent).toContain("Pink Paw");
    expect(list?.textContent).not.toContain("Home");
    // Prospects have no cats in the game yet; past partners' cats still are (review 3f #9).
    expect(list?.textContent).not.toContain("Maybe Shelter");
    expect(list?.textContent).toContain("Old Friends");
  });

  it("drops '800+ strays saved' and links the impact heading to /impact", () => {
    const { container } = render(<HomePage />);
    expect(container.textContent).not.toContain("800+");
    expect(container.textContent).not.toMatch(/strays saved/i);
    expect(container.querySelector('a[data-testid="impact-link"]')?.getAttribute("href")).toBe("/impact");
  });
});

describe("section boundaries", () => {
  afterEach(() => {
    mockProofThrows = false;
  });

  it("a crashing section disappears and the rest of the landing stays", () => {
    mockProofThrows = true;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { container } = render(<HomePage />);
      expect(container.querySelector('[data-testid="proof-section"]')).toBeNull();
      expect(container.querySelector('[data-testid="globe"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="rescue-hub"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="team-section"]')).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("/proof and the Firebase auth proxy (next.config.js)", () => {
  it("redirects /proof to /impact on web", async () => {
    await expect(nextConfig.redirects()).resolves.toContainEqual({
      source: "/proof",
      destination: "/impact",
      permanent: true,
    });
  });

  it("exports only keys Next.js accepts (no 'Invalid next.config.js options' warning)", () => {
    expect(Object.keys(nextConfig)).not.toContain("firebaseAuthRewrites");
  });

  it("keeps the auth rewrites off unless the flag is set (decision #6)", async () => {
    await expect(nextConfig.rewrites()).resolves.toEqual([]);
    let flagged: typeof nextConfig | undefined;
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_PROXY = "true";
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        flagged = require("../next.config.js");
      } finally {
        delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_PROXY;
      }
    });
    await expect(flagged!.rewrites()).resolves.toEqual([
      { source: "/__/auth/:path*", destination: "https://news-ccd33.firebaseapp.com/__/auth/:path*" },
      {
        source: "/__/firebase/init.json",
        destination: "https://news-ccd33.firebaseapp.com/__/firebase/init.json",
      },
    ]);
  });
});

describe("landing CTAs (plan G14, G3, G2)", () => {
  // The landing reads the player only in a browser that has had a session (Task 6b review #4).
  beforeEach(() => {
    window.localStorage.setItem(SESSION_HINT_KEY, "1");
    mockPlayerMounts = 0;
  });
  afterEach(() => {
    mockPlayer = { signedIn: false };
    mockPlayerThrows = false;
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_HEIST_LANDING_PILL;
  });

  it("a first-time visitor (no session hint) never loads the player read", async () => {
    window.localStorage.clear();
    mockPlayer = { signedIn: true, onboardingState: "done", catName: "Miso" };
    render(<HomePage />);
    expect(await screen.findByRole("link", { name: "MEET YOUR CAT" })).toBeTruthy();
    expect(mockPlayerMounts).toBe(0);
    expect(document.body.textContent ?? "").not.toMatch(/is waiting/i);
  });

  it("a failing player read keeps the landing and its signed-out labels (Task 6b review #2)", () => {
    mockPlayerThrows = true;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { container } = render(<HomePage />);
      expect(container.querySelector('[data-testid="hero-cta"]')).not.toBeNull();
      expect(screen.getByRole("link", { name: "MEET YOUR CAT" })).toBeTruthy();
      expect(container.querySelector('[data-testid="team-section"]')).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("nests no interactive element inside a link (axe nested-interactive)", () => {
    const { container } = render(<HomePage />);
    expect(container.querySelectorAll("a button, a a, button a, button button")).toHaveLength(0);
  });

  it("signed out: MEET YOUR CAT and no hero line", async () => {
    render(<HomePage />);
    expect(await screen.findByRole("link", { name: "MEET YOUR CAT" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/is waiting/i);
  });

  it("onboarding pending: still MEET YOUR CAT, no hero line", async () => {
    mockPlayer = { signedIn: true, onboardingState: "pending", catName: "Scout" };
    render(<HomePage />);
    expect(await screen.findByRole("link", { name: "MEET YOUR CAT" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/is waiting/i);
  });

  it("done: the crew CTA reads BACK TO YOUR CAT, not a second PLAY GAME, and no 'waiting' echo", async () => {
    mockPlayer = { signedIn: true, onboardingState: "done", catName: "Miso" };
    const { container } = render(<HomePage />);
    await waitFor(() => expect(screen.getByTestId("crew-cta").getAttribute("aria-label")).toBe("BACK TO YOUR CAT"));
    // One PLAY GAME on the page (the hero); the crew CTA says something else (founder, Oct 3).
    expect(screen.getAllByRole("link", { name: "PLAY GAME" }).map((a) => a.getAttribute("data-testid"))).toEqual([
      "hero-cta",
    ]);
    expect(screen.getByTestId("crew-cta").getAttribute("href")).toBe("/game?from=landing_crew");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/is waiting/i);
    expect(text).not.toMatch(/waiting for you/i);
    expect(text).not.toMatch(/Miso/);
    expect(screen.queryByText(/PLAY TO SAVE/)).toBeNull();
  });


  it("carries where a CTA was tapped in its /game link and tracks nothing on the landing", () => {
    const { container } = render(<HomePage />);
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/game"]'));
    links.forEach((a) => a.addEventListener("click", (event: MouseEvent) => event.preventDefault()));
    const hero = container.querySelector('[data-testid="hero-cta"]')!;
    const card = screen.getByRole("link", { name: "Play the Token Tails game" });
    const crew = container.querySelector('[data-testid="crew-cta"]')!;
    expect([hero, card, crew].map((a) => a.getAttribute("href"))).toEqual([
      "/game?from=landing_hero",
      "/game?from=landing_sample_card",
      "/game?from=landing_crew",
    ]);
    // The click is the landing's first analytics call and the full page load would cancel it
    // (Task 6b review #1): `landing_cta` is sent from /game instead.
    [hero, card, crew].forEach((a) => fireEvent.click(a));
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("keeps the Heist pill off by default (decision #15)", () => {
    const { container } = render(<HomePage />);
    expect(container.querySelector('[data-testid="heist-pill"]')).toBeNull();
    expect(container.textContent).not.toContain("Or play Catnip Heist now");
  });

  it("shows the Heist pill under the hero CTA when the flag is on", () => {
    process.env.NEXT_PUBLIC_HEIST_LANDING_PILL = "1";
    const { container } = render(<HomePage />);
    const pill = container.querySelector<HTMLAnchorElement>('[data-testid="heist-pill"]');
    expect(pill?.textContent).toBe("Or play Catnip Heist now, no sign-up");
    expect(pill?.getAttribute("href")).toBe("/heist?from=landing");
    const hero = container.querySelector('[data-testid="hero-cta"]')!;
    expect(hero.compareDocumentPosition(pill!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders its meta through SeoHead: 1200x630 card and no per-page icon", () => {
    render(<HomePage />);
    const meta = (key: string) => document.querySelector(`meta[property="${key}"]`)?.getAttribute("content");
    expect(meta("og:image")).toBe("https://tokentails.com/logo/og-v2-1200x630.jpg");
    expect(meta("og:image:width")).toBe("1200");
    expect(meta("og:image:height")).toBe("630");
    expect(document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')).toHaveLength(0);
  });
});

describe("landing_cta from /game (Task 6b review #1)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { landingCtaFromSearch, landingCtaHref, trackLandingArrival } = require("@/components/landing/landingCta");

  beforeEach(() => mockTrack.mockClear());

  it("reads only the landing's own CTA names", () => {
    expect(landingCtaFromSearch(new URL(landingCtaHref("hero_fallback"), "https://x").search)).toBe("hero_fallback");
    expect(landingCtaFromSearch("?ref=abc&from=landing_sample_card")).toBe("sample_card");
    for (const search of ["", "?from=landing", "?from=landing_", "?from=picker", "?from=landing_evil", "?from=hero"]) {
      expect(landingCtaFromSearch(search)).toBeNull();
    }
  });

  it("sends landing_cta {from} once for a landing arrival, nothing otherwise", () => {
    expect(trackLandingArrival("?from=landing_crew")).toBe("crew");
    expect(trackLandingArrival("?from=picker")).toBeNull();
    expect(trackLandingArrival("")).toBeNull();
    expect(mockTrack.mock.calls).toEqual([[{ name: "landing_cta", properties: { from: "crew" } }]]);
  });
});

describe("playerStateFrom (the landing's optional, non-creating profile read)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { playerStateFrom } = require("@/components/landing/landingCta");
  const cat = { name: "Miso" };

  it("is signed out without a session, while loading, and for a transient guest", () => {
    expect(playerStateFrom("signed-out", null)).toEqual({ signedIn: false });
    expect(playerStateFrom("loading-profile", null)).toEqual({ signedIn: false });
    expect(playerStateFrom("guest", { transient: true, cat })).toEqual({ signedIn: false });
    expect(playerStateFrom("profile-error", { cat })).toEqual({ signedIn: false });
  });

  it("reads the onboarding state and cat name; a missing onboarding field means done", () => {
    expect(playerStateFrom("guest", { onboarding: { state: "pending" }, cat })).toEqual({
      signedIn: true,
      onboardingState: "pending",
      catName: "Miso",
    });
    const legacy = playerStateFrom("ready", { cat });
    expect(legacy.onboardingState).toBe("done");
  });
});
