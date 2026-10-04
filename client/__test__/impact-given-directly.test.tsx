/**
 * @jest-environment jsdom
 *
 * F-026 "given directly" (founder request 2026-10-03): the direct crypto and goods donations are a
 * registry fact, company-reported (never on-chain verified), shown as the /impact headline with its
 * chip and date, kept apart from the indexed payouts, and cited by the same id on the landing and
 * in the lobby strip. Its words say no more than the founder did (review 26): no recipients, no
 * start date. The receipts request is opt-in per entry (`recordsOnRequest`) and F-026 has not
 * opted in yet.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { normalizeImpact } from "@/api/impact-api";
import { FACTS } from "@/lib/facts.generated";
import baseline from "@/public/impact/snapshot.json";
import publicFacts from "@/public/facts/facts.json";

jest.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@capacitor/browser", () => ({ Browser: { open: jest.fn() } }));
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));
// /impact renders the night footer, whose analytics link reads `analytics.enabled`.
jest.mock("@/analytics", () => ({ reportAppError: jest.fn(), analytics: { enabled: false } }));
jest.mock("@/components/globe/Globe", () => ({ PixelGlobe: () => null }));
jest.mock("@/components/shared/Fireflies", () => ({ Fireflies: () => null }));
// The Pink Paw gallery reads the storefront query (QueryClientProvider lives in MainLayout, not here).
jest.mock("@/components/shelter-payouts/PinkPawGallery", () => ({ PinkPawGallery: () => null }));

import { Claim } from "@/components/claims/Claim";
import { ProofDrawer } from "@/components/claims/ProofDrawer";
import { factText, shownInApp, splitFigure } from "@/components/claims/facts";
import { offersRecords, recordsMailto, RECORDS_EMAIL } from "@/components/claims/records";
import { SUPPORT_EMAIL } from "@/lib/support";
import type { PublicFact } from "@/lib/facts.generated";
import { GivenDirectly, GIVEN_DIRECTLY_ID } from "@/components/impact/GivenDirectly";
import { givenDirectlyShort } from "@/components/impact/ImpactStrip";
import ImpactPage from "@/pages/impact";
import { ImpactGlobeSection } from "@/components/landing/ImpactGlobeSection";

const fact = FACTS["F-026"];
const NOW = new Date("2026-10-03T12:00:00Z");

describe("F-026 in the registry", () => {
  it("is a public, company-reported, past-tense fact on landing, game and impact", () => {
    expect(GIVEN_DIRECTLY_ID).toBe("F-026");
    expect(fact.status).toBe("company-reported");
    expect(fact.tense).toBe("past");
    expect(fact.value).toBe(40000);
    expect(fact.unit).toBe("USD");
    expect(fact.asOf).toBe("2026-10-03");
    expect(fact.maxAgeDays).toBe(365);
    expect([...fact.surfaces].sort()).toEqual(["game", "impact", "landing"]);
    // No public source URL: it is the company's own figure, not a verified one.
    expect(fact.sourceUrl).toBeNull();
    expect(fact.display).toMatch(/company-reported/);
    expect(fact.display).toMatch(/crypto and goods/);
    expect(fact.display).not.toMatch(/on-?chain|verified/i);
    expect(fact.display).toBe(
      "$40K+ donated directly in crypto and goods (Oct 2026, company-reported)"
    );
    expect(fact.appDisplay).toBe(
      "$40K+ donated directly in money and goods (Oct 2026, company-reported)"
    );
    expect(fact.short).toBe("$40K+ donated in crypto and goods");
  });

  it("says no more than the founder did: no recipients, no rail history", () => {
    for (const words of [fact.display, fact.appDisplay ?? "", fact.short ?? ""]) {
      expect(words).not.toMatch(/shelters?|rescuers?|food|supplies|predate/i);
    }
  });

  it("has not opted into receipt requests yet", () => {
    expect(fact.recordsOnRequest).toBeUndefined();
    expect(offersRecords(fact)).toBe(false);
  });

  it("is in the public facts.json the web and the Heist fetch", () => {
    const entry = (publicFacts as { facts: { id: string }[] }).facts.find(
      (f) => f.id === "F-026"
    );
    expect(entry).toBeTruthy();
  });

  it("has app words with no chain or crypto words, so the app can show it", () => {
    expect(shownInApp(fact)).toBe(true);
    expect(factText(fact, {}, true)).not.toMatch(/crypto/i);
    expect(factText(fact, {}, true)).toMatch(/company-reported/);
  });

  it("splits into the headline figure", () => {
    expect(splitFigure(fact.display).figure).toBe("$40K+");
    expect(givenDirectlyShort()).toBe("$40K+ donated in crypto and goods");
  });
});

describe("Claim hero variant", () => {
  it("shows the figure, the words without the bracketed tail, the status chip and the full date", () => {
    const { container } = render(
      <Claim id="F-026" variant="hero" interactive={false} isApp={false} now={NOW} />
    );
    const claim = container.querySelector('[data-claim="F-026"]')!;
    expect(claim.querySelector(".claim-figure")?.textContent).toBe("$40K+");
    expect(claim.querySelector(".claim-text")?.textContent).toBe(
      "donated directly in crypto and goods"
    );
    expect(claim.querySelector('[data-chip="company-reported"]')).not.toBeNull();
    expect(claim.querySelector('[data-chip="stale"]')).toBeNull();
    expect(claim.textContent).toContain("As of 3 Oct 2026");
  });

  it("goes STALE a year after its check date", () => {
    const { container } = render(
      <Claim
        id="F-026"
        variant="hero"
        interactive={false}
        isApp={false}
        now={new Date("2027-10-05T00:00:00Z")}
      />
    );
    expect(container.querySelector('[data-chip="stale"]')).not.toBeNull();
  });
});

describe("GivenDirectly", () => {
  it("explains the figure and keeps the rail apart, with no receipts button until opted in", () => {
    render(<GivenDirectly isApp={false} />);
    const section = screen.getByTestId("given-directly");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Our track record");
    expect(section.textContent).toContain("Token Tails' own figure");
    expect(section.textContent).toContain("never added");
    expect(section.textContent).toContain("crypto transfers");
    expect(section.textContent).toContain("gave directly");
    expect(section.textContent).not.toMatch(/gave shelters/);
    expect(screen.queryByTestId("given-records")).toBeNull();
    expect(screen.getByTestId("given-rail-line").textContent).toContain(
      "No payouts yet."
    );
  });

  it("says money, not crypto, in app builds", () => {
    render(<GivenDirectly isApp />);
    const section = screen.getByTestId("given-directly");
    expect(section.textContent).not.toMatch(/crypto|USDC|wallet|on-?chain/i);
  });
});

describe("/impact headline", () => {
  const impact = { impact: normalizeImpact(JSON.parse(JSON.stringify(baseline)))!, source: "api" as const };

  it("puts F-026 above the money section, with a nav link and a rail line", () => {
    const { container } = render(<ImpactPage impact={impact} />);
    const given = container.querySelector('[data-testid="given-directly"]')!;
    const money = container.querySelector("#money")!;
    expect(given).not.toBeNull();
    expect(given.compareDocumentPosition(money) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(given.querySelector('[data-claim="F-026"]')).not.toBeNull();
    expect(container.querySelector('nav a[href="#given"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="given-rail-empty"]')?.textContent).toMatch(
      /^No payouts yet/
    );
    // The registry table lists it too.
    expect(container.querySelector('[data-claim-row="F-026"]')).not.toBeNull();
  });
});

describe("ProofDrawer records row (opt-in, review 26 #8)", () => {
  const optedIn: PublicFact = { ...fact, recordsOnRequest: true };

  it("is absent for company-reported facts that have not opted in (F-026, F-001)", async () => {
    for (const f of [fact, FACTS["F-001"]]) {
      const { unmount } = render(
        <ProofDrawer open onOpenChange={() => {}} fact={f} text={f.display} isApp={false} now={NOW} />
      );
      const dialog = await screen.findByRole("dialog", { name: "About this number" });
      expect(dialog.textContent).not.toContain("How to check");
      expect(dialog.querySelector('[data-testid="records-request"]')).toBeNull();
      unmount();
    }
  });

  it("tells the reader how to ask for the records once the entry opts in", async () => {
    render(
      <ProofDrawer
        open
        onOpenChange={() => {}}
        fact={optedIn}
        text={optedIn.display}
        isApp={false}
        now={NOW}
      />
    );
    const dialog = await screen.findByRole("dialog", { name: "About this number" });
    expect(dialog.textContent).toContain("How to check");
    const href = dialog.querySelector('[data-testid="records-request"]')?.getAttribute("href");
    expect(href).toBe(recordsMailto("F-026"));
    expect(href).toContain(`mailto:${RECORDS_EMAIL}`);
    expect(RECORDS_EMAIL).toBe(SUPPORT_EMAIL);
  });
});

describe("Claim accessible name", () => {
  it("says 'how we know' for a company-reported fact with no source", () => {
    render(<Claim id="F-026" variant="hero" isApp={false} now={NOW} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toMatch(/Show how we know$/);
  });

  it("keeps 'Show the source' for a fact with a source", () => {
    render(<Claim id="F-011" variant="chip" isApp={false} now={NOW} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/Show the source$/);
  });
});

describe("landing globe section (review 26 #5)", () => {
  it("shows F-026 as a hero stat with its status chip, not run-on words", () => {
    const impact = normalizeImpact(JSON.parse(JSON.stringify(baseline)))!;
    const { container } = render(<ImpactGlobeSection impact={impact} />);
    const block = screen.getByTestId("given-directly-landing");
    const claim = block.querySelector('[data-claim="F-026"]')!;
    expect(claim.querySelector(".claim-figure")?.textContent).toBe("$40K+");
    expect(claim.querySelector(".claim-text")?.textContent).toBe("donated directly in crypto and goods");
    expect(claim.querySelector('[data-chip="company-reported"]')).not.toBeNull();
    // It sits above the /impact link.
    const link = container.querySelector('[data-testid="impact-link"]')!;
    expect(block.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
