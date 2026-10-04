/**
 * @jest-environment jsdom
 *
 * /impact (plan F7.6): every public claim listed with value, date, status and source; honest
 * empty states; money per tier and currency; app builds with no chain or explorer words; ISR 600.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { normalizeImpact, resetImpactRateLimits } from "@/api/impact-api";
import { FACT_IDS } from "@/lib/facts.generated";
import baseline from "@/public/impact/snapshot.json";

jest.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@capacitor/browser", () => ({ Browser: { open: jest.fn() } }));
jest.mock("next/dynamic", () => () => () => null);

import ImpactPage, {
  custodyView,
  getStaticProps,
  IMPACT_REVALIDATE_SECONDS,
  liveValues,
  moneySymbols,
  registryFacts,
  shortfallWei,
} from "@/pages/impact";
import { publicFact } from "@/components/claims/facts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test patches any snapshot field
const result = (patch: (s: Record<string, any>) => void = () => {}) => {
  const raw = JSON.parse(JSON.stringify(baseline));
  patch(raw);
  return { impact: normalizeImpact(raw)!, source: "api" as const };
};

describe("/impact", () => {
  it("lists every public claim with an anchor row", () => {
    const { container } = render(<ImpactPage impact={result()} />);
    for (const id of FACT_IDS) {
      const row = container.querySelector(`[data-claim-row="${id}"]`);
      expect([id, row?.id]).toEqual([id, id]);
      expect(row?.querySelector("[data-chip]")).not.toBeNull();
    }
  });

  it("shows future-tense empty states while nothing has been paid", () => {
    const { container } = render(<ImpactPage impact={result()} />);
    expect(
      container.querySelector('[data-testid="money-empty"]')?.textContent
    ).toContain("open soon");
    expect(
      container.querySelector('[data-testid="money-headline"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="rail-state"]')?.textContent
    ).toContain("Not open yet");
    expect(container.textContent).toContain(
      "No shelter outcomes published yet"
    );
    expect(container.textContent).toContain(
      "The purchase pledge has not started"
    );
  });

  it("shows money per currency with the custodial tier while Token Tails holds the key", () => {
    const impact = result((s) => {
      s.money.bySymbol = { USDC: "2500000000000000000" };
      s.money.byBucket = {
        heist: { USDC: "2000000000000000000" },
        page: { USDC: "500000000000000000" },
      };
      s.money.lastTxHash = "0x" + "1".repeat(64);
      s.asOf.chain = "2026-10-01T05:00:00.000Z";
    });
    const { container } = render(<ImpactPage impact={impact} />);
    const headline = container.querySelector(
      '[data-testid="money-headline"] [data-claim="L-disbursed"]'
    );
    expect(headline?.textContent).toContain(
      "Token Tails has sent 2.50 USDC to shelters"
    );
    expect(
      headline?.querySelector('[data-chip="onchain-custodial"]')?.textContent
    ).toBe("ON-CHAIN · CUSTODIAL");
    expect(
      container.querySelector('[data-testid="money-buckets"]')?.textContent
    ).toContain("2.00 USDC");

    const flipped = render(
      <ImpactPage
        impact={{
          ...impact,
          impact: {
            ...impact.impact,
            money: { ...impact.impact.money, custody: "handed-over" },
          },
        }}
      />
    );
    expect(
      flipped.container.querySelector(
        '[data-testid="money-headline"] [data-chip="onchain-shelter-held"]'
      )
    ).not.toBeNull();
  });

  it("says 'Not measured yet' for partner countries while the backfill has not run", () => {
    const empty = result();
    expect(empty.impact.shelters.countries).toEqual([]);
    expect(liveValues(publicFact("L-countries")!, empty.impact, false)).toBeNull();
    const { container } = render(<ImpactPage impact={empty} />);
    const row = container.querySelector('[data-claim-row="L-countries"]')!;
    expect(row.textContent).toContain("Not measured yet");
    expect(row.textContent).not.toContain("0 partner countries");
    const filled = result((s) => (s.shelters.countries = ["LT"]));
    expect(liveValues(publicFact("L-countries")!, filled.impact, false)?.values).toEqual({ n: 1 });
  });

  it("claims no custody while no money exists, and names only shelters with a custody arrangement", () => {
    const { container } = render(<ImpactPage impact={result()} />);
    const custody = container.querySelector("#custody")!;
    expect(custody.querySelector('[data-testid="custody-empty"]')?.textContent).toBe(
      "No money held yet. The first payout sets the tier."
    );
    expect(custody.querySelector("[data-chip]")).toBeNull();
    expect(custody.textContent).not.toMatch(/Pink Paw|Mil Bigotes|wallet key/);

    const funded = result((s) => {
      s.money.eventCount = 2;
      s.sources.chain = "ok";
      s.shelters.items = [
        { slug: "a", name: "Shelter A", countryCode: "LT", role: "partner", handoverStatus: "held-by-token-tails" },
        { slug: "b", name: "Shelter B", countryCode: null, role: null, handoverStatus: null },
      ];
    });
    const view = custodyView(funded.impact);
    expect(view.hasMoney).toBe(true);
    expect(view.partnerName).toBe("Shelter A");
    expect(view.shelters.map((s) => s.slug)).toEqual(["a"]);
    const page = render(<ImpactPage impact={funded} />).container.querySelector("#custody")!;
    expect(page.querySelector('[data-chip="onchain-custodial"]')).not.toBeNull();
    expect(page.textContent).toContain("wallet key for its partner shelter Shelter A");
    expect(page.textContent).not.toContain("Shelter B");
    expect(page.textContent).not.toContain("Pink Paw");

    // Money indexed but the chain reported not deployed: still no custody claim.
    expect(
      custodyView(result((s) => { s.money.eventCount = 2; s.sources.chain = "not-deployed"; }).impact).hasMoney
    ).toBe(false);
    // No partner role in the snapshot: generic wording.
    expect(custodyView(result((s) => { s.money.eventCount = 1; s.sources.chain = "ok"; }).impact).partnerName).toBeNull();
  });

  it("lists every non-zero currency in a fixed order in the L-disbursed row", () => {
    expect(
      moneySymbols({ ZED: "1", EURC: "2000000000000000000", USDC: "1000000000000000000", AAA: "0" }).map(([k]) => k)
    ).toEqual(["USDC", "EURC", "ZED"]);
    const impact = result((s) => {
      s.money.bySymbol = { EURC: "2000000000000000000", USDT: "0", USDC: "1000000000000000000" };
      s.asOf.chain = "2026-10-01T05:00:00.000Z";
    });
    const live = liveValues(publicFact("L-disbursed")!, impact.impact, false);
    expect(live?.values.amount).toBe("1.00 USDC · 2.00 EURC");
    expect(liveValues(publicFact("L-disbursed")!, result((s) => (s.money.bySymbol = { USDC: "0" })).impact, false)).toBeNull();
  });

  it("lists each outcome on a timeline and pledged vs paid per month with the shortfall", () => {
    const impact = result((s) => {
      s.outcomes = {
        published: 2,
        items: [
          { id: "o1", type: "treatment", date: "2026-09-12T00:00:00Z", animalName: "Mila", amountWei: "3000000000000000000", symbol: "USDC", tier: "shelter-confirmed", payoutTxHash: "0x" + "2".repeat(64) },
          { id: "o2", type: "adoption", date: "2026-09-20T00:00:00Z", animalName: "Tom" },
        ],
      };
      s.pledges = {
        status: "active",
        rows: [{ month: "2026-09", symbol: "USDC", pledgedWei: "10000000000000000000", paidWei: "4000000000000000000" }],
      };
    });
    const { container } = render(<ImpactPage impact={impact} />);
    const items = container.querySelectorAll('[data-testid="outcomes-timeline"] [data-outcome]');
    expect(Array.from(items).map((li) => li.getAttribute("data-outcome"))).toEqual(["o2", "o1"]);
    const mila = container.querySelector('[data-outcome="o1"]')!;
    expect(mila.textContent).toContain("Treatment");
    expect(mila.textContent).toContain("Mila");
    expect(mila.textContent).toContain("3.00 USDC");
    expect(mila.querySelector('[data-chip="shelter-confirmed"]')).not.toBeNull();
    const pledge = container.querySelector('[data-testid="pledge-table"]')!;
    expect(pledge.textContent).toContain("Sep 2026");
    expect(pledge.textContent).toContain("10.00 USDC");
    expect(pledge.textContent).toContain("4.00 USDC");
    expect(pledge.textContent).toContain("6.00 USDC");
    expect(shortfallWei({ month: "2026-09", symbol: "USDC", pledgedWei: "1", paidWei: "5" })).toBe("0");
  });

  it("shows F-025 with its registry words and the rail state beside it", () => {
    const { container } = render(<ImpactPage impact={result()} />);
    const now = container.querySelector('#now [data-claim="F-025"]')!;
    expect(now.querySelector(".claim-text")?.textContent).toBe("Now: Stellar NFTs");
    expect(now.textContent).not.toContain("Arc");
    expect(container.querySelector('#now [data-testid="rail-note"]')?.textContent).toContain(
      "Arc shelter rail opens soon"
    );
  });

  it("Paw settlements: future tense before the first one, no 'first settlement' wording after", () => {
    const before = render(<ImpactPage impact={result()} />);
    const paws = () => before.container.querySelector("#paws")!;
    expect(paws().textContent).toContain("The checker turns on when settlements start.");
    expect(paws().querySelector("textarea")?.getAttribute("placeholder")).toBe("Proofs arrive with the first nightly settlement");
    before.unmount();
    const after = render(
      <ImpactPage impact={result((s) => (s.pawSettlements = { count: 1, latest: { tx: "0x1" } }))} />
    );
    const section = after.container.querySelector("#paws")!;
    expect(section.textContent).not.toMatch(/when settlements start|first nightly settlement|will settle/);
    expect(section.textContent).toContain("Settlements have started; the checker is not switched on yet.");
    expect(section.querySelector("textarea")?.getAttribute("placeholder")).toBe("The paw proof checker opens soon");
  });

  it("puts the L-players chip after its qualifier", () => {
    const { container } = render(<ImpactPage impact={result()} />);
    const players = container.querySelector('#reach [data-claim="L-players"]')!;
    expect(players.textContent).toMatch(/players registered, all time, guests not counted · as of .*LIVE/);
  });

  it("app builds show USD with an FX date and no chain, explorer or wallet words", async () => {
    const impact = result((s) => {
      s.shelters.items = [
        { slug: "pink-paw", name: "Pink Paw", countryCode: "LT", partnerStatus: "active", role: "partner", handoverStatus: "held-by-token-tails" },
        { slug: "other", name: "Other Shelter", countryCode: "EE", partnerStatus: "active", role: "partner", handoverStatus: "handed-over" },
      ];
      s.money.bySymbol = { USDC: "2500000000000000000" };
      s.money.eventCount = 1;
      s.sources.chain = "ok";
      s.money.lastTxHash = "0x" + "1".repeat(64);
      s.asOf.chain = "2026-10-01T05:00:00.000Z";
    });
    let container!: HTMLElement;
    process.env.NEXT_PUBLIC_IS_APP = "true";
    try {
      // App builds refresh the baked snapshot on mount; the live data passed in is kept.
      await act(async () => {
        container = render(<ImpactPage impact={impact} />).container;
      });
    } finally {
      delete process.env.NEXT_PUBLIC_IS_APP;
    }
    const text = container.textContent ?? "";
    expect(text).toContain("$2.50 · FX 2026-10-01");
    expect(text).toContain("HELD BY TOKEN TAILS");
    expect(text).not.toMatch(
      /USDC|ON-CHAIN|explorer|wallet|\b(SEI|Stellar|Arc)\b|key held|holds its own key|Merkle|memo/i
    );
    expect(text).toContain("Pink Paw · Lithuania · held by Token Tails");
    expect(text).toContain("held by the shelter");
    expect(container.querySelector('a[href*="explorer"]')).toBeNull();
    // The snapshot has no payout time: the app says when it was checked (review 3f #4).
    expect(text).toContain("Recorded, checked 1 Oct 2026");
  });

  it("app builds list every claim they render in 'Every claim' (review 3f #2)", async () => {
    const impact = result((s) => {
      s.money.bySymbol = { USDC: "2500000000000000000" };
      s.money.eventCount = 1;
      s.sources.chain = "ok";
      s.treats.confirmedCount = 3;
      s.treats.totalConfirmedWei = "30000000000000000";
      s.asOf.chain = "2026-10-01T05:00:00.000Z";
    });
    let container!: HTMLElement;
    process.env.NEXT_PUBLIC_IS_APP = "true";
    try {
      await act(async () => {
        container = render(<ImpactPage impact={impact} />).container;
      });
    } finally {
      delete process.env.NEXT_PUBLIC_IS_APP;
    }
    const shown = new Set(
      Array.from(container.querySelectorAll("[data-claim]")).map((el) =>
        el.getAttribute("data-claim")
      )
    );
    expect(shown.has("L-disbursed")).toBe(true);
    expect(shown.has("L-treats")).toBe(true);
    for (const id of Array.from(shown)) {
      expect([id, container.querySelector(`[data-claim-row="${id}"]`)]).not.toEqual([id, null]);
    }
    // Entries whose words name a chain or USDC stay web only.
    const appIds = registryFacts(true).map((f) => f.id);
    expect(appIds).not.toContain("F-003");
    expect(appIds).not.toContain("F-025");
    expect(appIds).not.toContain("C-001");
    expect(appIds).toContain("C-004");
  });

  it.each([
    ["not-deployed", /open soon/],
    ["paused", /paused/],
    ["live", /Treats are open/],
    ["exhausted", /used up/],
  ])("words the empty money box for a %s rail like the rail section (review 3f #1)", (state, re) => {
    const { container } = render(
      <ImpactPage impact={result((s) => (s.rail.state = state))} />
    );
    const empty = container.querySelector('[data-testid="money-empty"]')?.textContent ?? "";
    expect(empty).toMatch(re);
    if (state !== "not-deployed") expect(empty).not.toMatch(/soon/);
  });

  it("does not claim zero off-chain payouts the snapshot does not track (review 3f #3)", () => {
    const { container } = render(<ImpactPage impact={result()} />);
    expect(container.textContent).toContain("Not tracked in this snapshot yet");
    expect(container.textContent).not.toContain("None recorded yet");
  });

  it("uses ISR every 600 s on the web and the baseline in app builds", async () => {
    resetImpactRateLimits();
    const original = global.fetch;
    global.fetch = jest.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    try {
      const web = (await getStaticProps({} as never)) as {
        revalidate?: number;
        props: { impact: { source: string } };
      };
      expect(IMPACT_REVALIDATE_SECONDS).toBe(600);
      expect(web.revalidate).toBe(600);
      expect(web.props.impact.source).toBe("baseline");
      process.env.NEXT_PUBLIC_IS_APP = "true";
      const app = (await getStaticProps({} as never)) as {
        revalidate?: number;
      };
      expect(app.revalidate).toBeUndefined();
    } finally {
      delete process.env.NEXT_PUBLIC_IS_APP;
      global.fetch = original;
    }
  });

  it("renders without any snapshot, then falls back to the baseline", async () => {
    const original = global.fetch;
    global.fetch = jest.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    try {
      let container!: HTMLElement;
      await act(async () => {
        container = render(<ImpactPage impact={null} />).container;
      });
      expect(
        container.querySelector('[data-testid="claim-registry"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="snapshot-meta"]')?.textContent
      ).toMatch(/Bundled snapshot|Development snapshot/);
    } finally {
      global.fetch = original;
    }
  });
});
