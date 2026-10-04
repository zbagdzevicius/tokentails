/**
 * @jest-environment jsdom
 */
/**
 * The Pink Paw goal meter (fact C-001, 50,000 USDC, everything that reaches the shelter wallet) and
 * the shared cat gallery, as /shelter-payouts, /give and /impact render them.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import campaignJson from "@/public/shelter-payouts/campaign.json";
import { campaignProgress, parseCampaign, usdcTo18 } from "@/components/shelter-payouts/campaign";

const mockStorefront = { cats: {} as Record<string, unknown[]>, isLoading: false, failure: null as unknown };
jest.mock("@/hooks/useStorefront", () => ({ useStorefront: () => mockStorefront }));
jest.mock("@/api/api", () => ({ apiUrl: "https://api.test" }));
const mockFetch = jest.fn();
(globalThis as { fetch?: unknown }).fetch = mockFetch;
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { CampaignMeter, usdcFigure } from "@/components/shelter-payouts/CampaignMeter";
import { GALLERY_PAGE, PinkPawGallery, resetPinkPawGalleryCache } from "@/components/shelter-payouts/PinkPawGallery";
import { HOW_IT_WORKS, HowItWorks } from "@/components/shelter-payouts/payoutSections";

const campaign = parseCampaign(campaignJson);
const usdc = (n: string) => usdcTo18(n);

describe("CampaignMeter", () => {
  it("shows what reached the wallet against 50,000 USDC, the share and the goal date", () => {
    const progress = campaignProgress(campaign, { raised: usdc("1234.5"), exact: true });
    render(<CampaignMeter campaign={campaign} progress={progress} state="ok" />);
    expect(screen.getByTestId("campaign-meter-value").textContent).toBe("1,234.5of the 50,000 USDC goal for Pink Paw");
    expect(screen.getByTestId("campaign-meter-percent").textContent).toBe("2.46% of the goal");
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("2.46");
    expect(screen.getByTestId("campaign-meter").textContent).toContain("Goal date: 30 September 2027");
    // Today only treats can reach the wallet Token Tails holds: the copy never names the rest as counting.
    const sources = screen.getByTestId("campaign-meter-sources").textContent!;
    expect(sources).toMatch(/comes in to the wallet Token Tails holds for Pink Paw on Arc mainnet: today, sponsored treats\./);
    expect(sources).toMatch(/Gifts, the match and x402 payments count once Pink Paw holds its own wallet/);
    expect(sources).not.toMatch(/shop shares/);
    expect(screen.getByTestId("campaign-meter").getAttribute("data-claim")).toBe("C-001");
  });

  it("never shows 0 for a wallet it could not read", () => {
    render(<CampaignMeter campaign={campaign} progress={campaignProgress(campaign, null)} state="error" />);
    expect(screen.getByTestId("campaign-meter-value").textContent).toMatch(/^\?of/);
    expect(screen.getByTestId("campaign-meter-unread")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
  });

  it("lists shop shares only when the backend reports them live, and the handed-over wording", () => {
    const shares = campaignProgress(campaign, { raised: usdc("1"), exact: true }, ["treats", "purchase-shares"]);
    const { unmount } = render(<CampaignMeter campaign={campaign} progress={shares} state="ok" />);
    expect(screen.getByTestId("campaign-meter-sources").textContent).toMatch(/today, sponsored treats and shop shares\./);
    unmount();
    const handed = parseCampaign({ ...campaignJson, shelter: { ...campaignJson.shelter, handover: "handed-over" }, wallets: [{ ...campaignJson.wallets[0], holder: "shelter" }] });
    render(<CampaignMeter campaign={handed} progress={campaignProgress(handed, { raised: usdc("1"), exact: true })} state="ok" />);
    expect(screen.getByTestId("campaign-meter-sources").textContent).toMatch(
      /Pink Paw's wallets on Arc mainnet: gifts from people, Token Tails' match, sponsored treats and x402 payments\. Money moved between Pink Paw's own wallets counts once, and spending never lowers it\./
    );
  });

  it('says "at least" while the count is still catching up', () => {
    const progress = campaignProgress(campaign, { raised: usdc("10"), exact: false });
    render(<CampaignMeter campaign={campaign} progress={progress} state="ok" compact />);
    expect(screen.getByTestId("campaign-meter-value").textContent).toMatch(/^at least 10of/);
    expect(screen.getByTestId("campaign-meter-floor")).toBeTruthy();
  });

  it("shows a plain cream stub at 0 and the pink-gold fill only once money came in", () => {
    const { unmount } = render(<CampaignMeter campaign={campaign} progress={campaignProgress(campaign, { raised: BigInt(0), exact: true })} state="ok" />);
    expect(screen.getByTestId("campaign-meter-fill").className).toMatch(/bg-tt-cream\/35/);
    expect(screen.getByTestId("campaign-meter-fill").className).not.toMatch(/from-tt-pink/);
    unmount();
    render(<CampaignMeter campaign={campaign} progress={campaignProgress(campaign, { raised: usdc("1"), exact: true })} state="ok" />);
    expect(screen.getByTestId("campaign-meter-fill").className).toMatch(/from-tt-pink/);
  });

  it("formats figures with separators", () => {
    expect(usdcFigure(usdc("50000"))).toBe("50,000");
    expect(usdcFigure(usdc("0.105"))).toBe("0.1");
  });
});

const id = (n: number) => n.toString(16).padStart(24, "0");
const storeCat = (n: number, status: string) => ({
  _id: id(n),
  name: `cat${String(n).padStart(3, "0")}`,
  blessing: { name: `cat${String(n).padStart(3, "0")}`, status, image: { url: `https://cdn/${n}-p.webp` }, catAvatar: { url: `https://cdn/${n}-a.webp` } },
});

const pub = (n: number, status: string) => ({
  id: id(n),
  name: `Cat${String(n).padStart(3, "0")}`,
  status,
  art: `https://cdn/${n}-a.webp`,
  photo: `https://cdn/${n}-p.webp`,
});

describe("PinkPawGallery: the storefront fallback (the gallery endpoint does not answer)", () => {
  beforeEach(() => {
    resetPinkPawGalleryCache();
    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error("offline"));
    mockStorefront.isLoading = false;
    mockStorefront.failure = null;
    mockStorefront.cats = {
      "rozine-pedute": [
        ...Array.from({ length: 20 }, (_, i) => storeCat(i + 1, i === 2 ? "RECOVERING" : "WAITING")),
        storeCat(100, "ADOPTED"),
        storeCat(101, "HEAVEN"),
      ],
    };
  });

  it("shows every cat at the shelter as card + photo pairs with Meet links, a page at a time", async () => {
    render(<PinkPawGallery />);
    await screen.findByTestId("pink-paw-gallery");
    expect(screen.getByTestId("pink-paw-tab-atShelter").textContent).toBe("At the shelter 20");
    expect(screen.getByTestId("pink-paw-tab-adopted").textContent).toBe("Adopted 1");
    expect(screen.getAllByTestId("pink-paw-pair")).toHaveLength(GALLERY_PAGE);
    const first = screen.getAllByTestId("pink-paw-pair-link")[0];
    expect(first.getAttribute("href")).toBe(`/cats/${id(1)}`);
    expect(first.textContent).toContain("Meet Cat001 ›");
    // The card art opens the same page and carries the "open" badge (md); only the first one pings.
    const pair = screen.getAllByTestId("pink-paw-pair")[0];
    const card = screen.getByRole("link", { name: "Meet Cat001" });
    expect(card.getAttribute("href")).toBe(`/cats/${id(1)}`);
    expect(card.querySelector('[data-card-action-badge="md"]')).not.toBeNull();
    expect(pair.querySelectorAll("[data-card-action-ping]")).toHaveLength(1);
    expect(screen.getAllByTestId("pink-paw-pair")[1].querySelector("[data-card-action-ping]")).toBeNull();
    const imgs = pair.querySelectorAll("img");
    expect([imgs[0].getAttribute("src"), imgs[1].getAttribute("src")]).toEqual(["https://cdn/1-a.webp", "https://cdn/1-p.webp"]);
    expect(screen.getByText("Recovering")).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByTestId("pink-paw-more"));
    });
    expect(screen.getAllByTestId("pink-paw-pair")).toHaveLength(20);
    expect(screen.queryByTestId("pink-paw-more")).toBeNull();
  });

  it("switches to adopted cats and never shows a cat in HEAVEN", async () => {
    render(<PinkPawGallery />);
    await screen.findByTestId("pink-paw-gallery");
    act(() => {
      fireEvent.click(screen.getByTestId("pink-paw-tab-adopted"));
    });
    expect(screen.getAllByTestId("pink-paw-pair")).toHaveLength(1);
    expect(screen.getAllByText("Adopted").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Cat101/);
  });

  it("has a loading and an empty state", async () => {
    mockStorefront.cats = {};
    mockStorefront.isLoading = true;
    const { rerender } = render(<PinkPawGallery />);
    expect(screen.getByTestId("pink-paw-gallery-loading")).toBeTruthy();
    await act(async () => undefined);
    mockStorefront.isLoading = false;
    mockStorefront.failure = new Error("down");
    rerender(<PinkPawGallery />);
    expect(screen.getByTestId("pink-paw-gallery-empty").textContent).toMatch(/could not be loaded/);
  });

  it("never presents the storefront's newest 200 as the shelter's totals", async () => {
    mockStorefront.cats = { "rozine-pedute": Array.from({ length: 200 }, (_, i) => storeCat(i + 1, i < 120 ? "WAITING" : "ADOPTED")) };
    render(<PinkPawGallery />);
    const g = await screen.findByTestId("pink-paw-gallery");
    expect(g.getAttribute("data-complete")).toBe("false");
    expect(screen.getByTestId("pink-paw-tab-atShelter").textContent).toBe("At the shelter");
    expect(screen.getByTestId("pink-paw-count").textContent).toBe(`Showing ${GALLERY_PAGE} of the newest 120`);
  });

  it("opens on the first tab that has cats", async () => {
    mockStorefront.cats = { "rozine-pedute": [storeCat(7, "ADOPTED"), storeCat(8, "ADOPTED")] };
    render(<PinkPawGallery />);
    await screen.findByTestId("pink-paw-gallery");
    expect(screen.queryByTestId("pink-paw-tab-atShelter")).toBeNull();
    expect(screen.getByTestId("pink-paw-tab-adopted").getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByTestId("pink-paw-pair")).toHaveLength(2);
    expect(screen.getByTestId("pink-paw-count").textContent).toBe("Showing 2 of 2");
  });
});

describe("PinkPawGallery: the uncapped gallery endpoint", () => {
  beforeEach(() => {
    resetPinkPawGalleryCache();
    mockFetch.mockReset();
    mockStorefront.isLoading = false;
    mockStorefront.failure = null;
    // The storefront holds only its newest 200; the endpoint has all 260.
    mockStorefront.cats = { "rozine-pedute": Array.from({ length: 200 }, (_, i) => storeCat(i + 1, "WAITING")) };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "rozine-pedute",
        atShelter: Array.from({ length: 150 }, (_, i) => pub(i + 1, i === 0 ? "RECOVERING" : "WAITING")),
        adopted: Array.from({ length: 110 }, (_, i) => pub(500 + i, "ADOPTED")),
        truncated: false,
      }),
    });
  });

  it("reads GET /shelter/rozine-pedute/gallery and shows the shelter's real totals", async () => {
    render(<PinkPawGallery />);
    const g = await screen.findByTestId("pink-paw-gallery");
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.test/shelter/rozine-pedute/gallery");
    expect(g.getAttribute("data-source")).toBe("gallery");
    expect(g.getAttribute("data-complete")).toBe("true");
    expect(screen.getByTestId("pink-paw-tab-atShelter").textContent).toBe("At the shelter 150");
    expect(screen.getByTestId("pink-paw-tab-adopted").textContent).toBe("Adopted 110");
    expect(screen.getByTestId("pink-paw-count").textContent).toBe(`Showing ${GALLERY_PAGE} of 150`);
  });

  it("hides the counts when the backend says its list was cut", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ atShelter: [pub(1, "WAITING")], adopted: [], truncated: true }) });
    render(<PinkPawGallery />);
    expect((await screen.findByTestId("pink-paw-gallery")).getAttribute("data-complete")).toBe("false");
  });
});

describe("HowItWorks (shared by /shelter-payouts and /impact)", () => {
  it("lists every step, ending with what the goal counts", () => {
    render(<HowItWorks />);
    expect(screen.getAllByRole("listitem")).toHaveLength(HOW_IT_WORKS.length);
    expect(HOW_IT_WORKS[HOW_IT_WORKS.length - 1]).toMatch(/counts toward its goal/);
  });

  it("never says in the present tense that a treat goes out (true while the rail is soon, paused or used up)", () => {
    const treat = HOW_IT_WORKS.find((s) => /small treat/.test(s))!;
    expect(treat).toMatch(/while treats are open/);
    expect(treat).not.toMatch(/^Tap the rescue treat and Token Tails sends/);
  });
});

describe("PinkPawGallery: Lithuanian names", () => {
  beforeEach(() => {
    resetPinkPawGalleryCache();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ atShelter: [{ ...pub(1, "WAITING"), name: "Ankštė" }, pub(2, "WAITING")], adopted: [], truncated: false }),
    });
  });

  it("sets a name the display face cannot draw in the body face, a size down", async () => {
    render(<PinkPawGallery />);
    const lt = await screen.findByText(/Meet Ankštė/);
    expect(lt.className).toMatch(/font-sans/);
    expect(lt.className).toMatch(/text-p6/);
    const plain = screen.getByText(/Meet Cat002/);
    expect(plain.className).toMatch(/font-primary/);
    expect(plain.className).toMatch(/text-p5/);
  });
});
