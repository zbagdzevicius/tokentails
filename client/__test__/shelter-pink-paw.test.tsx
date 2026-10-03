/**
 * @jest-environment jsdom
 */
/**
 * Pink Paw on the payout pages: which real cats the showcase picks, how their names and photos
 * are labelled, and the night footer those pages end on.
 */
import { render, screen } from "@testing-library/react";
import { BlessingStatus, ICat } from "@/models/cats";
import {
  catName,
  headingName,
  isPinkPawWallet,
  pickShowcaseCats,
  photoAlt,
  PINK_PAW_LOGO_ALT,
  PINK_PAW_WALLET,
} from "@/components/shelter-payouts/pinkPaw";

jest.mock("@/components/shared/AnalyticsConsentBanner", () => ({
  AnalyticsSettingsLink: () => null,
}));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text }: { text: string }) => <span>{text}</span>,
}));
// The real card needs the full cat model; here only what the row passes it matters.
jest.mock("@/components/tailsCard/TailsCard", () => ({
  TailsCard: ({ cat }: { cat: { name: string } }) => <div data-testid="tails-card">{cat.name}</div>,
}));

import { Footer } from "@/layouts/Footer";
import { PinkPawCards, PinkPawIdentity, PinkPawLogo, PinkPawPhotos } from "@/components/shelter-payouts/PinkPawShowcase";

const cat = (id: string, status?: BlessingStatus, art = true, name = id): ICat =>
  ({
    _id: id,
    name,
    type: "FAIRY",
    tier: "COMMON",
    blessing: art
      ? { _id: `b${id}`, name, description: "", status, image: { url: `https://cdn/${id}.webp` }, catAvatar: { url: `https://cdn/${id}-a.webp` } }
      : undefined,
  }) as unknown as ICat;

describe("pickShowcaseCats", () => {
  const cats = [
    cat("a", BlessingStatus.ADOPTED),
    cat("h", BlessingStatus.HEAVEN),
    cat("w1", BlessingStatus.WAITING),
    cat("x", BlessingStatus.WAITING, false),
    cat("r", BlessingStatus.RECOVERING),
    cat("w2", BlessingStatus.WAITING),
  ];

  it("never shows a cat in HEAVEN or one without a photo and card art", () => {
    const ids = pickShowcaseCats(cats, 10, 0).map((c) => c._id);
    expect(ids).not.toContain("h");
    expect(ids).not.toContain("x");
    expect(ids).toHaveLength(4);
  });

  it("puts the shelter's current cats before adopted ones", () => {
    const ids = pickShowcaseCats(cats, 4, 0).map((c) => c._id);
    expect(ids.slice(0, 3).sort()).toEqual(["r", "w1", "w2"]);
    expect(ids[3]).toBe("a");
  });

  it("rotates once a day and is stable within a day", () => {
    expect(pickShowcaseCats(cats, 1, 7)).toEqual(pickShowcaseCats(cats, 1, 7));
    const days = new Set([0, 1, 2].map((d) => pickShowcaseCats(cats, 1, d)[0]._id));
    expect(days.size).toBe(3);
  });

  it("handles no data", () => {
    expect(pickShowcaseCats(undefined, 3)).toEqual([]);
    expect(pickShowcaseCats(cats, 0)).toEqual([]);
  });
});

describe("names and alt text", () => {
  it("capitalises the shelter's names", () => {
    expect(catName(cat("judas"))).toBe("Judas");
    expect(catName(cat("RAUDVIS"))).toBe("Raudvis");
    expect(catName(cat("Kapučino"))).toBe("Kapučino");
  });

  it("describes each real photo and the logo", () => {
    const picked = pickShowcaseCats([cat("w1", BlessingStatus.WAITING, true, "juju")], 1, 0);
    render(
      <>
        <PinkPawLogo />
        <PinkPawPhotos cats={picked} />
      </>
    );
    expect(screen.getByAltText(PINK_PAW_LOGO_ALT)).toBeTruthy();
    const photo = screen.getByAltText(photoAlt("Juju")) as HTMLImageElement;
    expect(photo.src).toBe("https://cdn/w1.webp");
  });
});

describe("Pink Paw identity and gating", () => {
  it("matches only Pink Paw's wallet, in any letter case", () => {
    expect(isPinkPawWallet(PINK_PAW_WALLET.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(isPinkPawWallet("0x1111111111111111111111111111111111111111")).toBe(false);
    expect(isPinkPawWallet(null)).toBe(false);
  });

  it("keeps display headings to the English name and puts the Lithuanian one in the body font", () => {
    expect(headingName("Pink Paw (Rožinė pėdutė)")).toBe("Pink Paw");
    expect(headingName("Other shelter")).toBe("Other shelter");
    render(<PinkPawIdentity name="Pink Paw (Rožinė pėdutė)" />);
    const h3 = screen.getByRole("heading", { level: 3 });
    expect(h3.querySelector(".font-primary")!.textContent).toBe("Pink Paw");
    const local = screen.getByTestId("pink-paw-local-name");
    expect(local.textContent).toBe("Rožinė pėdutė");
    expect(local.getAttribute("lang")).toBe("lt");
    expect(local.className).not.toMatch(/font-primary|font-secondary|font-display/);
  });
});

describe("PinkPawCards", () => {
  it("hides the card art from screen readers, clips its effects and stops its motion when asked", () => {
    const picked = pickShowcaseCats([cat("w1", BlessingStatus.WAITING, true, "sarena")], 1, 0);
    render(<PinkPawCards cats={picked} />);
    const art = screen.getByTestId("pink-paw-card-art");
    expect(art.getAttribute("aria-hidden")).toBe("true");
    expect(art.className).toMatch(/overflow-hidden/);
    expect(art.className).toMatch(/motion-reduce:\[&_\*\]:!animate-none/);
    expect(screen.getByText("Meet Sarena ›")).toBeTruthy();
    // The card art gets the same capitalised name as the caption.
    expect(screen.getByTestId("tails-card").textContent).toBe("Sarena");
  });
});

describe("Footer tone", () => {
  it("renders the night footer with the same links", () => {
    render(<Footer tone="night" />);
    const footer = screen.getByTestId("site-footer");
    expect(footer.getAttribute("data-tone")).toBe("night");
    // No flat band over the galaxy: a transparent fade and a gold divider.
    expect(footer.className).not.toMatch(/\bbg-tt-night-950\b/);
    for (const t of ["BLOG", "CATS", "PAYOUTS", "IMPACT", "T&C", "Privacy Policy"]) expect(screen.getByText(t)).toBeTruthy();
  });

  it("keeps the cream footer by default", () => {
    const { container } = render(<Footer />);
    expect(container.querySelector("[data-tone=night]")).toBeNull();
    expect(container.querySelector("footer")!.className).toMatch(/bg-tt-cream/);
  });
});
